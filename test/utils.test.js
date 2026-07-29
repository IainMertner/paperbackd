import { describe, it, expect } from 'vitest';
import {
  esc, toAuthorSlug, ordinal, renderStars, fmtTargetNum,
  cleanTitle, cleanAuthor, aggregateFollows, normalizeCountry,
} from '../js/utils.js';

// ── esc ───────────────────────────────────────────────────────────────────────

describe('esc', () => {
  it('escapes ampersands', () => expect(esc('a & b')).toBe('a &amp; b'));
  it('escapes less-than', () => expect(esc('<div>')).toBe('&lt;div&gt;'));
  it('escapes double quotes', () => expect(esc('"hello"')).toBe('&quot;hello&quot;'));
  it('escapes all special chars together', () =>
    expect(esc('<b class="x">a & b</b>')).toBe('&lt;b class=&quot;x&quot;&gt;a &amp; b&lt;/b&gt;'));
  it('passes through plain strings unchanged', () => expect(esc('hello world')).toBe('hello world'));
  it('coerces numbers to string', () => expect(esc(42)).toBe('42'));
  it('coerces null to string', () => expect(esc(null)).toBe('null'));
  it('handles empty string', () => expect(esc('')).toBe(''));
});

// ── toAuthorSlug ──────────────────────────────────────────────────────────────

describe('toAuthorSlug', () => {
  it('lowercases', () => expect(toAuthorSlug('Brandon Sanderson')).toBe('brandon-sanderson'));
  it('replaces spaces with hyphens', () => expect(toAuthorSlug('J R R Tolkien')).toBe('j-r-r-tolkien'));
  it('collapses multiple non-alphanumeric chars', () => expect(toAuthorSlug("O'Brien")).toBe('o-brien'));
  it('strips leading/trailing hyphens', () => expect(toAuthorSlug('  spaces  ')).toBe('spaces'));
  it('handles empty string', () => expect(toAuthorSlug('')).toBe(''));
  it('handles null/undefined', () => expect(toAuthorSlug(null)).toBe(''));
  it('handles special characters', () => expect(toAuthorSlug('Émile Zola')).toBe('mile-zola'));
  it('handles already-slug input', () => expect(toAuthorSlug('ursula-le-guin')).toBe('ursula-le-guin'));
});

// ── ordinal ───────────────────────────────────────────────────────────────────

describe('ordinal', () => {
  it('1st', () => expect(ordinal(1)).toBe('1st'));
  it('2nd', () => expect(ordinal(2)).toBe('2nd'));
  it('3rd', () => expect(ordinal(3)).toBe('3rd'));
  it('4th', () => expect(ordinal(4)).toBe('4th'));
  it('10th', () => expect(ordinal(10)).toBe('10th'));
  it('11th (teen exception)', () => expect(ordinal(11)).toBe('11th'));
  it('12th (teen exception)', () => expect(ordinal(12)).toBe('12th'));
  it('13th (teen exception)', () => expect(ordinal(13)).toBe('13th'));
  it('21st', () => expect(ordinal(21)).toBe('21st'));
  it('22nd', () => expect(ordinal(22)).toBe('22nd'));
  it('23rd', () => expect(ordinal(23)).toBe('23rd'));
  it('100th', () => expect(ordinal(100)).toBe('100th'));
  it('101st', () => expect(ordinal(101)).toBe('101st'));
  it('111th (teen exception at 100+)', () => expect(ordinal(111)).toBe('111th'));
  it('112th', () => expect(ordinal(112)).toBe('112th'));
});

// ── renderStars ───────────────────────────────────────────────────────────────

describe('renderStars', () => {
  it('returns empty string for falsy rating', () => {
    expect(renderStars(0)).toBe('');
    expect(renderStars(null)).toBe('');
    expect(renderStars(undefined)).toBe('');
  });
  it('wraps in stars-display span', () => {
    expect(renderStars(3)).toMatch(/^<span class="stars-display">/);
    expect(renderStars(3)).toMatch(/<\/span>$/);
  });
  it('5 stars — all full', () => {
    const h = renderStars(5);
    expect(h.match(/class="star-char full"/g)).toHaveLength(5);
    expect(h.match(/class="star-char half"/g)).toBeNull();
  });
  it('3 stars — 3 full, 2 empty', () => {
    const h = renderStars(3);
    expect(h.match(/class="star-char full"/g)).toHaveLength(3);
    expect(h.match(/class="star-char half"/g)).toBeNull();
    expect(h.match(/class="star-char"/g)).toHaveLength(2); // 2 empty (no modifier)
  });
  it('2.5 stars — 2 full, 1 half, 2 empty', () => {
    const h = renderStars(2.5);
    expect(h.match(/class="star-char full"/g)).toHaveLength(2);
    expect(h.match(/class="star-char half"/g)).toHaveLength(1);
  });
  it('0.5 stars — 1 half, 4 empty', () => {
    const h = renderStars(0.5);
    expect(h.match(/class="star-char half"/g)).toHaveLength(1);
    expect(h.match(/class="star-char full"/g)).toBeNull();
  });
  it('4.5 stars — 4 full, 1 half', () => {
    const h = renderStars(4.5);
    expect(h.match(/class="star-char full"/g)).toHaveLength(4);
    expect(h.match(/class="star-char half"/g)).toHaveLength(1);
  });
});

