// Escaping invariants.
//
// The app builds most of its UI with innerHTML and template literals, so esc()
// is the single thing standing between a book title and script execution. These
// tests pin its behaviour, pin the assumptions the call sites make about it, and
// guard the boundary it does NOT cover (single quotes).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { esc } from '../js/utils.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function collectSourceFiles(dir = ROOT, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.git', 'test'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSourceFiles(full, acc);
    else if (/\.(html|js)$/.test(entry)) acc.push(full);
  }
  return acc;
}

const SOURCE_FILES = collectSourceFiles().map(f => ({
  path: relative(ROOT, f).replace(/\\/g, '/'),
  text: readFileSync(f, 'utf8'),
}));

// ── esc: the four characters it handles ───────────────────────────────────────

describe('esc — core substitutions', () => {
  it('escapes an ampersand', () => expect(esc('&')).toBe('&amp;'));
  it('escapes a less-than', () => expect(esc('<')).toBe('&lt;'));
  it('escapes a greater-than', () => expect(esc('>')).toBe('&gt;'));
  it('escapes a double quote', () => expect(esc('"')).toBe('&quot;'));

  it('escapes the ampersand first so entities are not double-broken', () => {
    // If & were escaped last, '<' would become '&amp;lt;'.
    expect(esc('<')).toBe('&lt;');
    expect(esc('&lt;')).toBe('&amp;lt;');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(esc('<<<')).toBe('&lt;&lt;&lt;');
    expect(esc('&&')).toBe('&amp;&amp;');
    expect(esc('""')).toBe('&quot;&quot;');
  });

  it('handles all four together', () => {
    expect(esc('&<>"')).toBe('&amp;&lt;&gt;&quot;');
  });
});

// ── esc: script-injection payloads ────────────────────────────────────────────

