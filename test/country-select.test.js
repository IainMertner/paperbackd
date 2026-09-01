// The country picker's list, and its contract with COUNTRY_ISO.
//
// Country used to be a free-text box with a datalist, so a typo became a country
// of its own: counted separately in the stats, absent from the map, and
// impossible to find again. It is a select now, which makes the list itself the
// thing that has to be right.
//
// Two ways it can silently go wrong, both pinned below:
//
//   - a name here that COUNTRY_ISO cannot place is selectable but invisible on
//     the map;
//   - a name normalizeCountry can *produce* that is missing from here cannot be
//     re-selected once set, and would be cleared by the next save. That was a
//     real hole: normalizeCountry turns "Zaire" into "DR Congo" and "Ivory
//     Coast" into "Côte d'Ivoire", and neither was on the list.

import { describe, it, expect } from 'vitest';
import { COUNTRIES, COUNTRY_ISO } from '../js/stats-utils.js';
import { normalizeCountry } from '../js/utils.js';

describe('COUNTRIES', () => {
  it('has an entry for every country the app knows', () => {
    expect(COUNTRIES.length).toBeGreaterThan(190);
  });

  it('offers no name the map cannot place', () => {
    const unplaceable = COUNTRIES.filter(c => !COUNTRY_ISO[c.toLowerCase()]);
    expect(unplaceable).toEqual([]);
  });

  it('covers every ISO code exactly once', () => {
    // One canonical name per country. Two names for one code would split its
    // books across two entries that both colour the same patch of the map.
    const codes = COUNTRIES.map(c => COUNTRY_ISO[c.toLowerCase()]);
    expect(new Set(codes).size).toBe(codes.length);
    const allCodes = new Set(Object.values(COUNTRY_ISO));
    expect(new Set(codes)).toEqual(allCodes);
  });

  it('has no duplicates', () => {
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
  });

  it('is sorted, so the dropdown can be read', () => {
    expect(COUNTRIES).toEqual([...COUNTRIES].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('offers canonical names, not the aliases COUNTRY_ISO reads', () => {
    // "uk", "england" and "czechia" exist so messy stored data can be placed on
    // the map. Offering them would let two people pick different names for one
    // country.
    for (const alias of ['UK', 'England', 'Scotland', 'Wales', 'Britain', 'Great Britain',
                         'USA', 'US', 'Czechia', 'Korea', 'UAE', 'Trinidad']) {
      expect(COUNTRIES).not.toContain(alias);
    }
    for (const canonical of ['United Kingdom', 'United States', 'Czech Republic',
                             'South Korea', 'United Arab Emirates', 'Trinidad and Tobago']) {
      expect(COUNTRIES).toContain(canonical);
    }
  });

  it('is itself stable under normalizeCountry', () => {
    // Every option must already be the normalised form, or picking one and
    // saving would rewrite it to something else on the next repair pass.
    for (const country of COUNTRIES) {
      expect(normalizeCountry(country)).toBe(country);
    }
  });
});

describe('COUNTRIES covers what normalizeCountry produces', () => {
  // The four that were missing, and the general rule.
  it('includes the renamings that are not just prefix-stripping', () => {
    for (const [raw, expected] of [
      ['Zaire', 'DR Congo'],
      ['Democratic Republic of the Congo', 'DR Congo'],
      ['Ivory Coast', "Côte d'Ivoire"],
      ['Prussia', 'Germany'],
      ['Soviet Union', 'Russia'],
      ['Ceylon', 'Sri Lanka'],
      ['Burma', 'Myanmar'],
      ['Persia', 'Iran'],
      ['Holland', 'Netherlands'],
      ['Yugoslavia', 'Serbia'],
      ['Swaziland', 'Eswatini'],
      ['East Timor', 'Timor-Leste'],
    ]) {
      expect(normalizeCountry(raw)).toBe(expected);
      expect(COUNTRIES).toContain(expected);
    }
  });

  it('includes the places that only exist in COUNTRY_ISO', () => {
    // Hong Kong and Kosovo are on the map and were not selectable.
    for (const c of ['Hong Kong', 'Kosovo', 'DR Congo', "Côte d'Ivoire"]) {
      expect(COUNTRIES).toContain(c);
      expect(COUNTRY_ISO[c.toLowerCase()]).toBeTruthy();
    }
  });

  it('keeps Congo and DR Congo apart', () => {
    // Two different countries, and the old list had only one of them.
    expect(COUNTRY_ISO['congo']).not.toBe(COUNTRY_ISO['dr congo']);
    expect(COUNTRIES).toContain('Congo');
    expect(COUNTRIES).toContain('DR Congo');
  });
});
