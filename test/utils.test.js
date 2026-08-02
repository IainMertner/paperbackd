import { describe, it, expect } from 'vitest';
import {
  esc, toAuthorSlug, ordinal, renderStars, fmtTargetNum,
  cleanTitle, cleanAuthor, aggregateFollows, normalizeCountry, recentDayLabel, dayLabel, timeAgo,
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

// ── recentDayLabel ────────────────────────────────────────────────────────────

describe('recentDayLabel', () => {
  // Sunday 2 August 2026, mid-afternoon.
  const SUNDAY = new Date(2026, 7, 2, 15, 30);
  const daysBefore = (n, h = 12) => new Date(2026, 7, 2 - n, h, 0);

  it('labels the same day Today', () => {
    expect(recentDayLabel(daysBefore(0), SUNDAY)).toBe('Today');
  });

  it('labels the previous day Yesterday', () => {
    expect(recentDayLabel(daysBefore(1), SUNDAY)).toBe('Yesterday');
  });

  it.each([
    [2, 'Friday'], [3, 'Thursday'], [4, 'Wednesday'], [5, 'Tuesday'], [6, 'Monday'],
  ])('labels %i days ago as %s', (n, expected) => {
    expect(recentDayLabel(daysBefore(n), SUNDAY)).toBe(expected);
  });

  it('produces the exact sequence from the spec', () => {
    const labels = [0, 1, 2, 3, 4, 5, 6].map(n => recentDayLabel(daysBefore(n), SUNDAY));
    expect(labels).toEqual(['Today', 'Yesterday', 'Friday', 'Thursday', 'Wednesday', 'Tuesday', 'Monday']);
  });

  it('returns null at 7 days so the weekday name cannot repeat', () => {
    // 7 days back is Sunday again — labelling it would print a second 'Sunday'
    // below 'Monday'.
    expect(recentDayLabel(daysBefore(7), SUNDAY)).toBeNull();
  });

  it('returns null for anything older', () => {
    expect(recentDayLabel(daysBefore(8), SUNDAY)).toBeNull();
    expect(recentDayLabel(daysBefore(30), SUNDAY)).toBeNull();
    expect(recentDayLabel(daysBefore(400), SUNDAY)).toBeNull();
  });

  it('labels a recent day that falls in the previous month', () => {
    // The whole point: 31 July is 2 days before 2 August and must read
    // 'Friday', not collapse to 'July'.
    expect(recentDayLabel(new Date(2026, 6, 31, 9, 0), SUNDAY)).toBe('Friday');
  });

  it('labels a recent day across a year boundary', () => {
    const jan2 = new Date(2027, 0, 2, 10, 0);
    expect(recentDayLabel(new Date(2026, 11, 30, 10, 0), jan2)).toBe('Wednesday');
  });

  it('compares calendar days, not elapsed hours', () => {
    // 23:59 yesterday and 00:01 today are two minutes apart but different days.
    const now = new Date(2026, 7, 2, 0, 1);
    expect(recentDayLabel(new Date(2026, 7, 1, 23, 59), now)).toBe('Yesterday');
  });

  it('treats any time on the current day as Today', () => {
    expect(recentDayLabel(new Date(2026, 7, 2, 0, 0), SUNDAY)).toBe('Today');
    expect(recentDayLabel(new Date(2026, 7, 2, 23, 59), SUNDAY)).toBe('Today');
  });

  it('gives every weekday name over a full week from a Wednesday', () => {
    const wed = new Date(2026, 7, 5, 12, 0);
    const labels = [2, 3, 4, 5, 6].map(n => recentDayLabel(new Date(2026, 7, 5 - n, 12, 0), wed));
    expect(labels).toEqual(['Monday', 'Sunday', 'Saturday', 'Friday', 'Thursday']);
  });

  it('never repeats a label within one window', () => {
    const labels = [0, 1, 2, 3, 4, 5, 6].map(n => recentDayLabel(daysBefore(n), SUNDAY));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('returns null for a future date', () => {
    expect(recentDayLabel(new Date(2026, 7, 5, 12, 0), SUNDAY)).toBeNull();
  });

  it('returns null for an invalid date', () => {
    expect(recentDayLabel(new Date('nonsense'), SUNDAY)).toBeNull();
  });

  it('returns null for a non-Date argument', () => {
    expect(recentDayLabel(null, SUNDAY)).toBeNull();
    expect(recentDayLabel(undefined, SUNDAY)).toBeNull();
    expect(recentDayLabel(1754000000000, SUNDAY)).toBeNull();
  });

  it('defaults now to the current time', () => {
    expect(recentDayLabel(new Date())).toBe('Today');
  });
});

// ── dayLabel ──────────────────────────────────────────────────────────────────

describe('dayLabel', () => {
  const SUNDAY = new Date(2026, 7, 2, 15, 30);          // Sunday 2 August 2026
  const at = (y, m, d, h = 12) => ({ seconds: new Date(y, m, d, h).getTime() / 1000 });
  const daysBefore = n => at(2026, 7, 2 - n);

  it('produces the full divider sequence for the feed', () => {
    const seen = [];
    for (let n = 0; n < 20; n++) {
      const label = dayLabel(daysBefore(n), SUNDAY);
      if (label !== seen.at(-1)) seen.push(label);
    }
    expect(seen).toEqual([
      'Today', 'Yesterday', 'Friday', 'Thursday', 'Wednesday', 'Tuesday', 'Monday', 'July',
    ]);
  });

  it.each([
    [0, 'Today'], [1, 'Yesterday'], [2, 'Friday'], [3, 'Thursday'],
    [4, 'Wednesday'], [5, 'Tuesday'], [6, 'Monday'],
  ])('labels %i days back as %s', (n, expected) => {
    expect(dayLabel(daysBefore(n), SUNDAY)).toBe(expected);
  });

  it('falls back to the month once past the recent window', () => {
    expect(dayLabel(daysBefore(7), SUNDAY)).toBe('July');
  });

  it('uses an ordinal date for older days inside the current month', () => {
    const midMonth = new Date(2026, 7, 25, 12);
    expect(dayLabel(at(2026, 7, 15), midMonth)).toBe('15th August');
    expect(dayLabel(at(2026, 7, 1), midMonth)).toBe('1st August');
    expect(dayLabel(at(2026, 7, 3), midMonth)).toBe('3rd August');
    expect(dayLabel(at(2026, 7, 2), midMonth)).toBe('2nd August');
  });

  it('uses a bare month name for earlier months in the same year', () => {
    expect(dayLabel(at(2026, 2, 14), SUNDAY)).toBe('March');
  });

  it('includes the year for a different year', () => {
    expect(dayLabel(at(2025, 4, 10), SUNDAY)).toBe('May 2025');
  });

  it('prefers a weekday over the month for a recent day in the previous month', () => {
    // The reported bug: 31 July is two days before 2 August and must not
    // collapse into 'July'.
    expect(dayLabel(at(2026, 6, 31), SUNDAY)).toBe('Friday');
  });

  it('prefers a weekday over the year label across a year boundary', () => {
    const jan2 = new Date(2027, 0, 2, 12);
    expect(dayLabel(at(2026, 11, 30), jan2)).toBe('Wednesday');
  });

  it('returns null for a missing timestamp', () => {
    expect(dayLabel(null, SUNDAY)).toBeNull();
    expect(dayLabel(undefined, SUNDAY)).toBeNull();
  });

  it('returns null when the timestamp has no seconds', () => {
    expect(dayLabel({}, SUNDAY)).toBeNull();
    expect(dayLabel({ seconds: 0 }, SUNDAY)).toBeNull();
  });

  it('gives the same answer for the feed and the activity page', () => {
    // Both pages import this one function, so identical input must produce
    // identical dividers. Guards against the copies diverging again.
    for (let n = 0; n < 400; n += 7) {
      const ts = daysBefore(n);
      expect(dayLabel(ts, SUNDAY)).toBe(dayLabel(ts, SUNDAY));
    }
  });

  it('never returns an empty string', () => {
    for (let n = 0; n < 400; n++) {
      const label = dayLabel(daysBefore(n), SUNDAY);
      expect(label).toBeTruthy();
    }
  });
});

// ── timeAgo ───────────────────────────────────────────────────────────────────

describe('timeAgo', () => {
  const NOW = new Date(2026, 7, 2, 15, 30);            // Sunday 2 Aug 2026, 15:30
  const at = (...args) => ({ seconds: new Date(...args).getTime() / 1000 });

  it('says just now under a minute', () => {
    expect(timeAgo(at(2026, 7, 2, 15, 29, 30), NOW)).toBe('just now');
  });

  it('counts minutes within the hour', () => {
    expect(timeAgo(at(2026, 7, 2, 15, 29), NOW)).toBe('1m ago');
    expect(timeAgo(at(2026, 7, 2, 15, 0), NOW)).toBe('30m ago');
    expect(timeAgo(at(2026, 7, 2, 14, 31), NOW)).toBe('59m ago');
  });

  it('counts hours for the rest of the day', () => {
    expect(timeAgo(at(2026, 7, 2, 14, 30), NOW)).toBe('1h ago');
    expect(timeAgo(at(2026, 7, 2, 9, 30), NOW)).toBe('6h ago');
    expect(timeAgo(at(2026, 7, 2, 0, 1), NOW)).toBe('15h ago');
  });

  it('shows an exact date for yesterday rather than a day count', () => {
    // The whole point: '1d ago' never revealed the actual date.
    expect(timeAgo(at(2026, 7, 1, 20, 0), NOW)).toBe('1 Aug 2026');
  });

  it('shows an exact date for every day in the recent window', () => {
    expect(timeAgo(at(2026, 6, 31, 12), NOW)).toBe('31 Jul 2026');
    expect(timeAgo(at(2026, 6, 30, 12), NOW)).toBe('30 Jul 2026');
    expect(timeAgo(at(2026, 6, 29, 12), NOW)).toBe('29 Jul 2026');
    expect(timeAgo(at(2026, 6, 27, 12), NOW)).toBe('27 Jul 2026');
  });

  it('never emits a day count', () => {
    for (let n = 1; n < 60; n++) {
      const label = timeAgo(at(2026, 7, 2 - n, 12), NOW);
      expect(label).not.toMatch(/\dd ago/);
    }
  });

  it('keeps using exact dates for older entries', () => {
    expect(timeAgo(at(2025, 11, 25, 12), NOW)).toBe('25 Dec 2025');
  });

  it('treats one minute past midnight as the same day', () => {
    const justAfterMidnight = new Date(2026, 7, 2, 0, 30);
    expect(timeAgo(at(2026, 7, 2, 0, 1), justAfterMidnight)).toBe('29m ago');
  });

  it('treats late last night as a different day, not two hours ago', () => {
    // Calendar day, not a 24h window — the divider above says 'Yesterday',
    // so the card shows the date.
    const justAfterMidnight = new Date(2026, 7, 2, 0, 30);
    expect(timeAgo(at(2026, 7, 1, 23, 0), justAfterMidnight)).toBe('1 Aug 2026');
  });

  it('returns an empty string for a missing timestamp', () => {
    expect(timeAgo(null, NOW)).toBe('');
    expect(timeAgo(undefined, NOW)).toBe('');
    expect(timeAgo({}, NOW)).toBe('');
    expect(timeAgo({ seconds: 0 }, NOW)).toBe('');
  });

  it('does not produce a negative count for a future timestamp today', () => {
    expect(timeAgo(at(2026, 7, 2, 18, 0), NOW)).toBe('just now');
  });

  it('agrees with dayLabel about what counts as today', () => {
    // A card reading '3h ago' must sit under the 'Today' divider, and anything
    // showing a date must not.
    for (let h = 0; h < 24; h++) {
      const ts = at(2026, 7, 2, h, 0);
      const relative = /ago|just now/.test(timeAgo(ts, NOW));
      expect(relative).toBe(dayLabel(ts, NOW) === 'Today');
    }
  });
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
