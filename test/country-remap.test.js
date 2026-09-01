// Admin-supplied country remaps, e.g. Castile → Spain.
//
// normalizeCountry has a built-in table of historic and formal names, but it can
// only ever be as complete as the last deploy. The remaps let an admin teach it
// a name at runtime, and — because they are consulted first — correct one of the
// built-in rules when it turns out to be wrong.

import { describe, it, expect } from 'vitest';
import { normalizeCountry } from '../js/utils.js';

describe('normalizeCountry with admin remaps', () => {
  const remaps = { castile: 'Spain', 'st. kitts': 'Saint Kitts and Nevis' };

  it('resolves a name the built-in table has never heard of', () => {
    expect(normalizeCountry('Castile')).toBe('Castile');       // before
    expect(normalizeCountry('Castile', remaps)).toBe('Spain'); // after
  });

  it('matches regardless of the casing or spacing typed by the user', () => {
    // Keys are stored lowercased and trimmed, so the lookup must be too.
    for (const raw of ['castile', 'CASTILE', 'CaStIlE', '  Castile  ']) {
      expect(normalizeCountry(raw, remaps)).toBe('Spain');
    }
  });

  it('handles a name containing a dot', () => {
    // These are stored as map data rather than a Firestore field path, where a
    // dot would mean something else entirely.
    expect(normalizeCountry('St. Kitts', remaps)).toBe('Saint Kitts and Nevis');
  });

  it('leaves an unlisted name to the built-in rules', () => {
    expect(normalizeCountry('Prussia', remaps)).toBe('Germany');
    expect(normalizeCountry('Kingdom of Denmark', remaps)).toBe('Denmark');
  });

  it('lets a remap override a built-in rule', () => {
    // The point of consulting remaps first: England → United Kingdom is built
    // in, and an admin who disagrees can say so without a deploy.
    expect(normalizeCountry('England')).toBe('United Kingdom');
    expect(normalizeCountry('England', { england: 'England' })).toBe('England');
  });

  it('behaves exactly as before when no remaps are passed', () => {
    // Every existing call site passes nothing, and none of them should shift.
    for (const raw of ['Prussia', 'Yugoslavia', 'Holland', 'France', 'Ceylon']) {
      expect(normalizeCountry(raw, null)).toBe(normalizeCountry(raw));
      expect(normalizeCountry(raw, {})).toBe(normalizeCountry(raw));
    }
  });

  it('still returns falsy input untouched', () => {
    expect(normalizeCountry('', remaps)).toBe('');
    expect(normalizeCountry(null, remaps)).toBe(null);
    expect(normalizeCountry(undefined, remaps)).toBe(undefined);
  });

  it('is not fooled by inherited object properties', () => {
    // A plain lookup would find Object.prototype.constructor and return a
    // function as the country name.
    expect(normalizeCountry('constructor', remaps)).toBe('constructor');
    expect(normalizeCountry('toString', remaps)).toBe('toString');
  });

  it('ignores an empty remap target rather than blanking the country', () => {
    expect(normalizeCountry('Prussia', { prussia: '' })).toBe('Germany');
  });

  it('is idempotent — remapping a result does not move it again', () => {
    // Repair compares normalizeCountry(x) to x to decide what to rewrite, so a
    // value that keeps changing would rewrite every book on every run.
    const once = normalizeCountry('Castile', remaps);
    expect(normalizeCountry(once, remaps)).toBe(once);
  });
});