// ── fmtTargetNum ─────────────────────────────────────────────────────────────

describe('fmtTargetNum', () => {
  it('leaves numbers under 1000 as strings', () => {
    expect(fmtTargetNum(0)).toBe('0');
    expect(fmtTargetNum(1)).toBe('1');
    expect(fmtTargetNum(999)).toBe('999');
  });
  it('formats exactly 1000 as 1k', () => expect(fmtTargetNum(1000)).toBe('1k'));
  it('formats 1500 as 1.5k', () => expect(fmtTargetNum(1500)).toBe('1.5k'));
  it('formats 2000 as 2k (no trailing .0)', () => expect(fmtTargetNum(2000)).toBe('2k'));
  it('formats 10000 as 10k', () => expect(fmtTargetNum(10000)).toBe('10k'));
  it('formats 1100 as 1.1k', () => expect(fmtTargetNum(1100)).toBe('1.1k'));
  it('formats 50000 as 50k', () => expect(fmtTargetNum(50000)).toBe('50k'));
});

// ── cleanTitle ────────────────────────────────────────────────────────────────

describe('cleanTitle', () => {
  it('strips series notation with hash number', () =>
    expect(cleanTitle('The Name of the Wind (The Kingkiller Chronicle, #1)')).toBe('The Name of the Wind'));
  it('strips series notation without book number text', () =>
    expect(cleanTitle('Dune (Dune Chronicles, #1)')).toBe('Dune'));
  it('strips multi-digit numbers', () =>
    expect(cleanTitle('Words of Radiance (The Stormlight Archive, #2)')).toBe('Words of Radiance'));
  it('leaves titles without series unchanged', () =>
    expect(cleanTitle('The Great Gatsby')).toBe('The Great Gatsby'));
  it('leaves parenthetical without # unchanged', () =>
    expect(cleanTitle('Hamlet (Arden Shakespeare)')).toBe('Hamlet (Arden Shakespeare)'));
  it('handles empty string', () => expect(cleanTitle('')).toBe(''));
  it('handles null/undefined', () => expect(cleanTitle(null)).toBe(''));
  it('trims whitespace', () =>
    expect(cleanTitle('  My Book (Series, #3)  ')).toBe('My Book'));
});

// ── cleanAuthor ───────────────────────────────────────────────────────────────

describe('cleanAuthor', () => {
  it('converts "Last, First" to "First Last"', () =>
    expect(cleanAuthor('Sanderson, Brandon')).toBe('Brandon Sanderson'));
  it('converts "Last, First Middle" correctly', () =>
    expect(cleanAuthor('Le Guin, Ursula K.')).toBe('Ursula K. Le Guin'));
  it('leaves "First Last" format unchanged', () =>
    expect(cleanAuthor('Brandon Sanderson')).toBe('Brandon Sanderson'));
  it('handles single name', () => expect(cleanAuthor('Homer')).toBe('Homer'));
  it('handles empty string', () => expect(cleanAuthor('')).toBe(''));
  it('handles null/undefined', () => expect(cleanAuthor(null)).toBe(''));
  it('trims result', () =>
    expect(cleanAuthor('Tolkien, J.R.R.')).toBe('J.R.R. Tolkien'));
});

// ── aggregateFollows ──────────────────────────────────────────────────────────

