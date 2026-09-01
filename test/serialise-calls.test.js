// Serialising saves.
//
// The library's read editor had a queue wrapper written so two saves could never
// be in flight at once — "whichever Firestore write lands last wins regardless of
// which one started with fresher data". Nothing called it: the one save path went
// straight at the unwrapped function and bypassed the queue entirely. ESLint's
// no-unused-vars is what surfaced it.
//
// Reconnecting it as written would have been worse than leaving it disconnected,
// which is what the third test here is about.

import { describe, it, expect, vi } from 'vitest';
import { serialiseCalls } from '../js/utils.js';

// A job that reports when it starts and finishes, so overlap is observable.
function tracker() {
  const log = [];
  let n = 0;
  const make = ({ fail = false, ms = 0 } = {}) => {
    const id = ++n;
    return () => {
      log.push(`start${id}`);
      return new Promise((resolve, reject) => setTimeout(() => {
        log.push(`end${id}`);
        fail ? reject(new Error(`boom${id}`)) : resolve(id);
      }, ms));
    };
  };
  return { log, make };
}

describe('serialiseCalls', () => {
  it('runs one call at a time, in order', async () => {
    const { log, make } = tracker();
    const a = make({ ms: 20 }), b = make({ ms: 1 });
    const queued = serialiseCalls(job => job());
    await Promise.all([queued(a), queued(b)]);
    // Without the queue this would interleave: start1, start2, end2, end1.
    expect(log).toEqual(['start1', 'end1', 'start2', 'end2']);
  });

  it('passes the result back to the caller', async () => {
    const queued = serialiseCalls(async x => x * 2);
    expect(await queued(21)).toBe(42);
  });

  it('delivers a failure to the caller that caused it', async () => {
    const queued = serialiseCalls(async () => { throw new Error('nope'); });
    await expect(queued()).rejects.toThrow('nope');
  });

  it('still runs the next call after one fails', async () => {
    // The bug the original wrapper had. It chained the next call off a rejected
    // queue, so the failure handler ran *instead of* the next save — Save would
    // report success having written nothing.
    const { log, make } = tracker();
    const bad = make({ fail: true }), good = make();
    const queued = serialiseCalls(job => job());

    await expect(queued(bad)).rejects.toThrow('boom1');
    await queued(good);

    expect(log).toEqual(['start1', 'end1', 'start2', 'end2']);
  });

  it('survives a run of failures without wedging', async () => {
    const queued = serialiseCalls(async ok => { if (!ok) throw new Error('x'); return 'done'; });
    for (let i = 0; i < 3; i++) await expect(queued(false)).rejects.toThrow('x');
    await expect(queued(true)).resolves.toBe('done');
  });

  it('does not let one caller see another caller\'s failure', async () => {
    const { make } = tracker();
    const bad = make({ fail: true }), good = make();
    const queued = serialiseCalls(job => job());
    const first = queued(bad);
    const second = queued(good);
    await expect(first).rejects.toThrow('boom1');
    await expect(second).resolves.toBe(2);
  });

  it('reports a failure to onError, for callers that never await', async () => {
    // A fire-and-forget save would otherwise fail in total silence.
    const onError = vi.fn();
    const queued = serialiseCalls(async () => { throw new Error('quiet'); }, onError);
    queued().catch(() => {});
    await new Promise(r => setTimeout(r, 0));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('quiet');
  });

  it('works with no onError given', async () => {
    const queued = serialiseCalls(async () => { throw new Error('x'); });
    await expect(queued()).rejects.toThrow('x');
    // And the queue is still usable afterwards.
    const ok = serialiseCalls(async () => 'fine');
    await expect(ok()).resolves.toBe('fine');
  });

  it('forwards every argument', async () => {
    const queued = serialiseCalls(async (...args) => args);
    expect(await queued(1, 'two', null)).toEqual([1, 'two', null]);
  });

  it('gives each wrapped function its own queue', async () => {
    const { log, make } = tracker();
    const slow = make({ ms: 20 }), fast = make({ ms: 1 });
    const one = serialiseCalls(job => job());
    const two = serialiseCalls(job => job());
    await Promise.all([one(slow), two(fast)]);
    // Independent queues, so these are free to overlap.
    expect(log).toEqual(['start1', 'start2', 'end2', 'end1']);
  });
});
