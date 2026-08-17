// How many book spines fit a list card.
//
// The stack overlaps, so the arithmetic is not width/spineWidth: the first
// spine costs its full width and every one after costs only the visible sliver.
// Getting it wrong overflows the card, which the card does not clip — the
// spines simply run past its edge.

import { describe, it, expect } from 'vitest';
import { spineCapacity, compareLists, moveInArray } from '../js/utils.js';

// The values in the stylesheet: 30px wide, pulled 9px over each other.
const W = 30, OVER = 9;
const fit = width => spineCapacity(width, W, OVER);

// Width the browser will actually need for n spines.
const widthFor = n => W + (n - 1) * (W - OVER);

describe('spineCapacity', () => {
  it('fits exactly one at exactly one spine wide', () => {
    expect(fit(W)).toBe(1);
  });

  it('needs a full step before it fits another', () => {
    // 50px is not enough for two: the second costs 21, not 30.
    expect(fit(50)).toBe(1);
    expect(fit(51)).toBe(2);
  });

  it('never claims more than actually fits', () => {
    for (let width = 30; width <= 600; width++) {
      expect(widthFor(fit(width))).toBeLessThanOrEqual(width);
    }
  });

  it('claims as many as fit, never one fewer', () => {
    for (let width = 30; width <= 600; width++) {
      expect(widthFor(fit(width) + 1)).toBeGreaterThan(width);
    }
  });

  it('grows with the viewport', () => {
    expect(fit(600)).toBeGreaterThan(fit(300));
    expect(fit(300)).toBeGreaterThan(fit(150));
  });

  it('matches the old fixed six at about the width that used to hold six', () => {
    expect(fit(widthFor(6))).toBe(6);
  });

  it('returns one rather than zero for a card too narrow to hold any', () => {
    // An empty strip looks broken; a clipped spine does not.
    expect(fit(10)).toBe(1);
    expect(fit(0)).toBe(1);
  });

  it('survives being called before layout, when width reads as zero', () => {
    // clientWidth is 0 until the browser has laid the card out, and this runs
    // on a rAF that can fire before that in an unattached container.
    expect(fit(0)).toBe(1);
    expect(spineCapacity(undefined, W, OVER)).toBe(1);
    expect(spineCapacity(NaN, W, OVER)).toBe(1);
  });

  it('does not divide by zero if the spines ever stop overlapping', () => {
    expect(spineCapacity(300, 30, 30)).toBe(1);
    expect(spineCapacity(300, 30, 40)).toBe(1);
  });
});

describe('compareLists', () => {
  const sort = lists => [...lists].sort(compareLists).map(l => l.name);

  it('keeps the built-in lists first when nobody has reordered', () => {
    const lists = [
      { name: 'sci-fi' }, { name: 'dnf', isDnf: true }, { name: 'reading', isDefault: true },
    ];
    expect(sort(lists)).toEqual(['reading', 'dnf', 'sci-fi']);
  });

  it('honours an explicit order below the reading list', () => {
    const lists = [
      { name: 'reading', isDefault: true, sortIndex: 0 },
      { name: 'dnf', isDnf: true, sortIndex: 2 },
      { name: 'sci-fi', sortIndex: 1 },
    ];
    expect(sort(lists)).toEqual(['reading', 'sci-fi', 'dnf']);
  });

  it('pins the reading list first even against a sortIndex that says otherwise', () => {
    // The buttons will not produce this, but a stale or hand-edited index
    // could. Enforcing it here means the UI is not the only thing holding the
    // rule.
    const lists = [
      { name: 'reading', isDefault: true, sortIndex: 9 },
      { name: 'sci-fi', sortIndex: 0 },
    ];
    expect(sort(lists)).toEqual(['reading', 'sci-fi']);
  });

  it('puts an ordered list ahead of an unordered one', () => {
    // Happens only between a reorder and its write landing; the ordered ones
    // leading is the least surprising of the two possible answers.
    const lists = [{ name: 'new' }, { name: 'arranged', sortIndex: 5 }];
    expect(sort(lists)).toEqual(['arranged', 'new']);
  });

  it('treats sortIndex 0 as a real position, not as absent', () => {
    // The classic falsy-zero bug: 0 is the first slot, not "unset".
    const lists = [{ name: 'second', sortIndex: 1 }, { name: 'first', sortIndex: 0 }];
    expect(sort(lists)).toEqual(['first', 'second']);
  });

  it('ignores a sortIndex that is not a number', () => {
    const lists = [{ name: 'broken', sortIndex: null }, { name: 'ok', sortIndex: 0 }];
    expect(sort(lists)).toEqual(['ok', 'broken']);
    expect(compareLists({ sortIndex: NaN }, { sortIndex: 3 })).toBeGreaterThan(0);
  });
});

describe('moveInArray', () => {
  const names = a => a.map(x => x.n ?? x);

  it('moves an item up', () => {
    expect(names(moveInArray(['a', 'b', 'c'], 1, -1))).toEqual(['b', 'a', 'c']);
  });

  it('moves an item down', () => {
    expect(names(moveInArray(['a', 'b', 'c'], 1, 1))).toEqual(['a', 'c', 'b']);
  });

  it('does nothing at either end rather than wrapping or dropping', () => {
    expect(names(moveInArray(['a', 'b', 'c'], 0, -1))).toEqual(['a', 'b', 'c']);
    expect(names(moveInArray(['a', 'b', 'c'], 2, 1))).toEqual(['a', 'b', 'c']);
  });

  it('never mutates the array it was given', () => {
    // The caller keeps the original to revert to if the write fails.
    const original = ['a', 'b', 'c'];
    moveInArray(original, 0, 1);
    expect(original).toEqual(['a', 'b', 'c']);
  });

  it('keeps every item, whatever the move', () => {
    const original = ['a', 'b', 'c', 'd'];
    for (let from = 0; from < 4; from++) {
      for (const delta of [-1, 1]) {
        expect([...moveInArray(original, from, delta)].sort()).toEqual(['a', 'b', 'c', 'd']);
      }
    }
  });

  it('copes with an empty or missing array', () => {
    expect(moveInArray([], 0, 1)).toEqual([]);
    expect(moveInArray(undefined, 0, 1)).toEqual([]);
  });
});
