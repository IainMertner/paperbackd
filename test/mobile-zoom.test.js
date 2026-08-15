// Guards the rule that stops iOS zooming in when a page-count field is focused.
//
// iOS zooms the page when a focused field's computed text is under 16px, and
// does not zoom back out. The fix computes at 16px — passing that check — then
// scales the element down so it looks unchanged. Every length in the shared
// rule is divided by --s, so scaling by --s reproduces the original box.
//
// The trap: a field added to the selector list without its own --s/--w/--h
// makes every one of those calc() values invalid, and the field renders with no
// width or height at all. Nothing throws; it just looks broken on a phone,
// which is a slow way to find out. Hence this test.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Comments sit between rules and would otherwise be read as part of the
// following selector.
const css = readFileSync(fileURLToPath(new URL('../css/main.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// The @media (pointer: coarse) block, brace-matched from its opening.
function coarseBlock(source) {
  const start = source.search(/@media\s*\(\s*pointer\s*:\s*coarse\s*\)\s*\{/);
  if (start === -1) return null;
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

const block = coarseBlock(css);

// The rule that does the scaling, and the selectors it applies to.
function scalingRule(source) {
  for (const [, selectors, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (body.includes('transform: scale(var(--s))')) {
      return { selectors: selectors.split(',').map(s => s.trim()).filter(Boolean), body };
    }
  }
  return null;
}

describe('zoom-on-focus fix', () => {
  it('exists, scoped to touch pointers so desktop type is untouched', () => {
    expect(block).not.toBeNull();
  });

  it('computes at 16px — the threshold the zoom triggers below', () => {
    const size = block.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
    expect(size).not.toBeNull();
    expect(Number(size[1])).toBeGreaterThanOrEqual(16);
  });

  it('scales back down, so the field looks the size it always was', () => {
    expect(scalingRule(block)).not.toBeNull();
  });

  it('gives every scaled field its own scale and box', () => {
    // Without these three, the calc()s resolve to nothing and the field
    // collapses — visible only on a device.
    for (const selector of scalingRule(block).selectors) {
      const own = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, sel]) => sel.split(',').map(s => s.trim()).includes(selector))
        .map(([, , body]) => body)
        .join(' ');
      expect(own, `${selector} is missing --s`).toMatch(/--s\s*:/);
      expect(own, `${selector} is missing --w`).toMatch(/--w\s*:/);
      expect(own, `${selector} is missing --h`).toMatch(/--h\s*:/);
    }
  });

  it('divides every length by the scale, so scaling restores the original', () => {
    // A raw length here would survive the scale as a shrunken value — the field
    // would end up smaller than it was rather than identical.
    const { body } = scalingRule(block);
    for (const prop of ['width', 'height', 'padding', 'border-width', 'border-radius', 'line-height']) {
      const decl = body.match(new RegExp(`${prop}:([^;]*)`));
      expect(decl, `${prop} is not set`).not.toBeNull();
      expect(decl[1], `${prop} is not divided by --s`).toMatch(/\/\s*var\(--s\)/);
    }
  });

  it('reclaims the layout box the scale leaves behind', () => {
    // A scaled element still occupies its full size, so without these the field
    // carries dead space around it.
    const { body } = scalingRule(block);
    expect(body).toMatch(/margin-inline:.*var\(--s\)/);
    expect(body).toMatch(/margin-block:.*var\(--s\)/);
  });
});
