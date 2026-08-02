// Tests for requireAuth in js/auth.js — the gate every signed-in page runs
// through. Covers the localStorage fast path, the broken-signup repair, the
// unverified-email redirect, and the watchdog that stops a page hanging blank
// when Firebase auth never calls back.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const onAuth = vi.fn();
const getProfile = vi.fn();
const repairProfile = vi.fn();

vi.mock('../js/firebase.js', () => ({
  onAuth: (...a) => onAuth(...a),
  getProfile: (...a) => getProfile(...a),
  repairProfile: (...a) => repairProfile(...a),
  ROOT: 'https://paperbackd.test/',
}));

import { requireAuth } from '../js/auth.js';

let store;
let replace;
let off;

// Hands back the callback requireAuth registered with onAuth.
const authCallback = () => onAuth.mock.calls[0][0];

// Lets queued promise jobs run.
const flush = () => new Promise(r => setImmediate(r));

const VERIFIED = { uid: 'u1', email: 'iain@example.com', emailVerified: true };

beforeEach(() => {
  store = new Map();
  global.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  replace = vi.fn();
  global.window = { location: { replace } };

  off = vi.fn();
  onAuth.mockReset().mockImplementation(() => off);
  getProfile.mockReset().mockResolvedValue({ username: 'iain', displayName: 'Iain' });
  repairProfile.mockReset().mockResolvedValue({ username: 'repaired' });
});

afterEach(() => {
  vi.useRealTimers();
  delete global.localStorage;
  delete global.window;
});

// ── Subscription mechanics ────────────────────────────────────────────────────