describe('aggregateFollows', () => {
  const MY_UID = 'me123';

  const follow = (uid, targetUid, targetUsername, ts = null) =>
    ({ type: 'followed', uid, targetUid, targetUsername, timestamp: ts });

  const nonFollow = () => ({ type: 'finished', uid: 'someone', bookTitle: 'Dune' });

  it('passes non-follow events through unchanged', () => {
    const ev = nonFollow();
    const result = aggregateFollows([ev], MY_UID);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(ev);
  });

  it('wraps a single follow event in a targets array', () => {
    const result = aggregateFollows([follow('u1', 'u2', 'alice')], MY_UID);
    expect(result).toHaveLength(1);
    expect(result[0].targets).toEqual([{ username: 'alice', isMe: false }]);
  });

  it('marks target as isMe when targetUid matches myUid', () => {
    const result = aggregateFollows([follow('u1', MY_UID, 'me')], MY_UID);
    expect(result[0].targets[0].isMe).toBe(true);
  });

  it('aggregates multiple follows from the same user', () => {
    const events = [
      follow('u1', 'u2', 'alice'),
      follow('u1', 'u3', 'bob'),
    ];
    const result = aggregateFollows(events, MY_UID);
    expect(result).toHaveLength(1);
    expect(result[0].targets).toHaveLength(2);
    expect(result[0].targets.map(t => t.username)).toEqual(['alice', 'bob']);
  });

  it('keeps follows from different users separate', () => {
    const events = [
      follow('u1', 'u3', 'carol'),
      follow('u2', 'u4', 'dave'),
    ];
    const result = aggregateFollows(events, MY_UID);
    expect(result).toHaveLength(2);
  });

  it('separates same-user follows across different day keys', () => {
    const events = [
      follow('u1', 'u2', 'alice', { seconds: 100 }),
      follow('u1', 'u3', 'bob',   { seconds: 200 }),
    ];
    const getDayKey = ts => ts?.seconds < 150 ? 'day1' : 'day2';
    const result = aggregateFollows(events, MY_UID, getDayKey);
    expect(result).toHaveLength(2);
  });

  it('groups same-user follows on the same day key', () => {
    const events = [
      follow('u1', 'u2', 'alice', { seconds: 100 }),
      follow('u1', 'u3', 'bob',   { seconds: 110 }),
    ];
    const getDayKey = () => 'same-day';
    const result = aggregateFollows(events, MY_UID, getDayKey);
    expect(result).toHaveLength(1);
    expect(result[0].targets).toHaveLength(2);
  });

  it('preserves non-follow events in their original order', () => {
    const events = [
      follow('u1', 'u2', 'alice'),
      nonFollow(),
      follow('u1', 'u3', 'bob'),
    ];
    const result = aggregateFollows(events, MY_UID);
    // first follow aggregates, nonFollow second, no second follow (already aggregated)
    expect(result[1].type).toBe('finished');
  });
});

// ── normalizeCountry ──────────────────────────────────────────────────────────

describe('normalizeCountry', () => {
  it('returns null/undefined unchanged', () => {
    expect(normalizeCountry(null)).toBeNull();
    expect(normalizeCountry(undefined)).toBeUndefined();
    expect(normalizeCountry('')).toBe('');
  });

  it('applies override: Soviet Union → Russia', () =>
    expect(normalizeCountry('Soviet Union')).toBe('Russia'));
  it('applies override: England → United Kingdom', () =>
    expect(normalizeCountry('England')).toBe('United Kingdom'));
  it('applies override: Nazi Germany → Germany', () =>
    expect(normalizeCountry('Nazi Germany')).toBe('Germany'));
  it('applies override: Czechoslovakia → Czech Republic', () =>
    expect(normalizeCountry('Czechoslovakia')).toBe('Czech Republic'));
  it('applies override: Ottoman Empire → Turkey', () =>
    expect(normalizeCountry('Ottoman Empire')).toBe('Turkey'));
  it('applies override: Burma → Myanmar', () =>
    expect(normalizeCountry('Burma')).toBe('Myanmar'));
  it('applies override: United States of America → United States', () =>
    expect(normalizeCountry('United States of America')).toBe('United States'));

  it('strips "Republic of " prefix', () =>
    expect(normalizeCountry('Republic of Ireland')).toBe('Ireland'));
  it('strips "Kingdom of " prefix', () =>
    expect(normalizeCountry('Kingdom of Spain')).toBe('Spain'));
  it('strips "Commonwealth of " prefix', () =>
    expect(normalizeCountry('Commonwealth of Australia')).toBe('Australia'));
  it('strips "Grand Duchy of " prefix', () =>
    expect(normalizeCountry('Grand Duchy of Luxembourg')).toBe('Luxembourg'));
  it('strips "Principality of " prefix', () =>
    expect(normalizeCountry('Principality of Monaco')).toBe('Monaco'));

  it('matches known country by word boundary', () =>
    expect(normalizeCountry('somewhere in France')).toBe('France'));
  it('does not match partial word (Iran in Ukraine)', () =>
    expect(normalizeCountry('Ukraine')).toBe('Ukraine'));

  it('passes through unknown strings unchanged', () =>
    expect(normalizeCountry('Narnia')).toBe('Narnia'));
  it('returns already-canonical names unchanged', () =>
    expect(normalizeCountry('Germany')).toBe('Germany'));
});
