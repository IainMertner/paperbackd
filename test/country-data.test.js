// Data-integrity tests for the country pipeline.
//
// A book's country travels: raw source string → normalizeCountry() → COUNTRY_ISO
// → ISO_CONTINENT → the continent breakdown on the stats page. A break anywhere
// along that chain is silent — the book simply stops being counted — so these
// tests pin the chain rather than any single function.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { COUNTRY_ISO, ISO_CONTINENT } from '../js/stats-utils.js';
import { normalizeCountry } from '../js/utils.js';

const utilsSrc = readFileSync(fileURLToPath(new URL('../js/utils.js', import.meta.url)), 'utf8');

// Pull the literal lists out of utils.js so these tests track the source
// automatically instead of drifting from a hand-copied duplicate.
function extractStringArray(name) {
  const start = utilsSrc.indexOf(`const ${name}`);
  if (start === -1) throw new Error(`could not find "const ${name}" in js/utils.js`);
  const end = utilsSrc.indexOf('];', start);
  const block = utilsSrc.slice(start, end);
  return [...block.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] ?? m[2]).filter(Boolean);
}

function extractOverrideValues() {
  const start = utilsSrc.indexOf('const overrides');
  const end = utilsSrc.indexOf('};', start);
  const block = utilsSrc.slice(start, end);
  // Each entry is `'Key': 'Value',` — capture the value side only.
  return [...block.matchAll(/:\s*(?:'([^']*)'|"([^"]*)")/g)].map(m => m[1] ?? m[2]).filter(Boolean);
}

const KNOWN_COUNTRIES = extractStringArray('knownCountries');
const PREFIXES        = extractStringArray('prefixes');
const OVERRIDE_VALUES = [...new Set(extractOverrideValues())];

// ── Source lists are sane ─────────────────────────────────────────────────────

describe('utils.js country source lists', () => {
  it('extracts a plausible number of known countries', () => {
    expect(KNOWN_COUNTRIES.length).toBeGreaterThan(150);
    expect(KNOWN_COUNTRIES.length).toBeLessThan(260);
  });

  it('extracts the formal-prefix list', () => {
    expect(PREFIXES.length).toBeGreaterThan(10);
  });

  it('extracts override target values', () => {
    expect(OVERRIDE_VALUES.length).toBeGreaterThan(30);
  });

  it('has no duplicate entries in knownCountries', () => {
    const dupes = KNOWN_COUNTRIES.filter((c, i) => KNOWN_COUNTRIES.indexOf(c) !== i);
    expect(dupes).toEqual([]);
  });

  it('lists multi-word countries before the single-word ones they contain', () => {
    // "United States" must be tested before bare "States"-like fragments, and
    // "South Korea" before "Korea", or the wrong country wins the \b match.
    const idxOf = name => KNOWN_COUNTRIES.indexOf(name);
    for (const [long, short] of [['South Korea', 'China'], ['South Africa', 'Africa']]) {
      if (idxOf(long) !== -1 && idxOf(short) !== -1) {
        expect(idxOf(long)).toBeLessThan(idxOf(short));
      }
    }
    expect(idxOf('United Kingdom')).toBeLessThan(idxOf('Ireland'));
  });

  it('sorts every multi-word country ahead of its own first word', () => {
    for (const country of KNOWN_COUNTRIES) {
      if (!country.includes(' ')) continue;
      const firstWord = country.split(' ')[0];
      const wordIdx = KNOWN_COUNTRIES.indexOf(firstWord);
      if (wordIdx !== -1) {
        expect(KNOWN_COUNTRIES.indexOf(country)).toBeLessThan(wordIdx);
      }
    }
  });

  it('prefixes all end with a trailing space', () => {
    for (const p of PREFIXES) expect(p.endsWith(' ')).toBe(true);
  });

  it('orders prefixes so longer variants are matched first', () => {
    // 'Republic of the ' must precede 'Republic of ', else the bare form wins
    // and leaves a dangling "the ".
    const i = PREFIXES.indexOf('Republic of the ');
    const j = PREFIXES.indexOf('Republic of ');
    if (i !== -1 && j !== -1) expect(i).toBeLessThan(j);
  });
});

// ── normalizeCountry is a fixed point on canonical names ──────────────────────

describe('normalizeCountry — canonical names are fixed points', () => {
  it.each(KNOWN_COUNTRIES)('leaves %s unchanged', country => {
    expect(normalizeCountry(country)).toBe(country);
  });
});

describe('normalizeCountry — idempotence', () => {
  it.each(KNOWN_COUNTRIES)('is idempotent for %s', country => {
    const once = normalizeCountry(country);
    expect(normalizeCountry(once)).toBe(once);
  });
});

describe('normalizeCountry — override targets are themselves canonical', () => {
  it.each(OVERRIDE_VALUES)('override target %s is stable', target => {
    // Every value the override map points at must survive a second pass,
    // otherwise normalization order would change the answer.
    expect(normalizeCountry(target)).toBe(target);
  });
});

describe('normalizeCountry — every override target is a known country', () => {
  it.each(OVERRIDE_VALUES)('%s appears in knownCountries', target => {
    expect(KNOWN_COUNTRIES).toContain(target);
  });
});

// ── COUNTRY_ISO ↔ ISO_CONTINENT consistency ───────────────────────────────────

const ISO_ENTRIES = Object.entries(COUNTRY_ISO);
const CONTINENTS = ['AF', 'AS', 'EU', 'NA', 'OC', 'SA'];

describe('COUNTRY_ISO → ISO_CONTINENT completeness', () => {
  it.each(ISO_ENTRIES)('%s → %s has a continent', (_name, iso) => {
    expect(ISO_CONTINENT[iso]).toBeDefined();
  });
});

describe('COUNTRY_ISO key hygiene', () => {
  it.each(ISO_ENTRIES)('key for %s is lowercase', name => {
    expect(name).toBe(name.toLowerCase());
  });

  it('has no leading/trailing whitespace in any key', () => {
    for (const [name] of ISO_ENTRIES) expect(name).toBe(name.trim());
  });

  it('maps every key to a two-letter code', () => {
    for (const [, iso] of ISO_ENTRIES) expect(iso).toMatch(/^[a-z]{2}$/);
  });
});

describe('ISO_CONTINENT value hygiene', () => {
  it.each(Object.entries(ISO_CONTINENT))('%s → %s is a known continent', (_iso, cont) => {
    expect(CONTINENTS).toContain(cont);
  });

  it('has no unreachable entries', () => {
    // Every ISO code with a continent should be produced by at least one
    // COUNTRY_ISO entry, or the continent mapping is dead weight.
    const reachable = new Set(Object.values(COUNTRY_ISO));
    const orphans = Object.keys(ISO_CONTINENT).filter(iso => !reachable.has(iso));
    expect(orphans).toEqual([]);
  });
});

// ── The end-to-end chain ──────────────────────────────────────────────────────

const RESOLVABLE = KNOWN_COUNTRIES.filter(c => COUNTRY_ISO[c.toLowerCase()]);

describe('normalizeCountry → COUNTRY_ISO → ISO_CONTINENT', () => {
  it.each(RESOLVABLE)('%s reaches a continent', country => {
    const iso = COUNTRY_ISO[normalizeCountry(country).toLowerCase()];
    expect(iso).toBeDefined();
    expect(CONTINENTS).toContain(ISO_CONTINENT[iso]);
  });
});

// Every country normalizeCountry can produce must reach a continent, or books
// from that country vanish from the continent breakdown on the stats page while
// still counting toward totals — a silent, hard-to-spot discrepancy.
describe('continent-mapping coverage', () => {
  it('maps every known country to an ISO code', () => {
    const unmapped = KNOWN_COUNTRIES.filter(c => !COUNTRY_ISO[c.toLowerCase()]);
    expect(unmapped).toEqual([]);
  });

  it('maps every known country all the way to a continent', () => {
    const stranded = KNOWN_COUNTRIES.filter(c => {
      const iso = COUNTRY_ISO[normalizeCountry(c).toLowerCase()];
      return !iso || !ISO_CONTINENT[iso];
    });
    expect(stranded).toEqual([]);
  });

  it('covers 100% of known countries', () => {
    expect(RESOLVABLE.length).toBe(KNOWN_COUNTRIES.length);
  });

  it('assigns no two countries the same ISO code', () => {
    // Aliases deliberately share codes, so compare canonical names only.
    const byIso = new Map();
    for (const country of KNOWN_COUNTRIES) {
      const iso = COUNTRY_ISO[country.toLowerCase()];
      if (byIso.has(iso)) byIso.get(iso).push(country);
      else byIso.set(iso, [country]);
    }
    const collisions = [...byIso.entries()].filter(([, names]) => names.length > 1);
    expect(collisions).toEqual([]);
  });

  it('populates every continent bucket', () => {
    const seen = new Set(KNOWN_COUNTRIES.map(c => ISO_CONTINENT[COUNTRY_ISO[c.toLowerCase()]]));
    for (const cont of CONTINENTS) expect(seen).toContain(cont);
  });
});

// ── Aliases in COUNTRY_ISO agree with normalizeCountry ────────────────────────

describe('COUNTRY_ISO aliases and normalizeCountry agree', () => {
  const ALIASES = [
    ['england', 'United Kingdom'], ['scotland', 'United Kingdom'],
    ['wales', 'United Kingdom'], ['northern ireland', 'United Kingdom'],
    ['great britain', 'United Kingdom'], ['czechia', 'Czech Republic'],
  ];

  it.each(ALIASES)('%s and its canonical form %s share an ISO code', (alias, canonical) => {
    const canonicalIso = COUNTRY_ISO[canonical.toLowerCase()];
    expect(COUNTRY_ISO[alias]).toBe(canonicalIso);
  });

  it.each(ALIASES)('normalizeCountry folds %s to %s', (alias, canonical) => {
    const titleCased = alias.replace(/\b\w/g, c => c.toUpperCase());
    expect(normalizeCountry(titleCased)).toBe(canonical);
  });
});
