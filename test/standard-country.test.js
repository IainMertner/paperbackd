import { describe, it, expect } from 'vitest';
import { standardCountry, countryFacts, COUNTRIES, COUNTRY_ISO, ISO_CONTINENT } from '../js/stats-utils.js';

describe('standardCountry', () => {
  it('passes a canonical name straight through', () => {
    expect(standardCountry('Greece')).toBe('Greece');
    expect(standardCountry('Japan')).toBe('Japan');
    expect(standardCountry('United Kingdom')).toBe('United Kingdom');
  });

  it('resolves an alias to the canonical spelling', () => {
    expect(standardCountry('England')).toBe('United Kingdom');
    expect(standardCountry('Scotland')).toBe('United Kingdom');
    expect(standardCountry('USA')).toBe('United States');
    expect(standardCountry('Czechia')).toBe('Czech Republic');
  });

  it('resolves a historic name through normalizeCountry', () => {
    expect(standardCountry('Czechoslovakia')).toBe('Czech Republic');
    expect(standardCountry('Prussia')).toBe('Germany');
    expect(standardCountry('Soviet Union')).toBe('Russia');
    expect(standardCountry('Ottoman Empire')).toBe('Turkey');
    expect(standardCountry('Persia')).toBe('Iran');
  });

  it('strips a formal prefix', () => {
    expect(standardCountry('Kingdom of Sweden')).toBe('Sweden');
    expect(standardCountry('Republic of Kenya')).toBe('Kenya');
  });

  // The whole point of the second field: no honest answer, so no answer.
  it('returns empty for a place that is not a country', () => {
    expect(standardCountry('Ancient Athens')).toBe('');
    expect(standardCountry('Kurdistan')).toBe('');
    expect(standardCountry('Mesopotamia')).toBe('');
    expect(standardCountry('Catalonia')).toBe('');
  });

  it('returns empty for junk rather than inventing a country', () => {
    expect(standardCountry('asdf')).toBe('');
    expect(standardCountry('???')).toBe('');
    expect(standardCountry('12345')).toBe('');
  });

  it('returns empty for nothing at all', () => {
    expect(standardCountry('')).toBe('');
    expect(standardCountry(null)).toBe('');
    expect(standardCountry(undefined)).toBe('');
    expect(standardCountry('   ')).toBe('');
  });

  it('trims and is case-insensitive', () => {
    expect(standardCountry('  greece  ')).toBe('Greece');
    expect(standardCountry('JAPAN')).toBe('Japan');
  });

  // normalizeCountry matches a country name inside a longer string on word
  // boundaries, which is what makes "Ancient Greece" placeable.
  it('finds a country named inside a longer phrase', () => {
    expect(standardCountry('Ancient Greece')).toBe('Greece');
    expect(standardCountry('Southern Italy')).toBe('Italy');
  });

  it('applies an admin country remap first', () => {
    expect(standardCountry('Castile', { castile: 'Spain' })).toBe('Spain');
    // The remap table is keyed lowercase, so the input's casing is irrelevant.
    expect(standardCountry('CASTILE', { castile: 'Spain' })).toBe('Spain');
  });

  it('still returns empty when a remap points somewhere unplaceable', () => {
    expect(standardCountry('Castile', { castile: 'Atlantis' })).toBe('');
  });

  // Both lookup tables are plain objects, so every inherited key is a trap.
  it('ignores inherited properties', () => {
    for (const raw of ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__']) {
      expect(standardCountry(raw)).toBe('');
      expect(standardCountry('Greece', { greece: raw })).toBe('');
    }
  });

  it('never returns a name outside COUNTRIES', () => {
    const canonical = new Set(COUNTRIES);
    const inputs = [
      'England', 'Czechoslovakia', 'Kingdom of Sweden', 'Ancient Greece', 'USA',
      'Kurdistan', 'Ancient Athens', 'Prussia', 'Burma', 'Ceylon', 'Zaire', 'Holland',
    ];
    for (const raw of inputs) {
      const out = standardCountry(raw);
      if (out) expect(canonical.has(out)).toBe(true);
    }
  });

  // A standardised value that no continent knows would count toward "unique
  // countries" while being invisible in the continent breakdown.
  it('returns names the map and continent tables can both place', () => {
    for (const name of ['Greece', 'Japan', 'United Kingdom', 'Brazil', 'Nigeria']) {
      const iso = COUNTRY_ISO[standardCountry(name).toLowerCase()];
      expect(iso).toBeTruthy();
      expect(ISO_CONTINENT[iso]).toBeTruthy();
    }
  });

  it('is idempotent', () => {
    for (const raw of ['England', 'Czechoslovakia', 'Ancient Greece', 'Greece']) {
      const once = standardCountry(raw);
      expect(standardCountry(once)).toBe(once);
    }
  });
});

describe('countryFacts', () => {
  it('builds both fields from a raw label', () => {
    expect(countryFacts('Kingdom of Greece')).toEqual({ country: 'Kingdom of Greece', countryStd: 'Greece' });
  });

  // The free text is kept verbatim even when it standardises to something else:
  // that is the whole reason the second field exists.
  it('never rewrites the free text', () => {
    expect(countryFacts('Czechoslovakia').country).toBe('Czechoslovakia');
    expect(countryFacts('England').country).toBe('England');
  });

  it('leaves the standardised field null when nothing fits', () => {
    expect(countryFacts('Kurdistan')).toEqual({ country: 'Kurdistan', countryStd: null });
    expect(countryFacts('Ancient Athens')).toEqual({ country: 'Ancient Athens', countryStd: null });
  });

  // null is "nobody answered", which a caller must not confuse with "no
  // country" — only the latter is a reason to overwrite what is stored.
  it('returns null for no answer at all', () => {
    expect(countryFacts('')).toBeNull();
    expect(countryFacts('   ')).toBeNull();
    expect(countryFacts(null)).toBeNull();
    expect(countryFacts(undefined)).toBeNull();
  });

  it('trims the free text', () => {
    expect(countryFacts('  Japan  ')).toEqual({ country: 'Japan', countryStd: 'Japan' });
  });

  it('applies an admin remap to the standardised field only', () => {
    expect(countryFacts('Castile', { castile: 'Spain' })).toEqual({ country: 'Castile', countryStd: 'Spain' });
  });

  it('ignores inherited properties', () => {
    expect(countryFacts('constructor')).toEqual({ country: 'constructor', countryStd: null });
  });
});
