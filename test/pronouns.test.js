// Pronouns on a profile.
//
// Stored as a plain string, shown only when set. The normalising is what both
// the profile's inline editor and the Edit profile form run their value through,
// so the two cannot store the same choice two different ways.

import { describe, it, expect } from 'vitest';
import { PRONOUN_PRESETS, normalisePronouns } from '../js/utils.js';

describe('PRONOUN_PRESETS', () => {
  it('offers the three common sets', () => {
    expect(PRONOUN_PRESETS).toEqual(['they/them', 'she/her', 'he/him']);
  });

  it('is already in stored form, so picking one never rewrites it', () => {
    // Both editors compare the stored value against this list to decide whether
    // to show it as a preset or in the "Other…" box.
    for (const preset of PRONOUN_PRESETS) {
      expect(normalisePronouns(preset)).toBe(preset);
    }
  });
});

describe('normalisePronouns', () => {
  it('keeps a preset unchanged', () => {
    expect(normalisePronouns('they/them')).toBe('they/them');
  });

  it('keeps anything else someone types', () => {
    // The presets are a shortcut, not a definition of what is allowed.
    expect(normalisePronouns('ze/zir')).toBe('ze/zir');
    expect(normalisePronouns('xe/xem')).toBe('xe/xem');
    expect(normalisePronouns('she/they')).toBe('she/they');
    expect(normalisePronouns('any')).toBe('any');
  });

  it('lowercases, to match the display name and username', () => {
    // Both of those are forced down too — capitalised pronouns would be the only
    // capitals on the page.
    expect(normalisePronouns('They/Them')).toBe('they/them');
    expect(normalisePronouns('HE/HIM')).toBe('he/him');
  });

  it('trims and collapses whitespace', () => {
    expect(normalisePronouns('  she/her  ')).toBe('she/her');
    expect(normalisePronouns('she/her,   they/them')).toBe('she/her, they/them');
    expect(normalisePronouns('he\n/him')).toBe('he /him');
  });

  it('gives back an empty string for nothing, which means "not shown"', () => {
    expect(normalisePronouns('')).toBe('');
    expect(normalisePronouns('   ')).toBe('');
    expect(normalisePronouns(null)).toBe('');
    expect(normalisePronouns(undefined)).toBe('');
  });

  it('caps the length', () => {
    // It sits on one line beside the display name and must not push it about.
    expect(normalisePronouns('x'.repeat(200))).toHaveLength(30);
  });

  it('is idempotent', () => {
    // Called on save and again on render; the two must agree, or a value would
    // look unsaved every time the page loaded.
    for (const raw of ['They/Them', '  ze/zir ', 'she/her,  they/them', '', 'x'.repeat(80)]) {
      const once = normalisePronouns(raw);
      expect(normalisePronouns(once)).toBe(once);
    }
  });

  it('does not turn a non-string into "undefined" or "null"', () => {
    // These would be stored verbatim and then displayed on the profile.
    expect(normalisePronouns(undefined)).toBe('');
    expect(normalisePronouns(null)).toBe('');
  });

  it('round-trips a custom value through the "Other" box unchanged', () => {
    // The editors preselect "Other…" and prefill the box with the stored value
    // when it is not a preset; saving without touching it must not alter it.
    const custom = normalisePronouns('Ze/Hir');
    expect(PRONOUN_PRESETS.includes(custom)).toBe(false);
    expect(normalisePronouns(custom)).toBe(custom);
  });
});