describe('esc — injection payloads', () => {
  const PAYLOADS = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg/onload=alert(1)>',
    '</title><script>alert(1)</script>',
    '<iframe src="javascript:alert(1)">',
    '"><script>alert(1)</script>',
    '<body onload=alert(1)>',
    '<a href="javascript:alert(1)">click</a>',
    '<style>@import"http://evil"</style>',
    '<meta http-equiv="refresh" content="0;url=http://evil">',
    '<object data="data:text/html,<script>alert(1)</script>">',
    '<form><button formaction="javascript:alert(1)">',
  ];

  it.each(PAYLOADS)('neutralises %s', payload => {
    const out = esc(payload);
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it.each(PAYLOADS)('leaves no raw double quote in %s', payload => {
    expect(esc(payload)).not.toContain('"');
  });

  it('cannot be escaped by a partially-encoded payload', () => {
    expect(esc('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('does not decode numeric entities', () => {
    expect(esc('&#60;script&#62;')).toBe('&amp;#60;script&amp;#62;');
  });
});

// ── esc: values that are not strings ──────────────────────────────────────────

describe('esc — non-string inputs', () => {
  it('stringifies null', () => expect(esc(null)).toBe('null'));
  it('stringifies undefined', () => expect(esc(undefined)).toBe('undefined'));
  it('stringifies a number', () => expect(esc(42)).toBe('42'));
  it('stringifies zero', () => expect(esc(0)).toBe('0'));
  it('stringifies false', () => expect(esc(false)).toBe('false'));
  it('stringifies NaN', () => expect(esc(NaN)).toBe('NaN'));
  it('stringifies an array', () => expect(esc(['a', 'b'])).toBe('a,b'));
  it('escapes inside a stringified array', () => expect(esc(['<a>'])).toBe('&lt;a&gt;'));
  it('stringifies an object', () => expect(esc({})).toBe('[object Object]'));

  it('escapes a malicious toString', () => {
    expect(esc({ toString: () => '<script>' })).toBe('&lt;script&gt;');
  });

  it('returns an empty string for an empty string', () => expect(esc('')).toBe(''));
});

// ── esc: passthrough ──────────────────────────────────────────────────────────

describe('esc — passthrough', () => {
  const SAFE = [
    'The Great Gatsby', 'Fahrenheit 451', "Child's Play", 'Ubik',
    'Æthelred', 'Café', '日本語のタイトル', 'Ñ', '한국어', 'Крыло', '📚',
    'em—dash', 'ellipsis…', 'tab\tseparated', 'line\nbreak',
  ];

  it.each(SAFE)('leaves %s unchanged', s => expect(esc(s)).toBe(s));

  it('preserves length for text with nothing to escape', () => {
    for (const s of SAFE) expect(esc(s)).toHaveLength(s.length);
  });

  it('is idempotent only up to ampersand growth', () => {
    // Escaping twice is not a no-op — call sites must escape exactly once.
    expect(esc(esc('<'))).toBe('&amp;lt;');
  });
});

// ── The single-quote boundary ─────────────────────────────────────────────────

describe("esc — does not escape single quotes", () => {
  it('passes an apostrophe through unchanged', () => {
    expect(esc("Child's Play")).toBe("Child's Play");
  });

  it('leaves a bare single quote', () => {
    expect(esc("'")).toBe("'");
  });

  it('is therefore unsafe inside a single-quoted attribute', () => {
    // Documents the actual limitation: this output would break out of
    // attr='...' but is inert inside attr="..." and in text content.
    const payload = "' onmouseover='alert(1)";
    expect(esc(payload)).toContain("'");
    expect(esc(payload)).not.toContain('<');
  });
});

describe('no call site relies on single-quoted attributes', () => {
  // esc() does not handle "'", so `attr='${esc(x)}'` would be an injection
  // point. This guard fails if such a pattern is ever introduced.
  const SINGLE_QUOTED_ATTR = /=\s*'\$\{\s*esc\s*\(/;

  it.each(SOURCE_FILES.map(f => f.path))('%s has no single-quoted esc attribute', path => {
    const file = SOURCE_FILES.find(f => f.path === path);
    expect(SINGLE_QUOTED_ATTR.test(file.text)).toBe(false);
  });

  it('finds at least one double-quoted esc attribute, proving the pattern is in use', () => {
    const anyDoubleQuoted = SOURCE_FILES.some(f => /=\s*"\$\{\s*esc\s*\(/.test(f.text));
    expect(anyDoubleQuoted).toBe(true);
  });
});

// ── Duplicate copies of esc must agree ────────────────────────────────────────

describe('duplicate esc implementations', () => {
  // js/search-widget.js carries its own private copy rather than importing
  // from utils.js. It must behave identically to the tested one.
  const widgetSrc = SOURCE_FILES.find(f => f.path === 'js/search-widget.js').text;

  it('search-widget.js still defines a local esc', () => {
    expect(widgetSrc).toMatch(/function esc\s*\(/);
  });

  it('the local copy handles the same four characters', () => {
    const body = widgetSrc.slice(widgetSrc.indexOf('function esc'));
    const decl = body.slice(0, body.indexOf('\n}') + 2);
    for (const entity of ['&amp;', '&lt;', '&gt;', '&quot;']) {
      expect(decl).toContain(entity);
    }
  });

  it('the local copy produces identical output to utils.esc', () => {
    const body = widgetSrc.slice(widgetSrc.indexOf('function esc'));
    const decl = body.slice(0, body.indexOf('\n}') + 2);
    // eslint-disable-next-line no-new-func
    const localEsc = new Function(`${decl}; return esc;`)();
    const samples = ['<script>', '&', '"', "'", 'plain', '', '<>&"', 'Café'];
    for (const s of samples) expect(localEsc(s)).toBe(esc(s));
  });
});

// ── Source-level hygiene ──────────────────────────────────────────────────────

describe('escaping hygiene across the codebase', () => {
  it('does not use document.write anywhere', () => {
    for (const f of SOURCE_FILES) expect(f.text).not.toContain('document.write');
  });

  it('does not use eval anywhere', () => {
    for (const f of SOURCE_FILES) {
      expect(f.text).not.toMatch(/(^|[^.\w])eval\s*\(/);
    }
  });

  it('scans a meaningful number of source files', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(20);
  });

  it('does not ship a bare innerHTML assignment from location.hash', () => {
    for (const f of SOURCE_FILES) {
      expect(f.text).not.toMatch(/innerHTML\s*=\s*[^;]*location\.hash/);
    }
  });

  it('does not ship a bare innerHTML assignment from location.search', () => {
    for (const f of SOURCE_FILES) {
      expect(f.text).not.toMatch(/innerHTML\s*=\s*[^;]*location\.search/);
    }
  });
});
