// The page-growth arithmetic behind reachable dropdowns.
//
// When this is wrong nothing throws — the page simply doesn't grow enough, and
// the bottom of a menu stays pinned under the nav bar. That is exactly how the
// bug shipped twice, so the sums are pinned here.

import { describe, it, expect } from 'vitest';
import { gapNeeded } from '../js/dropdown.js';

const NAV = 64;
const PAD = 16;

describe('gapNeeded', () => {
  it('asks for nothing when the page already ends well below the menu', () => {
    // Long article, short menu near the top.
    expect(gapNeeded(300, 2000, 0, NAV, PAD)).toBe(0);
  });

  it('asks for nav plus padding when the page ends level with the menu', () => {
    // The case that made the first two attempts look like no-ops: the browser
    // extends the document to exactly the bottom of an absolutely positioned
    // menu, so the page and the menu end together and the nav covers the tail.
    expect(gapNeeded(1200, 1200, 0, NAV, PAD)).toBe(NAV + PAD);
  });

  it('covers a menu hanging past the end of the page', () => {
    expect(gapNeeded(1400, 1200, 0, NAV, PAD)).toBe(200 + NAV + PAD);
  });

  it('asks for nothing when the page already clears the menu by exactly enough', () => {
    expect(gapNeeded(1200, 1200 + NAV + PAD, 0, NAV, PAD)).toBe(0);
  });

  it('never returns a negative', () => {
    expect(gapNeeded(100, 5000, 0, NAV, PAD)).toBe(0);
  });

  it('rounds to whole pixels', () => {
    expect(gapNeeded(1200.4, 1200, 0, 0, 0)).toBe(0);
    expect(gapNeeded(1200.6, 1200, 0, 0, 0)).toBe(1);
  });

  it('returns zero for missing measurements rather than throwing', () => {
    expect(gapNeeded(null, 1200, 0, NAV, PAD)).toBe(0);
    expect(gapNeeded(1200, null, 0, NAV, PAD)).toBe(0);
    expect(gapNeeded(undefined, undefined)).toBe(0);
  });
});

describe('gapNeeded — settling rather than creeping', () => {
  // The observer refits on every mutation, so a menu that loads its rows
  // asynchronously gets measured several times. Because the container's bottom
  // already includes the gap applied last time, that gap has to be added back
  // in — otherwise each pass would compound and the page would grow without
  // bound.
  const settle = (elBottom, containerBottom, rounds) => {
    let gap = 0;
    for (let i = 0; i < rounds; i++) {
      const grown = containerBottom + gap;
      gap = gapNeeded(elBottom, grown, gap, NAV, PAD);
    }
    return gap;
  };

  it('reaches the same answer on the second pass', () => {
    expect(settle(1400, 1200, 1)).toBe(settle(1400, 1200, 2));
  });

  it('stays put over many passes', () => {
    expect(settle(1400, 1200, 10)).toBe(200 + NAV + PAD);
  });

  it('shrinks back when the menu gets shorter', () => {
    const wide = gapNeeded(1400, 1200, 0, NAV, PAD);
    // Same page, but the list re-rendered down to a few rows.
    expect(gapNeeded(1100, 1200 + wide, wide, NAV, PAD)).toBe(0);
  });
});

describe('gapNeeded — allowing for the fixed bottom nav', () => {
  it('leaves the menu clear of the nav once the page is grown', () => {
    const elBottom = 1400;
    const containerBottom = 1200;
    const gap = gapNeeded(elBottom, containerBottom, 0, NAV, PAD);
    // Scrolled to the very end, the page stops this far below the menu.
    expect(containerBottom + gap - elBottom).toBe(NAV + PAD);
  });

  it('allows for a taller nav on a notched phone', () => {
    const plain = gapNeeded(1400, 1200, 0, 64, PAD);
    const notched = gapNeeded(1400, 1200, 0, 98, PAD);
    expect(notched).toBe(plain + 34);
  });

  it('asks only for padding on desktop, where the nav is hidden', () => {
    expect(gapNeeded(1400, 1200, 0, 0, PAD)).toBe(200 + PAD);
  });
});
