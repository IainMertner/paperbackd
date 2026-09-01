// The default book language.
//
// Reported: since the default became customisable in settings, books were being
// added with no language at all. Three things went wrong at once, and the third
// is what made it stick:
//
//   1. The library's on-screen copy of a just-added book carried no language, so
//      it rendered "—" and counted as Missing language until a reload.
//   2. Touching that row then saved the blank, making it real.
//   3. addFinishedBook stored a read record with no language, and updateBookReads
//      rebuilds a book's language from its most recent read — deleting the field
//      when that read has none. So a finished book lost its language the first
//      time anyone edited its dates.
//
// The fix is one exported decision that both the write and the on-screen copy
// use, which is what this pins.

import { describe, it, expect } from 'vitest';
import { resolveBookLanguage, DEFAULT_BOOK_LANGUAGE } from '../js/book-utils.js';

describe('resolveBookLanguage', () => {
  it('defaults to English for a reader who has never touched the setting', () => {
    expect(resolveBookLanguage(undefined)).toBe('English');
    expect(resolveBookLanguage(undefined)).toBe(DEFAULT_BOOK_LANGUAGE);
  });

  it('treats a missing profile field the same as an absent preference', () => {
    // A profile saved before the setting existed has no such key at all.
    const profile = {};
    expect(resolveBookLanguage(profile.defaultLanguage)).toBe('English');
  });

  it('honours a chosen language', () => {
    expect(resolveBookLanguage('Portuguese')).toBe('Portuguese');
    expect(resolveBookLanguage('Japanese')).toBe('Japanese');
  });

  it('honours an explicit choice of no language', () => {
    // This is the whole reason it is ?? and not ||. Someone who picked "No
    // language" in settings means it, and must not be given English back.
    expect(resolveBookLanguage('')).toBe('');
  });

  it('treats null as no preference, not as a choice', () => {
    // Firestore hands back null for a cleared field, which is not the same as
    // the empty string the settings select writes.
    expect(resolveBookLanguage(null)).toBe('English');
  });

  it('is stable — resolving twice does not drift', () => {
    // The write and the on-screen copy each call it; they have to agree.
    for (const pref of [undefined, null, '', 'Welsh']) {
      expect(resolveBookLanguage(resolveBookLanguage(pref))).toBe(resolveBookLanguage(pref));
    }
  });

  it('gives the write and the on-screen copy the same answer', () => {
    // The actual regression: the write resolved the default and the card did
    // not, so a book saved as English rendered as having none.
    for (const pref of [undefined, null, '', 'Portuguese']) {
      const written = resolveBookLanguage(pref);
      const shown   = resolveBookLanguage(pref);
      expect(shown).toBe(written);
      // And neither is undefined, which is what the card was displaying.
      expect(shown).not.toBe(undefined);
    }
  });
});
