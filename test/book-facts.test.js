// What the book page shows under the title: genres, the author's country and
// gender, and the ISBN.
//
// These come from two places at once — the reader's own copy of the book, which
// is on hand immediately, and a Hardcover/Wikidata lookup that arrives a moment
// later. Which one wins matters: the library's editor exists so people can
// correct this data by hand, and a page render is no place to quietly put
// Wikidata's answer back over the top of that.

import { describe, it, expect } from 'vitest';
import { mergeBookFacts } from '../js/book-utils.js';

const fetched = {
  genres: ['Science Fiction', 'Space Opera'],
  country: 'United Kingdom',
  authorGender: 'Male',
};

describe('mergeBookFacts', () => {
  it('uses the lookup when the reader has no copy', () => {
    // The common case: someone browsing a book they have never logged.
    expect(mergeBookFacts(null, fetched)).toEqual({
      genres: ['Science Fiction', 'Space Opera'],
      country: 'United Kingdom',
      authorGender: 'Male',
      isbn13: null,
    });
  });

  it('prefers the reader\'s own copy over the lookup', () => {
    const own = { genres: ['Literary Fiction'], country: 'Scotland', authorGender: 'Non-binary' };
    const out = mergeBookFacts(own, fetched);
    expect(out.genres).toEqual(['Literary Fiction']);
    expect(out.country).toBe('Scotland');
    expect(out.authorGender).toBe('Non-binary');
  });

  it('fills only the fields the copy is missing', () => {
    const own = { country: 'Ireland' };
    const out = mergeBookFacts(own, fetched);
    expect(out.country).toBe('Ireland');
    expect(out.genres).toEqual(['Science Fiction', 'Space Opera']);
    expect(out.authorGender).toBe('Male');
  });

  it('does not let an empty genre array block the lookup', () => {
    // [] means nobody has tagged the book, not that it has no genres. Treating
    // it as an answer would leave the row permanently blank.
    expect(mergeBookFacts({ genres: [] }, fetched).genres).toEqual(fetched.genres);
  });

  it('returns null rather than an empty array when neither has genres', () => {
    // renderFacts skips falsy values, so [] would draw an empty "Genres" row.
    expect(mergeBookFacts({ genres: [] }, { genres: [] }).genres).toBe(null);
    expect(mergeBookFacts(null, {}).genres).toBe(null);
  });

  it('takes the ISBN from the copy, then from the page\'s own editions', () => {
    // This one is never fetched — the page works it out from the editions it
    // already asked Hardcover for.
    expect(mergeBookFacts({ isbn13: '9780857661791' }, {}, '9780000000000').isbn13)
      .toBe('9780857661791');
    expect(mergeBookFacts(null, {}, '9780000000000').isbn13).toBe('9780000000000');
    expect(mergeBookFacts(null, {}).isbn13).toBe(null);
  });

  it('never yields undefined, so no row renders as blank', () => {
    for (const out of [mergeBookFacts(null), mergeBookFacts({}, {}), mergeBookFacts(undefined, undefined)]) {
      for (const v of Object.values(out)) expect(v).not.toBe(undefined);
    }
  });

  it('survives a missing or null lookup result', () => {
    // The lookup fails soft and can hand back nothing at all.
    expect(mergeBookFacts({ country: 'Japan' }, null).country).toBe('Japan');
    expect(mergeBookFacts({ country: 'Japan' }, undefined).country).toBe('Japan');
  });

  it('treats empty strings as absent', () => {
    const own = { country: '', authorGender: '' };
    const out = mergeBookFacts(own, fetched);
    expect(out.country).toBe('United Kingdom');
    expect(out.authorGender).toBe('Male');
  });

  it('is stable — merging its own output changes nothing', () => {
    // The page calls it twice, once seeded and once when the lookup lands.
    const first = mergeBookFacts({ country: 'Ireland' }, fetched);
    expect(mergeBookFacts(first, fetched)).toEqual(first);
  });
});
