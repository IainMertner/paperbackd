import { describe, it, expect } from 'vitest';
import {
  generateInviteCode, normaliseInviteCode, isValidInviteCode,
  clubMember, isClubMember, isClubAdmin, isClubOwner, memberList, canDemote,
  splitMeetings, attendees, attendanceLabel, suggesterLabel,
  segmentBounds, uniformWeights, targetRotation, segmentAtPointer, pickWinnerIndex,
  canSpin, wheelOrder, segmentColour, selectionWeights, selectionChances, recencyWeight, SELECTION_DEFAULTS,
  spikeRingPath, spikeRingPoints, spikeCountFor,
} from '../js/club-utils.js';
import { THEMES, themeColour, readableInk, hexToHsl } from '../js/utils.js';

const club = {
  ownerUid: 'u1',
  members: {
    u1: { role: 'admin',  username: 'iain' },
    u2: { role: 'member', username: 'alex' },
    u3: { role: 'admin',  username: 'bo' },
  },
};

// A date that behaves like a Firestore Timestamp.
const ts = iso => ({ toDate: () => new Date(iso) });

describe('invite codes', () => {
  it('generates a code of the right shape', () => {
    const code = generateInviteCode(n => new Uint8Array(n).fill(0));
    expect(code).toHaveLength(8);
    expect(isValidInviteCode(code)).toBe(true);
  });

  it('is deterministic given the bytes', () => {
    const bytes = n => Uint8Array.from({ length: n }, (_, i) => i);
    expect(generateInviteCode(bytes)).toBe(generateInviteCode(bytes));
  });

  // These are read aloud and typed from a message, so the pairs people confuse
  // are left out of the alphabet entirely.
  it('never produces I, O, 0 or 1', () => {
    for (let seed = 0; seed < 256; seed++) {
      const code = generateInviteCode(n => Uint8Array.from({ length: n }, (_, i) => (seed + i) % 256));
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it('accepts a pasted code with spaces, hyphens and the wrong case', () => {
    expect(normaliseInviteCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(isValidInviteCode('abcd-2345')).toBe(true);
    expect(isValidInviteCode('ABCD 2345')).toBe(true);
  });

  it('rejects the wrong length or a letter outside the alphabet', () => {
    expect(isValidInviteCode('ABCD234')).toBe(false);
    expect(isValidInviteCode('ABCD23456')).toBe(false);
    expect(isValidInviteCode('ABCD234O')).toBe(false);
    expect(isValidInviteCode('')).toBe(false);
    expect(isValidInviteCode(null)).toBe(false);
  });

  it('normalises junk to an empty string rather than throwing', () => {
    expect(normaliseInviteCode(null)).toBe('');
    expect(normaliseInviteCode(undefined)).toBe('');
    expect(normaliseInviteCode(12345678)).toBe('12345678');
  });
});

describe('membership', () => {
  it('finds a member and their role', () => {
    expect(clubMember(club, 'u2').username).toBe('alex');
    expect(isClubMember(club, 'u2')).toBe(true);
    expect(isClubAdmin(club, 'u1')).toBe(true);
    expect(isClubAdmin(club, 'u2')).toBe(false);
  });

  it('treats a stranger as no one', () => {
    expect(clubMember(club, 'nobody')).toBeNull();
    expect(isClubMember(club, 'nobody')).toBe(false);
    expect(isClubAdmin(club, 'nobody')).toBe(false);
  });

  // members is a plain object, so every inherited key is a would-be member.
  it('ignores inherited properties', () => {
    for (const uid of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(isClubMember(club, uid)).toBe(false);
      expect(isClubAdmin(club, uid)).toBe(false);
    }
  });

  it('is safe on junk', () => {
    expect(isClubMember(null, 'u1')).toBe(false);
    expect(isClubMember({}, 'u1')).toBe(false);
    expect(isClubMember(club, '')).toBe(false);
    expect(isClubMember(club, null)).toBe(false);
    expect(memberList(null)).toEqual([]);
  });

  it('lists admins first, then alphabetically', () => {
    expect(memberList(club).map(m => m.username)).toEqual(['bo', 'iain', 'alex']);
  });

  it('identifies the owner', () => {
    expect(isClubOwner(club, 'u1')).toBe(true);
    expect(isClubOwner(club, 'u3')).toBe(false);
    expect(isClubOwner(null, 'u1')).toBe(false);
  });
});

describe('canDemote', () => {
  it('allows demoting an admin when another remains', () => {
    expect(canDemote(club, 'u3')).toBe(true);
  });

  // Losing the last admin would leave the club with nobody able to run it, and
  // no screen anywhere that could undo it.
  it('refuses to demote the last admin', () => {
    const solo = { ownerUid: 'u9', members: { u9: { role: 'admin' }, u2: { role: 'member' } } };
    expect(canDemote(solo, 'u9')).toBe(false);
  });

  it('never demotes the owner, even with other admins around', () => {
    expect(canDemote(club, 'u1')).toBe(false);
  });

  it('refuses for someone who is not an admin', () => {
    expect(canDemote(club, 'u2')).toBe(false);
    expect(canDemote(club, 'nobody')).toBe(false);
  });
});

describe('splitMeetings', () => {
  const held1   = { id: 'a', held: true,  date: ts('2026-08-10') };
  const held2   = { id: 'b', held: true,  date: ts('2026-09-14') };
  const planned = { id: 'c', held: false, date: ts('2026-10-12') };

  it('separates the meeting to come from the ones that happened', () => {
    const { next, history } = splitMeetings([held1, planned, held2]);
    expect(next.id).toBe('c');
    expect(history.map(m => m.id)).toEqual(['b', 'a']);   // newest first
  });

  it('returns no next meeting when nothing is planned', () => {
    expect(splitMeetings([held1, held2]).next).toBeNull();
  });

  // Only one should ever be unheld, but a second must not silently vanish.
  it('surfaces extra planned meetings rather than hiding them', () => {
    const later = { id: 'd', held: false, date: ts('2026-11-01') };
    const { next, alsoPlanned } = splitMeetings([later, planned]);
    expect(next.id).toBe('c');
    expect(alsoPlanned.map(m => m.id)).toEqual(['d']);
  });

  it('keeps an undated planned meeting rather than dropping it', () => {
    const { next } = splitMeetings([{ id: 'x', held: false }]);
    expect(next.id).toBe('x');
  });

  it('is safe on junk', () => {
    expect(splitMeetings(null)).toEqual({ next: null, alsoPlanned: [], history: [] });
    expect(splitMeetings([null, undefined]).history).toEqual([]);
  });
});

describe('attendance', () => {
  const meeting = { attendees: ['u1', 'u2'] };

  it('resolves uids to members', () => {
    expect(attendees(meeting, club).map(p => p.username)).toEqual(['iain', 'alex']);
  });

  // Attendance is a record of who was in the room. Someone leaving the club
  // afterwards does not make that untrue.
  it('keeps someone who has since left the club', () => {
    const people = attendees({ attendees: ['u1', 'gone'] }, club);
    expect(people).toHaveLength(2);
    expect(people[1].former).toBe(true);
  });

  it('labels a mixed list', () => {
    expect(attendanceLabel({ attendees: ['u1', 'gone'] }, club)).toBe('Attendees: iain, 1 former member');
    expect(attendanceLabel({ attendees: ['u1', 'u2'] }, club)).toBe('Attendees: iain, alex');
  });

  it('says so when nobody was recorded', () => {
    expect(attendanceLabel({ attendees: [] }, club)).toBe('No attendance recorded');
    expect(attendanceLabel({}, club)).toBe('No attendance recorded');
  });
});

describe('spikeRingPath', () => {
  const path = spikeRingPath(60, 60, 41, 54, 18);

  it('draws a closed path', () => {
    expect(path.startsWith('M')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
  });

  it('has two vertices per spike', () => {
    expect(path.match(/[ML]/g)).toHaveLength(36);
  });

  // A spike points straight up, so the ring never looks accidentally rotated.
  it('starts at the top', () => {
    const [x, y] = path.slice(1).split('L')[0].split(' ').map(Number);
    expect(x).toBeCloseTo(60, 1);
    expect(y).toBeCloseTo(6, 1);   // cy - outer
  });

  it('alternates between the two radii', () => {
    const pts = path.slice(1, -1).split(/[ML]/).filter(Boolean)
      .map(p => p.split(' ').map(Number));
    pts.forEach(([x, y], i) => {
      const r = Math.hypot(x - 60, y - 60);
      expect(r).toBeCloseTo(i % 2 === 0 ? 54 : 41, 1);
    });
  });

  it('never reaches outside the outer radius', () => {
    const pts = path.slice(1, -1).split(/[ML]/).filter(Boolean)
      .map(p => p.split(' ').map(Number));
    for (const [x, y] of pts) {
      expect(Math.hypot(x - 60, y - 60)).toBeLessThanOrEqual(54.01);
    }
  });

  it('refuses a shape that is not a ring', () => {
    expect(spikeRingPath(60, 60, 41, 54, 2)).toBe('');
    expect(spikeRingPath(60, 60, 41, 0, 18)).toBe('');
  });
});

// themeColour is what stops a stored colour reaching a style attribute
// unchecked. Club colours are written into inline styles on the clubs list.
describe('themeColour', () => {
  it('accepts a colour from the palette', () => {
    for (const { color } of THEMES) expect(themeColour(color)).toBe(color);
  });

  it('rejects anything not offered', () => {
    expect(themeColour('#123456')).toBeNull();
    expect(themeColour('red')).toBeNull();
    expect(themeColour('')).toBeNull();
    expect(themeColour(null)).toBeNull();
    expect(themeColour(undefined)).toBeNull();
  });

  // The value lands inside a style attribute, so a stored string that closes it
  // must never come back out.
  it('rejects an attempt to break out of the style attribute', () => {
    expect(themeColour('#6C6460;background:url(x)')).toBeNull();
    expect(themeColour('red" onload="alert(1)')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(themeColour('  #6C6460  ')).toBe('#6C6460');
  });
});

describe('the wheel geometry', () => {
  const even = uniformWeights(6);

  // The one property that matters: the wheel stops on the book it says won.
  // Getting this wrong is invisible until someone notices the pointer sitting on
  // a different slice from the name announced.
  it('lands on the winner for every segment count', () => {
    for (let count = 2; count <= 12; count++) {
      const bounds = segmentBounds(uniformWeights(count));
      for (let index = 0; index < count; index++) {
        expect(segmentAtPointer(targetRotation(index, bounds), bounds)).toBe(index);
      }
    }
  });

  it('lands on the winner with uneven weights too', () => {
    const bounds = segmentBounds([5, 1, 3, 0.2, 9]);
    for (let index = 0; index < 5; index++) {
      expect(segmentAtPointer(targetRotation(index, bounds), bounds)).toBe(index);
    }
  });

  it('lands on the winner whatever the number of turns', () => {
    const bounds = segmentBounds(uniformWeights(7));
    for (const turns of [0, 1, 3, 5, 12]) {
      expect(segmentAtPointer(targetRotation(2, bounds, turns), bounds)).toBe(2);
    }
  });

  it('spins forwards, through whole turns', () => {
    const b = segmentBounds(even);
    expect(targetRotation(0, b, 5)).toBeGreaterThan(targetRotation(0, b, 1));
    expect(targetRotation(0, b, 5) - targetRotation(0, b, 4)).toBeCloseTo(Math.PI * 2);
  });

  // Slices must be sized by weight, or the wheel misrepresents the odds.
  it('sizes each slice by its weight', () => {
    const bounds = segmentBounds([3, 1]);
    expect(bounds[0].end - bounds[0].start).toBeCloseTo(Math.PI * 1.5);
    expect(bounds[1].end - bounds[1].start).toBeCloseTo(Math.PI * 0.5);
  });

  it('covers the full circle exactly once', () => {
    const bounds = segmentBounds([2, 5, 1, 4]);
    expect(bounds[0].start).toBe(0);
    expect(bounds[bounds.length - 1].end).toBeCloseTo(Math.PI * 2);
    for (let i = 1; i < bounds.length; i++) expect(bounds[i].start).toBeCloseTo(bounds[i - 1].end);
  });

  it('is safe with nothing on the wheel', () => {
    expect(segmentBounds([])).toEqual([]);
    expect(segmentBounds(null)).toEqual([]);
    expect(segmentBounds([0, 0])).toEqual([]);
    expect(targetRotation(0, [])).toBe(0);
    expect(segmentAtPointer(0, [])).toBe(-1);
    expect(pickWinnerIndex([])).toBe(-1);
  });

  it('picks in proportion to the weights', () => {
    // Boundaries of a [1, 3] wheel: index 0 holds the first quarter.
    expect(pickWinnerIndex([1, 3], () => 0)).toBe(0);
    expect(pickWinnerIndex([1, 3], () => 0.24)).toBe(0);
    expect(pickWinnerIndex([1, 3], () => 0.26)).toBe(1);
    expect(pickWinnerIndex([1, 3], () => 0.99)).toBe(1);
    // random() is documented as < 1, but exactly 1 must not index past the end.
    expect(pickWinnerIndex([1, 3], () => 1)).toBe(1);
  });

  it('never picks a weightless entry', () => {
    for (let i = 0; i < 200; i++) expect(pickWinnerIndex([0, 1, 0])).toBe(1);
  });

  it('needs at least two books to decide anything', () => {
    expect(canSpin([])).toBe(false);
    expect(canSpin([{ uid: 'a' }])).toBe(false);
    expect(canSpin([{ uid: 'a' }, { uid: 'b' }])).toBe(true);
    expect(canSpin(null)).toBe(false);
  });

  it('orders the wheel stably', () => {
    const recs = [{ uid: 'c' }, { uid: 'a' }, { uid: 'b' }];
    expect(wheelOrder(recs).map(r => r.uid)).toEqual(['a', 'b', 'c']);
    expect(wheelOrder([...recs].reverse()).map(r => r.uid)).toEqual(['a', 'b', 'c']);
  });

  it('drops junk from the wheel rather than rendering a blank slice', () => {
    expect(wheelOrder([null, { uid: 'a' }, {}, undefined]).map(r => r.uid)).toEqual(['a']);
    expect(wheelOrder(null)).toEqual([]);
  });

  it('never gives neighbouring slices the same colour', () => {
    for (let count = 2; count <= 12; count++) {
      for (let i = 0; i < count; i++) {
        expect(segmentColour(i, count)).not.toBe(segmentColour((i + 1) % count, count));
      }
    }
  });
});

describe('selectionWeights', () => {
  const entries = [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }];
  const at = iso => ({ toDate: () => new Date(iso) });
  // Newest last in the array on purpose: the function sorts, and relying on the
  // caller's order would be a bug waiting for an unsorted list.
  const history = [
    { held: true, date: at('2026-06-01'), suggestedBy: 'a', attendees: ['a', 'b'] },
    { held: true, date: at('2026-07-01'), suggestedBy: 'a', attendees: ['a', 'b', 'c'] },
    { held: true, date: at('2026-08-01'), suggestedBy: 'b', attendees: ['b'] },
  ];

  const weighted = extra => selectionWeights(entries, history, { method: 'weighted', pickWeight: 0, attendWeight: 0, allowRepeat: true, ...extra });

  it('is uniform when the method is not weighted', () => {
    const even = { ...SELECTION_DEFAULTS, allowRepeat: true };
    expect(selectionWeights(entries, history, even)).toEqual([1, 1, 1]);
    expect(selectionWeights(entries, [], null)).toEqual([1, 1, 1]);
  });

  // The two settings have to agree where they meet, or switching to weighted
  // with the dials down would visibly change the wheel for no stated reason.
  it('is uniform when weighted with both dials at zero', () => {
    expect(weighted()).toEqual([1, 1, 1]);
  });

  it('penalises whoever has been picked most recently and often', () => {
    const w = weighted({ pickWeight: 1 });
    // 'a' won twice, 'b' won once but most recently, 'c' has never won.
    expect(w[2]).toBeGreaterThan(w[0]);
    expect(w[2]).toBeGreaterThan(w[1]);
    expect(w[2]).toBe(1);   // never picked, so no penalty at all
  });

  // Weights are scaled against the busiest member on the wheel, so recency shows
  // as a comparison between candidates rather than an absolute. One entry on its
  // own is always its own maximum, and would look the same however long ago it
  // won - which is fine, because a wheel of one has nothing to decide.
  it('counts a recent win more heavily than an old one', () => {
    const w = selectionWeights([{ uid: 'recent' }, { uid: 'old' }], [
      { held: true, date: at('2026-08-01'), suggestedBy: 'recent' },
      { held: true, date: at('2026-07-01'), suggestedBy: 'nobody' },
      { held: true, date: at('2026-06-01'), suggestedBy: 'nobody' },
      { held: true, date: at('2026-05-01'), suggestedBy: 'old' },
    ], { method: 'weighted', pickWeight: 1, attendWeight: 0 });
    expect(w[1]).toBeGreaterThan(w[0]);
  });

  it('penalises two wins more than one, all else equal', () => {
    const w = selectionWeights([{ uid: 'twice' }, { uid: 'once' }], [
      { held: true, date: at('2026-08-01'), suggestedBy: 'twice' },
      { held: true, date: at('2026-07-01'), suggestedBy: 'once' },
      { held: true, date: at('2026-06-01'), suggestedBy: 'twice' },
    ], { method: 'weighted', pickWeight: 1, attendWeight: 0 });
    expect(w[1]).toBeGreaterThan(w[0]);
  });

  it('rewards whoever turns up most', () => {
    const w = weighted({ attendWeight: 1 });
    // 'b' came to all three, 'c' to one.
    expect(w[1]).toBeGreaterThan(w[2]);
  });

  it('leaves a book an admin chose by hand counting against nobody', () => {
    const w = selectionWeights(entries, [
      { held: true, date: at('2026-08-01'), attendees: [] },   // no suggestedBy
    ], { method: 'weighted', pickWeight: 1, attendWeight: 0 });
    expect(w).toEqual([1, 1, 1]);
  });

  it('ignores meetings that have not happened', () => {
    const w = selectionWeights(entries, [
      { held: false, date: at('2026-08-01'), suggestedBy: 'a', attendees: ['a'] },
    ], { method: 'weighted', pickWeight: 1, attendWeight: 1 });
    expect(w).toEqual([1, 1, 1]);
  });

  // Every book has to keep a real chance, or the wheel has a slice of width zero
  // that can never be landed on.
  it('never produces a weight of zero', () => {
    for (const w of weighted({ pickWeight: 1, attendWeight: 1 })) {
      expect(w).toBeGreaterThan(0);
    }
  });

  it('leaves everything weighted when repeats are allowed', () => {
    const w = selectionWeights(entries, history, { method: 'uniform', allowRepeat: true });
    expect(w).toEqual([1, 1, 1]);
  });

  it('clamps dials outside 0 to 1', () => {
    expect(weighted({ pickWeight: 5 })).toEqual(weighted({ pickWeight: 1 }));
    expect(weighted({ pickWeight: -3 })).toEqual(weighted({ pickWeight: 0 }));
    expect(weighted({ attendWeight: NaN })).toEqual(weighted({ attendWeight: 0 }));
  });

  it('is safe with no history and no entries', () => {
    expect(selectionWeights(entries, [], { method: 'weighted', pickWeight: 1, attendWeight: 1 })).toEqual([1, 1, 1]);
    expect(selectionWeights([], history, { method: 'weighted' })).toEqual([]);
    expect(selectionWeights(null, null, null)).toEqual([]);
  });

  // A uid of 'constructor' must not find something on Object.prototype.
  it('is safe with awkward uids', () => {
    const odd = [{ uid: 'constructor' }, { uid: '__proto__' }];
    const w = selectionWeights(odd, history, { method: 'weighted', pickWeight: 1, attendWeight: 1 });
    expect(w).toHaveLength(2);
    for (const n of w) expect(Number.isFinite(n)).toBe(true);
  });
});

describe('selectionChances', () => {
  it('turns weights into shares that sum to one', () => {
    const chances = selectionChances([1, 3]);
    expect(chances[0]).toBeCloseTo(0.25);
    expect(chances[1]).toBeCloseTo(0.75);
    expect(chances.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('is all zeroes rather than NaN when there is nothing to share', () => {
    expect(selectionChances([0, 0])).toEqual([0, 0]);
    expect(selectionChances([])).toEqual([]);
    expect(selectionChances(null)).toEqual([]);
  });
});

describe('recencyWeight', () => {
  it('halves every half-life', () => {
    expect(recencyWeight(0)).toBe(1);
    expect(recencyWeight(3)).toBeCloseTo(0.5);
    expect(recencyWeight(6)).toBeCloseTo(0.25);
  });

  it('never goes negative or above one', () => {
    expect(recencyWeight(-5)).toBe(1);
    expect(recencyWeight(100)).toBeGreaterThan(0);
    expect(recencyWeight(100)).toBeLessThan(0.01);
  });
});

// The Spin button is painted in the club's colour, and the palette runs light
// enough at one end that a single hardcoded label colour is wrong there.
describe('readableInk', () => {
  it('puts dark ink on the light theme colour', () => {
    expect(readableInk('#D4AA55')).toBe('#33302B');
  });

  it('puts white ink on the darker theme colours', () => {
    for (const c of ['#6C6460', '#6B7B3A', '#B85C3A', '#3A9E8C', '#8B2252', '#2E62A0', '#C95C80']) {
      expect(readableInk(c)).toBe('#FFFFFF');
    }
  });

  it('handles the extremes', () => {
    expect(readableInk('#FFFFFF')).toBe('#33302B');
    expect(readableInk('#000000')).toBe('#FFFFFF');
  });

  it('accepts a hex with or without the hash, in either case', () => {
    expect(readableInk('d4aa55')).toBe('#33302B');
    expect(readableInk('#d4aa55')).toBe('#33302B');
  });

  it('falls back to the light ink on junk rather than throwing', () => {
    expect(readableInk('')).toBe('#FFFFFF');
    expect(readableInk(null)).toBe('#FFFFFF');
    expect(readableInk('red')).toBe('#FFFFFF');
    expect(readableInk('#fff')).toBe('#FFFFFF');
  });

  it('takes custom inks', () => {
    expect(readableInk('#000000', 'L', 'D')).toBe('L');
    expect(readableInk('#FFFFFF', 'L', 'D')).toBe('D');
  });
});


// ── No two turns in a row ────────────────────────────────────────────────────
//
// A separate rule from the weighting: the dials can only make a repeat
// unlikely, and a club usually wants it impossible.

describe('selectionWeights - the no-repeat rule', () => {
  const at = iso => ({ toDate: () => new Date(iso) });
  const entries = [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }];
  const history = [
    { held: true, date: at('2026-07-01'), suggestedBy: 'a', attendees: ['a', 'b', 'c'] },
    { held: true, date: at('2026-08-01'), suggestedBy: 'b', attendees: ['a', 'b', 'c'] },
  ];

  it('is off by default', () => {
    expect(SELECTION_DEFAULTS.allowRepeat).toBe(false);
  });

  it('zeroes whoever won the most recent meeting', () => {
    const w = selectionWeights(entries, history, { method: 'uniform' });
    expect(w).toEqual([1, 0, 1]);   // 'b' won last
  });

  // The rule is about who can win, not about the weighting, so an even wheel
  // honours it too.
  it('applies to the weighted wheel as well', () => {
    const w = selectionWeights(entries, history, { method: 'weighted', pickWeight: 0.5, attendWeight: 0.5 });
    expect(w[1]).toBe(0);
    expect(w[0]).toBeGreaterThan(0);
    expect(w[2]).toBeGreaterThan(0);
  });

  it('only excludes the last winner, not earlier ones', () => {
    const w = selectionWeights(entries, history, { method: 'uniform' });
    expect(w[0]).toBe(1);   // 'a' won the meeting before, and is eligible again
  });

  it('excludes nobody when the last meeting had no suggester', () => {
    const w = selectionWeights(entries, [
      { held: true, date: at('2026-08-01'), attendees: ['a'] },
    ], { method: 'uniform' });
    expect(w).toEqual([1, 1, 1]);
  });

  // An unheld meeting is the one being planned. Its book has not been read yet,
  // so it cannot have cost anyone a turn.
  it('ignores a meeting that has not happened', () => {
    const w = selectionWeights(entries, [
      { held: false, date: at('2026-09-01'), suggestedBy: 'c' },
      { held: true,  date: at('2026-08-01'), suggestedBy: 'b' },
    ], { method: 'uniform' });
    expect(w).toEqual([1, 0, 1]);
  });

  it('excludes nobody with no history at all', () => {
    expect(selectionWeights(entries, [], { method: 'uniform' })).toEqual([1, 1, 1]);
    expect(selectionWeights(entries, null, { method: 'uniform' })).toEqual([1, 1, 1]);
  });

  // The guard. A wheel with no landable segment cannot be spun and cannot
  // recover, so having a turn twice is the lesser problem.
  it('ignores the rule rather than emptying the wheel', () => {
    const solo = [{ uid: 'b' }];
    const w = selectionWeights(solo, history, { method: 'uniform' });
    expect(w).toEqual([1]);
  });

  it('ignores the rule rather than emptying a weighted wheel', () => {
    const solo = [{ uid: 'b' }];
    const w = selectionWeights(solo, history, { method: 'weighted', pickWeight: 1, attendWeight: 1 });
    expect(w).toHaveLength(1);
    expect(w[0]).toBeGreaterThan(0);
  });

  // Every entry being the same person should not happen, but the guard has to
  // hold if it ever does.
  it('ignores the rule when every entry is the last winner', () => {
    const w = selectionWeights([{ uid: 'b' }, { uid: 'b' }], history, { method: 'uniform' });
    expect(w).toEqual([1, 1]);
  });

  it('leaves a zeroed entry unlandable but still in place', () => {
    const weights = selectionWeights(entries, history, { method: 'uniform' });
    const bounds = segmentBounds(weights);
    // Indices stay aligned with the entries, so the list and the wheel agree.
    expect(bounds).toHaveLength(3);
    expect(bounds[1].end - bounds[1].start).toBe(0);
    for (let i = 0; i < 200; i++) expect(pickWinnerIndex(weights)).not.toBe(1);
  });

  it('reports a zeroed entry as no chance at all', () => {
    const chances = selectionChances(selectionWeights(entries, history, { method: 'uniform' }));
    expect(chances[1]).toBe(0);
    expect(chances[0]).toBeCloseTo(0.5);
  });
});


describe('suggesterLabel', () => {
  it('names whoever put the book forward', () => {
    expect(suggesterLabel({ suggestedBy: 'u2' }, club)).toBe('Picked by alex');
  });

  // The uid is what is stored, so a rename follows without a migration.
  it('reads the current name from the roster', () => {
    const renamed = { ...club, members: { ...club.members, u2: { role: 'member', username: 'alexandra' } } };
    expect(suggesterLabel({ suggestedBy: 'u2' }, renamed)).toBe('Picked by alexandra');
  });

  // Somebody leaving does not make it untrue that they chose the book.
  it('still credits someone who has left the club', () => {
    expect(suggesterLabel({ suggestedBy: 'gone' }, club)).toBe('Picked by a former member');
  });

  it('says nothing when no one suggested it', () => {
    expect(suggesterLabel({}, club)).toBe('');
    expect(suggesterLabel({ suggestedBy: '' }, club)).toBe('');
    expect(suggesterLabel(null, club)).toBe('');
  });

  it('is safe with no club', () => {
    expect(suggesterLabel({ suggestedBy: 'u2' }, null)).toBe('Picked by a former member');
  });

  // members is a plain object, so an inherited key must not resolve to a name.
  it('does not credit an inherited property', () => {
    expect(suggesterLabel({ suggestedBy: 'constructor' }, club)).toBe('Picked by a former member');
  });
});


// ── The wheel's colours ──────────────────────────────────────────────────────

describe('hexToHsl', () => {
  it('reads the primaries', () => {
    expect(hexToHsl('#FF0000')).toMatchObject({ h: 0, s: 100, l: 50 });
    expect(hexToHsl('#00FF00')).toMatchObject({ h: 120, s: 100, l: 50 });
    expect(hexToHsl('#0000FF')).toMatchObject({ h: 240, s: 100, l: 50 });
  });

  it('reads greys as unsaturated', () => {
    expect(hexToHsl('#808080').s).toBe(0);
    expect(hexToHsl('#000000').l).toBe(0);
    expect(hexToHsl('#FFFFFF').l).toBe(100);
  });

  it('accepts a hex with or without the hash, in either case', () => {
    expect(hexToHsl('ff0000')).toMatchObject({ h: 0 });
    expect(hexToHsl('#Ff0000')).toMatchObject({ h: 0 });
  });

  it('returns null for anything that is not a six-digit hex', () => {
    expect(hexToHsl('#fff')).toBeNull();
    expect(hexToHsl('red')).toBeNull();
    expect(hexToHsl('')).toBeNull();
    expect(hexToHsl(null)).toBeNull();
  });

  it('never reports a negative hue', () => {
    for (const { color } of THEMES) {
      const hsl = hexToHsl(color);
      expect(hsl.h).toBeGreaterThanOrEqual(0);
      expect(hsl.h).toBeLessThan(360);
    }
  });
});

describe('segmentColour', () => {
  const hsl = css => {
    const [, h, sat, l] = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(css).map(Number);
    return { h, s: sat, l };
  };

  it('keeps every slice on the club\u2019s hue', () => {
    const base = '#8B2252';
    const want = Math.round(hexToHsl(base).h);
    for (let i = 0; i < 8; i++) expect(hsl(segmentColour(i, 8, base)).h).toBe(want);
  });

  it('never gives neighbouring slices the same colour', () => {
    for (const base of THEMES.map(t => t.color)) {
      for (let count = 2; count <= 12; count++) {
        for (let i = 0; i < count; i++) {
          expect(segmentColour(i, count, base)).not.toBe(segmentColour((i + 1) % count, count, base));
        }
      }
    }
  });

  // The shades are pastels, which is why slice labels are drawn in dark ink.
  // Nothing may drift dark enough to swallow that text.
  it('stays in the pastel band for every theme', () => {
    for (const { color } of THEMES) {
      for (let i = 0; i < 6; i++) {
        const l = hsl(segmentColour(i, 6, color)).l;
        expect(l).toBeGreaterThanOrEqual(66);
        expect(l).toBeLessThanOrEqual(94);
      }
    }
  });

  // Offsetting lightness from the base made the light themes collapse: four of
  // the yellow's six shades hit the ceiling and differed only in saturation.
  it('gives the light and dark themes the same spread', () => {
    const lights = base => [...Array(6)].map((_, i) => hsl(segmentColour(i, 6, base)).l);
    expect(new Set(lights('#D4AA55')).size).toBe(6);
    expect(new Set(lights('#8B2252')).size).toBe(6);
    expect(lights('#D4AA55')).toEqual(lights('#8B2252'));
  });

  it('falls back to the accent hue when the club has no colour', () => {
    expect(segmentColour(0, 4, undefined)).toBe(segmentColour(0, 4, '#6B7B3A'));
    expect(segmentColour(0, 4, 'nonsense')).toBe(segmentColour(0, 4, '#6B7B3A'));
  });

  it('keeps a grey theme grey rather than inventing colour', () => {
    for (let i = 0; i < 6; i++) expect(hsl(segmentColour(i, 6, '#6C6460')).s).toBeLessThan(30);
  });
});

describe('spikeRingPoints and spikeCountFor', () => {
  it('gives two vertices per tooth, alternating radius', () => {
    const pts = spikeRingPoints(50, 50, 40, 48, 10);
    expect(pts).toHaveLength(20);
    pts.forEach(([x, y], i) => {
      expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(i % 2 === 0 ? 48 : 40, 5);
    });
  });

  // One definition of the star, two ways of painting it: the SVG path used by
  // the club icon and the canvas ring around the wheel must agree.
  it('agrees with the path the icon draws', () => {
    const pts = spikeRingPoints(60, 60, 43, 47, 14);
    const path = spikeRingPath(60, 60, 43, 47, 14);
    const fromPath = path.slice(1, -1).split(/[ML]/).filter(Boolean).map(p => p.split(' ').map(Number));
    expect(fromPath).toHaveLength(pts.length);
    fromPath.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(pts[i][0], 1);
      expect(y).toBeCloseTo(pts[i][1], 1);
    });
  });

  it('is empty for a shape that is not a ring', () => {
    expect(spikeRingPoints(0, 0, 1, 2, 2)).toEqual([]);
    expect(spikeRingPoints(0, 0, 1, 0, 10)).toEqual([]);
  });

  // A fixed tooth count looks right at one size only, so the count follows the
  // radius to keep teeth roughly the same width on the icon and on the wheel.
  it('scales the tooth count with the radius', () => {
    expect(spikeCountFor(150)).toBeGreaterThan(spikeCountFor(47));
  });

  it('keeps the tooth width roughly constant', () => {
    for (const r of [40, 80, 150, 300]) {
      const width = (2 * Math.PI * r) / spikeCountFor(r);
      expect(width).toBeGreaterThan(15);
      expect(width).toBeLessThan(45);
    }
  });

  it('stays within sane bounds at the extremes', () => {
    expect(spikeCountFor(1)).toBe(12);
    expect(spikeCountFor(100000)).toBe(48);
    expect(spikeCountFor(0)).toBe(12);
  });
});

describe('hideWeights', () => {
  it('is off by default', () => {
    expect(SELECTION_DEFAULTS.hideWeights).toBe(false);
  });

  // The setting only changes what a member is shown. selectionWeights is what
  // the spin runs on, so it must be unaffected either way, or hiding the odds
  // would quietly change them.
  it('does not affect the weights themselves', () => {
    const entries = [{ uid: 'a' }, { uid: 'b' }];
    const history = [{ held: true, date: { toDate: () => new Date('2026-08-01') }, suggestedBy: 'a', attendees: ['a'] }];
    const shown  = selectionWeights(entries, history, { method: 'weighted', hideWeights: false });
    const hidden = selectionWeights(entries, history, { method: 'weighted', hideWeights: true });
    expect(hidden).toEqual(shown);
  });

  // What a member sees instead: an even wheel, which must stay landable.
  it('an even wheel of the same size is still spinnable', () => {
    const even = uniformWeights(4);
    expect(even).toEqual([1, 1, 1, 1]);
    const bounds = segmentBounds(even);
    expect(bounds).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(segmentAtPointer(targetRotation(i, bounds), bounds)).toBe(i);
    }
  });
});

// The first version subtracted a fixed amount from saturation, which took the
// mid-saturation themes into the teens and made the wheel look muddy.
describe('segment shades are not muddy', () => {
  const sat = css => Number(/hsl\(\d+ (\d+)% \d+%\)/.exec(css)[1]);

  // A pastel is light, not washed out. Saturation has to stay up or the wedges
  // turn to grey paper.
  it('keeps a coloured theme colourful in every shade', () => {
    for (const { label, color } of THEMES) {
      if (label === 'Grey') continue;   // deliberately unsaturated
      for (let i = 0; i < 6; i++) {
        expect(sat(segmentColour(i, 6, color))).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('keeps saturation in proportion to the theme', () => {
    for (const { label, color } of THEMES) {
      if (label === 'Grey') continue;
      const base = hexToHsl(color).s;
      for (let i = 0; i < 6; i++) {
        const s = sat(segmentColour(i, 6, color));
        expect(s).toBeGreaterThan(base * 0.55);
        expect(s).toBeLessThan(base * 1.25);
      }
    }
  });

  // Scaling rather than offsetting is what keeps this true: adding saturation
  // would drag a grey theme into brown.
  it('leaves a grey theme grey', () => {
    for (let i = 0; i < 6; i++) expect(sat(segmentColour(i, 6, '#6C6460'))).toBeLessThan(15);
  });

  it('never exceeds full saturation', () => {
    for (const { color } of THEMES) {
      for (let i = 0; i < 6; i++) expect(sat(segmentColour(i, 6, color))).toBeLessThanOrEqual(92);
    }
  });
});