describe('requireAuth — subscription', () => {
  it('subscribes to auth state', () => {
    requireAuth();
    expect(onAuth).toHaveBeenCalledTimes(1);
  });

  it('returns a promise', () => {
    expect(requireAuth()).toBeInstanceOf(Promise);
  });

  it('unsubscribes once auth resolves', async () => {
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('ignores a second auth callback', async () => {
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    getProfile.mockClear();
    await authCallback()(VERIFIED);
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('unsubscribes exactly once even if called again', async () => {
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    await authCallback()(VERIFIED);
    expect(off).toHaveBeenCalledTimes(1);
  });
});

// ── Signed out ────────────────────────────────────────────────────────────────

describe('requireAuth — signed out', () => {
  it('redirects to the login page', async () => {
    requireAuth();
    await authCallback()(null);
    expect(replace).toHaveBeenCalledWith('https://paperbackd.test/login/');
  });

  it('clears the cached profile', async () => {
    store.set('rl_profile', JSON.stringify({ uid: 'u1', username: 'iain' }));
    requireAuth();
    await authCallback()(null);
    expect(store.has('rl_profile')).toBe(false);
  });

  it('does not fetch a profile', async () => {
    requireAuth();
    await authCallback()(null);
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('treats undefined the same as null', async () => {
    requireAuth();
    await authCallback()(undefined);
    expect(replace).toHaveBeenCalledWith('https://paperbackd.test/login/');
  });
});

// ── Unverified email ──────────────────────────────────────────────────────────

describe('requireAuth — unverified email', () => {
  it('redirects with the unverified flag', async () => {
    requireAuth();
    await authCallback()({ uid: 'u1', email: 'x@example.com', emailVerified: false });
    expect(replace).toHaveBeenCalledWith('https://paperbackd.test/login/?unverified=1');
  });

  it('does not fetch a profile', async () => {
    requireAuth();
    await authCallback()({ uid: 'u1', email: 'x@example.com', emailVerified: false });
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('lets username-only accounts through without verification', async () => {
    // Accounts created without an email get a synthetic @readinglog.local
    // address that can never be verified.
    const p = requireAuth();
    await authCallback()({ uid: 'u1', email: 'iain@readinglog.local', emailVerified: false });
    await expect(p).resolves.toMatchObject({ profile: { username: 'iain' } });
  });

  it('redirects an account with no email at all', async () => {
    requireAuth();
    await authCallback()({ uid: 'u1', emailVerified: false });
    expect(replace).toHaveBeenCalledWith('https://paperbackd.test/login/?unverified=1');
  });

  it('allows a verified account regardless of domain', async () => {
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await expect(p).resolves.toMatchObject({ user: VERIFIED });
  });
});

// ── Cached profile fast path ──────────────────────────────────────────────────

describe('requireAuth — cached profile', () => {
  const cache = (v) => store.set('rl_profile', JSON.stringify(v));

  it('resolves from cache without awaiting a fetch', async () => {
    cache({ uid: 'u1', username: 'iain', displayName: 'Cached' });
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await expect(p).resolves.toMatchObject({ profile: { username: 'iain', displayName: 'Cached' } });
  });

  it('refreshes the profile in the background', async () => {
    cache({ uid: 'u1', username: 'iain' });
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    await flush();
    expect(getProfile).toHaveBeenCalledWith('u1');
  });

  it('updates the cache with fresh data', async () => {
    cache({ uid: 'u1', username: 'iain', displayName: 'Stale' });
    getProfile.mockResolvedValue({ username: 'iain', displayName: 'Fresh' });
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    await flush();
    expect(JSON.parse(store.get('rl_profile')).displayName).toBe('Fresh');
  });

  it('keeps the uid in the refreshed cache entry', async () => {
    cache({ uid: 'u1', username: 'iain' });
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    await flush();
    expect(JSON.parse(store.get('rl_profile')).uid).toBe('u1');
  });

  it('does not overwrite the cache when the refresh returns no username', async () => {
    cache({ uid: 'u1', username: 'iain' });
    getProfile.mockResolvedValue({ displayName: 'No username' });
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    await flush();
    expect(JSON.parse(store.get('rl_profile')).username).toBe('iain');
  });

  it('survives a failed background refresh', async () => {
    cache({ uid: 'u1', username: 'iain' });
    getProfile.mockRejectedValue(new Error('offline'));
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await expect(p).resolves.toBeTruthy();
    await flush();
  });

  it('ignores a cache entry belonging to a different uid', async () => {
    cache({ uid: 'someone-else', username: 'other' });
    getProfile.mockResolvedValue({ username: 'iain' });
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await expect(p).resolves.toMatchObject({ profile: { username: 'iain' } });
  });

  it('ignores a cache entry with no username', async () => {
    cache({ uid: 'u1' });
    getProfile.mockResolvedValue({ username: 'iain' });
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await expect(p).resolves.toMatchObject({ profile: { username: 'iain' } });
  });

  it('falls through to a full fetch on corrupt JSON', async () => {
    store.set('rl_profile', '{not json');
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await expect(p).resolves.toMatchObject({ profile: { username: 'iain' } });
  });

  it('does not throw on corrupt JSON', async () => {
    store.set('rl_profile', 'null');
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await expect(p).resolves.toBeTruthy();
  });
});

// ── Cold path ─────────────────────────────────────────────────────────────────

describe('requireAuth — no cache', () => {
  it('fetches the profile', async () => {
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    expect(getProfile).toHaveBeenCalledWith('u1');
  });

  it('resolves with user and profile', async () => {
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await expect(p).resolves.toEqual({
      user: VERIFIED, profile: { username: 'iain', displayName: 'Iain' },
    });
  });

  it('writes the profile to the cache', async () => {
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    expect(JSON.parse(store.get('rl_profile'))).toEqual({
      uid: 'u1', username: 'iain', displayName: 'Iain',
    });
  });

  it('repairs a missing profile', async () => {
    getProfile.mockResolvedValue(null);
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    expect(repairProfile).toHaveBeenCalledWith(VERIFIED);
  });

  it('repairs a profile with no username', async () => {
    getProfile.mockResolvedValue({ displayName: 'Iain' });
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    expect(repairProfile).toHaveBeenCalled();
  });

  it('resolves with the repaired profile', async () => {
    getProfile.mockResolvedValue(null);
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await expect(p).resolves.toMatchObject({ profile: { username: 'repaired' } });
  });

  it('caches the repaired profile', async () => {
    getProfile.mockResolvedValue(null);
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    expect(JSON.parse(store.get('rl_profile')).username).toBe('repaired');
  });

  it('does not repair a healthy profile', async () => {
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    expect(repairProfile).not.toHaveBeenCalled();
  });

  it('rejects when the profile fetch fails', async () => {
    getProfile.mockRejectedValue(new Error('firestore down'));
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await expect(p).rejects.toThrow('firestore down');
  });

  it('rejects when repair fails', async () => {
    getProfile.mockResolvedValue(null);
    repairProfile.mockRejectedValue(new Error('repair failed'));
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await expect(p).rejects.toThrow('repair failed');
  });
});

// ── Watchdog ──────────────────────────────────────────────────────────────────

describe('requireAuth — watchdog', () => {
  it('redirects to login if auth never fires', async () => {
    vi.useFakeTimers();
    requireAuth();
    await vi.advanceTimersByTimeAsync(10000);
    expect(replace).toHaveBeenCalledWith('https://paperbackd.test/login/');
  });

  it('does not fire before 10 seconds', async () => {
    vi.useFakeTimers();
    requireAuth();
    await vi.advanceTimersByTimeAsync(9999);
    expect(replace).not.toHaveBeenCalled();
  });

  it('is cancelled once auth resolves', async () => {
    vi.useFakeTimers();
    const p = requireAuth();
    await authCallback()(VERIFIED);
    await p;
    replace.mockClear();
    await vi.advanceTimersByTimeAsync(30000);
    expect(replace).not.toHaveBeenCalled();
  });

  it('blocks a late auth callback from resolving', async () => {
    vi.useFakeTimers();
    requireAuth();
    await vi.advanceTimersByTimeAsync(10000);
    getProfile.mockClear();
    await authCallback()(VERIFIED);
    expect(getProfile).not.toHaveBeenCalled();
  });
});
