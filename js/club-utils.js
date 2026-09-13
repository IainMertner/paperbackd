import { hexToHsl } from './utils.js';

// Book clubs: the parts with no Firebase and no DOM in them.
//
// A club document carries its members as a map rather than a subcollection:
//
//   members: { <uid>: { role, username, avatarUrl, avatarBorderColor, joinedAt } }
//
// Firestore rules can test `request.auth.uid in resource.data.members` on a map
// directly, so membership and admin checks cost nothing to enforce. A club is a
// few dozen people at most, so the map stays far inside the 1MB document cap and
// saves a query every time a page needs to know who is in the room.

// Meetings live in a subcollection, one document each, with `held` marking the
// line between the one that is coming and the ones that happened.

// ── Invite codes ─────────────────────────────────────────────────────────────

// No I, O, 0 or 1: these get read aloud and typed in from a message, and those
// four are the pairs people get wrong. 8 characters from a 32-symbol alphabet is
// about 40 bits, far past guessing when the only way to try one is a callable.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

// `random` is injected so a test can pin the output; it takes a count and
// returns that many integers in [0, 256).
export function generateInviteCode(random = n => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// What someone typed, turned into what is stored. People paste codes with
// spaces, hyphens and the wrong case, and all three should still get them in.
export function normaliseInviteCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidInviteCode(raw) {
  const code = normaliseInviteCode(raw);
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every(ch => CODE_ALPHABET.includes(ch));
}

// ── Membership ───────────────────────────────────────────────────────────────

// hasOwnProperty, not `club.members[uid]`: members is a plain object, so a uid
// of 'constructor' finds Object.prototype's and a uid of '__proto__' finds
// Object.prototype itself — which is an object, and so passes every gentler
// check you might reach for instead.
export function clubMember(club, uid) {
  if (!club?.members || !uid) return null;
  if (!Object.prototype.hasOwnProperty.call(club.members, uid)) return null;
  const entry = club.members[uid];
  if (!entry || typeof entry !== 'object') return null;
  return entry;
}

export function isClubMember(club, uid) {
  return !!clubMember(club, uid);
}

export function isClubAdmin(club, uid) {
  return clubMember(club, uid)?.role === 'admin';
}

// The owner is an admin who cannot be demoted or removed, so that a club can
// never end up with nobody able to administer it.
export function isClubOwner(club, uid) {
  return !!club && !!uid && club.ownerUid === uid;
}

// Admins first, then alphabetical. `joinedAt` is deliberately not the order:
// the list is used to find a person, and founding order is no help with that.
export function memberList(club) {
  if (!club?.members) return [];
  return Object.entries(club.members)
    .filter(([, m]) => m && typeof m === 'object')
    .map(([uid, m]) => ({ uid, ...m }))
    .sort((a, b) => {
      if ((a.role === 'admin') !== (b.role === 'admin')) return a.role === 'admin' ? -1 : 1;
      return String(a.username || '').localeCompare(String(b.username || ''));
    });
}

// Demoting or removing the last admin would leave the club unadministrable, and
// nothing in the UI could undo it.
export function canDemote(club, uid) {
  if (!isClubAdmin(club, uid)) return false;
  if (isClubOwner(club, uid)) return false;
  return memberList(club).filter(m => m.role === 'admin').length > 1;
}

// ── Meetings ─────────────────────────────────────────────────────────────────

// One collection, two lives: the meeting being planned is the one not yet held,
// and marking it held is what moves it into the history. Splitting here rather
// than querying keeps a composite index out of it, and a club's whole history is
// a few dozen documents.
//
// At most one meeting should be unheld at a time; if several are, the soonest is
// the next and the rest are returned as `alsoPlanned` rather than hidden.
export function splitMeetings(meetings) {
  const all = (Array.isArray(meetings) ? meetings : []).filter(Boolean);
  const planned = all.filter(m => !m.held).sort((a, b) => meetingTime(a) - meetingTime(b));
  const history = all.filter(m => m.held).sort((a, b) => meetingTime(b) - meetingTime(a));
  return { next: planned[0] || null, alsoPlanned: planned.slice(1), history };
}

// A meeting with no date sorts last among planned and first among history:
// either way it is the one with least claim to a position.
function meetingTime(meeting) {
  const d = meeting?.date?.toDate?.() ?? (meeting?.date instanceof Date ? meeting.date : null);
  return d ? d.getTime() : Number.MAX_SAFE_INTEGER;
}

export { meetingTime };

// Attendance is stored as uids so it survives a rename. Resolving against the
// member map is what turns it back into people, and anyone who has since left
// the club is kept as an unknown rather than dropped: they were there.
export function attendees(meeting, club) {
  const uids = Array.isArray(meeting?.attendees) ? meeting.attendees : [];
  return uids.map(uid => {
    const member = clubMember(club, uid);
    return member ? { uid, ...member } : { uid, username: '', role: 'member', former: true };
  });
}

// Whose book a meeting read, for the line under the title.
//
// Resolved against the roster the same way attendance is, and for the same
// reason: the uid is what is stored, so a rename follows automatically and
// somebody who has since left the club is still credited rather than dropped.
export function suggesterLabel(meeting, club) {
  const uid = meeting?.suggestedBy;
  if (!uid) return '';
  const member = clubMember(club, uid);
  return member?.username ? `Picked by ${member.username}` : 'Picked by a former member';
}

export function attendanceLabel(meeting, club) {
  const people = attendees(meeting, club);
  if (!people.length) return 'No attendance recorded';
  const named = people.filter(p => p.username).map(p => p.username);
  const unknown = people.length - named.length;
  const parts = [...named];
  if (unknown) parts.push(`${unknown} former member${unknown === 1 ? '' : 's'}`);
  return `Attendees: ${parts.join(', ')}`;
}

// ── The recommendation wheel ─────────────────────────────────────────────────
//
// Each member may put forward one book, stored as a document keyed by their uid,
// so "one each" needs no enforcing. The wheel is those books in equal segments,
// spun by an admin to choose what the club reads next.
//
// The maths lives here rather than in the canvas code because the one thing that
// must be true - that the wheel stops on the book it claims won - is exactly the
// thing that is invisible when it is wrong. The winner is chosen first and the
// rotation is derived from it, never the other way round.

// Canvas angles run clockwise from east, and the pointer sits at the top, which
// is -PI/2. Segments are sized by weight rather than evenly: a weighted wheel
// whose slices were all the same size would be lying about the odds, and the
// wheel is the only explanation of the weighting anyone actually sees.
const TAU = Math.PI * 2;

// Cumulative angles for a set of weights. An unweighted wheel is this with every
// weight equal, so there is one code path rather than two.
export function segmentBounds(weights) {
  const clean = (Array.isArray(weights) ? weights : [])
    .map(w => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (!clean.length || total <= 0) return [];
  let angle = 0;
  return clean.map(w => {
    const span = (w / total) * TAU;
    const seg = { start: angle, end: angle + span, mid: angle + span / 2 };
    angle += span;
    return seg;
  });
}

export function uniformWeights(count) {
  return count > 0 ? Array(count).fill(1) : [];
}

// Where the wheel must come to rest for `index` to sit under the pointer, given
// a whole number of extra turns for the spin to look like one.
export function targetRotation(index, bounds, turns = 5) {
  const seg = Array.isArray(bounds) ? bounds[index] : null;
  if (!seg) return 0;
  return TAU * turns - seg.mid - Math.PI / 2;
}

// The inverse: which segment is under the pointer at a given rotation. Used to
// prove the two agree rather than by the wheel itself.
export function segmentAtPointer(rotation, bounds) {
  if (!Array.isArray(bounds) || !bounds.length) return -1;
  // Undo the rotation and the pointer's offset, then normalise into [0, TAU).
  let angle = (-Math.PI / 2 - rotation) % TAU;
  if (angle < 0) angle += TAU;
  for (let i = 0; i < bounds.length; i++) {
    if (angle >= bounds[i].start && angle < bounds[i].end) return i;
  }
  // Only reachable when rounding puts the angle a hair past the final boundary.
  return bounds.length - 1;
}

// `random` is injected so a test can pin the winner.
export function pickWinnerIndex(weights, random = Math.random) {
  const clean = (Array.isArray(weights) ? weights : [])
    .map(w => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  let r = random() * total;
  for (let i = 0; i < clean.length; i++) {
    r -= clean[i];
    if (r < 0) return i;
  }
  // random() returning exactly 1, or floating point landing on the total.
  return clean.length - 1;
}

// ── Weighting ────────────────────────────────────────────────────────────────
//
// Two forces, each with its own dial from 0 to 1.
//
// A book is less likely the more recently and often its owner has already had a
// book chosen, so the same few people cannot keep winning. A member is more
// likely the more recently and often they have turned up, so the people who
// actually come to the meetings get more say in what is read.
//
// Both are exponential in the age of the meeting, measured in meetings ago
// rather than days: clubs meet irregularly, and "three meetings back" is what a
// member remembers, not "eleven weeks".
export const SELECTION_DEFAULTS = {
  method: 'uniform',
  // Chosen against the formula rather than by feel. A dial at d produces a
  // spread of exp(2d) between the extreme members, so:
  //
  //   0.80 on picks    -> up to 5x, and about 2.2x among those still eligible
  //                       once the no-repeat rule has taken the last pick out.
  //   0.15 on turnout  -> 1.35x, a nudge toward the people who come and no more.
  //
  // Both were 0.5 to begin with, which gave turnout a 2.7x say - as strong as
  // the pick penalty, and far more than it should carry.
  pickWeight: 0.8,
  attendWeight: 0.15,
  // Whether whoever was picked last time can be picked again immediately. Off
  // by default: "you just had your turn" is how a real club behaves, and the
  // weighting alone can only make a repeat unlikely, never impossible.
  allowRepeat: false,
  // Whether members other than admins see the odds. With this on they get an
  // even wheel and no percentages, so nobody can work out that their book is
  // the least likely on it. Admins always see the real thing: they are the ones
  // setting the dials, and could not judge them otherwise.
  hideWeights: false,
};

// How many meetings before something counts half as much.
const HALF_LIFE = 3;

// How far a dial at 1 can move the odds. exp(2) is about 7.4, so at full tilt
// the best-placed book is a few times likelier than the worst - a thumb on the
// scale rather than a decision. Nothing here can reach zero, so every book on
// the wheel keeps a real chance.
const STRENGTH = 2;

export function recencyWeight(age, halfLife = HALF_LIFE) {
  return Math.pow(0.5, Math.max(0, age) / halfLife);
}

const clamp01 = n => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// One weight per entry, in the same order. Uniform selection, and weighted
// selection with both dials at zero, both give all ones - the two settings agree
// at the boundary rather than jumping.
export function selectionWeights(entries, meetings, settings) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return [];

  const cfg = { ...SELECTION_DEFAULTS, ...(settings || {}) };

  // Newest first, so the index is how many meetings ago it was.
  const history = (Array.isArray(meetings) ? meetings : [])
    .filter(m => m && m.held)
    .sort((a, b) => meetingTime(b) - meetingTime(a));

  // The no-repeat rule is about the person, not the book: a winner's
  // recommendation comes off the wheel already, but nothing stops them putting
  // another one forward and winning again the very next round.
  //
  // Applied to both methods, because it is a rule about who can win rather than
  // a thumb on the scale, and an even wheel should honour it too.
  const excluded = cfg.allowRepeat ? null : (history[0]?.suggestedBy || null);
  const blocked = i => excluded !== null && list[i]?.uid === excluded;

  // Guard: never let the rule empty the wheel. With two or more books at most
  // one can be the last winner, so this is only reachable on a wheel of one -
  // but a wheel with no landable segment is unspinnable and unrecoverable, and
  // having a turn twice is the lesser problem.
  const wouldEmpty = list.every((_, i) => blocked(i));
  const withRule = weights => (wouldEmpty ? weights : weights.map((w, i) => (blocked(i) ? 0 : w)));

  if (cfg.method !== 'weighted') return withRule(uniformWeights(list.length));

  // Maps, not objects: a uid of 'constructor' would otherwise find a function.
  const picked = new Map();
  const attended = new Map();
  history.forEach((meeting, age) => {
    const r = recencyWeight(age);
    // Only meetings whose book came off the wheel carry a suggester, so a book
    // an admin set by hand counts against nobody.
    if (meeting.suggestedBy) picked.set(meeting.suggestedBy, (picked.get(meeting.suggestedBy) || 0) + r);
    for (const uid of (Array.isArray(meeting.attendees) ? meeting.attendees : [])) {
      attended.set(uid, (attended.get(uid) || 0) + r);
    }
  });

  // Scaled against the busiest member on the wheel rather than an absolute, so
  // the dials mean the same thing in a club that meets weekly and one that meets
  // twice a year.
  const scores = list.map(e => ({
    pick:   picked.get(e?.uid) || 0,
    attend: attended.get(e?.uid) || 0,
  }));
  const maxPick   = Math.max(0, ...scores.map(s => s.pick));
  const maxAttend = Math.max(0, ...scores.map(s => s.attend));

  const pw = clamp01(cfg.pickWeight);
  const aw = clamp01(cfg.attendWeight);

  return withRule(scores.map(({ pick, attend }) => {
    const p = maxPick   > 0 ? pick   / maxPick   : 0;
    const a = maxAttend > 0 ? attend / maxAttend : 0;
    return Math.exp(-pw * STRENGTH * p) * Math.exp(aw * STRENGTH * a);
  }));
}

// What each entry's weight is worth as a share of the wheel, for showing the
// odds beside the books.
export function selectionChances(weights) {
  const clean = (Array.isArray(weights) ? weights : [])
    .map(w => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total <= 0) return clean.map(() => 0);
  return clean.map(w => w / total);
}

// Segments are shades of the club's own colour rather than an unrelated
// palette: one hue, varied in saturation and lightness, so the wheel reads as
// part of the club instead of a set of stickers.
//
// The offsets alternate hard rather than ramping, because a smooth gradient
// leaves neighbouring slices almost identical and the boundary disappears.
// Lightness is absolute, not an offset from the theme colour. Offsetting made
// the light end of the palette collapse: the yellow starts at 58% lightness, so
// four of its six shades hit the ceiling and differed only in saturation. A
// fixed ramp gives every theme the same spread, and hue plus saturation carry
// the identity perfectly well on their own.
//
// The ramp sits high, in pastel territory. That decides the label colour rather
// than the other way round: slice titles are drawn in dark ink, because white
// on a pastel is unreadable.
// Saturation is a multiplier, not an offset. Subtracting a fixed amount took
// the mid-saturation themes down into the teens, where a colour reads as dirty
// rather than as a shade, and the wheel came out muddy. Scaling keeps every
// shade in proportion to the theme: the multipliers skew above 1 so the set is
// richer than the source colour, and a deliberately grey theme stays grey
// instead of being dragged into brown.
const SHADES = [
  { sMul: 0.95, l: 80 },
  { sMul: 0.75, l: 90 },
  { sMul: 1.15, l: 73 },
  { sMul: 0.85, l: 93 },
  { sMul: 1.08, l: 85 },
  { sMul: 0.65, l: 69 },
];

const DEFAULT_WHEEL_HUE = '#6B7B3A';   // the app accent, for a club with no colour

export function segmentColour(index, count, baseHex) {
  const base = hexToHsl(baseHex) || hexToHsl(DEFAULT_WHEEL_HUE);
  let step = index % SHADES.length;
  // The seam. Whenever the segment count leaves the last slice back on shade
  // zero, it abuts the first slice and the two merge into one wide wedge, which
  // reads as a single entry with twice the odds.
  if (count > 1 && index === count - 1 && step === 0) step = 1;
  const { sMul, l } = SHADES[step];
  const sat = Math.min(92, Math.max(5, base.s * sMul));
  return `hsl(${base.h.toFixed(0)} ${sat.toFixed(0)}% ${l}%)`;
}

// A wheel needs at least two things on it to be deciding anything.
export function canSpin(recommendations) {
  return Array.isArray(recommendations) && recommendations.length >= 2;
}

// Stable order, so the wheel does not rearrange itself under people between
// renders. Sorted by uid rather than by when it was added: an edit would
// otherwise move someone's slice while others were looking at it.
export function wheelOrder(recommendations) {
  return (Array.isArray(recommendations) ? recommendations : [])
    .filter(r => r && r.uid)
    .slice()
    .sort((a, b) => String(a.uid).localeCompare(String(b.uid)));
}

// A sunburst, drawn rather than filtered.
//
// The club ring started as the profile's ink filter with a rougher turbulence,
// which was never going to give spikes: feTurbulence displaces an edge by noise,
// so it can only ever produce wobble. Actual points need actual geometry.
//
// The path is a star sitting behind the round avatar, so only the part beyond
// `inner` is ever seen: a thin band of colour with spikes coming off it.
// The ring's proportions, as multiples of the radius of the circle it surrounds.
//
// Taken from the club icon, where the shape was tuned by eye: a solid band off
// the edge of the circle, with teeth rising from the outer side of that band.
// The band is what makes it read as a ring - teeth whose valleys sit on the
// circle's own edge look stuck on rather than wrapped around.
export const RING_BAND = 43 / 38;   // where the valleys sit
export const RING_TIP  = 47 / 38;   // where the points reach

// The vertices, so a canvas can trace the same shape the SVG path draws. One
// definition of the star, two ways of painting it.
export function spikeRingPoints(cx, cy, inner, outer, points = 18) {
  if (!(points >= 3) || !(outer > 0)) return [];
  // Two vertices per point, alternating radius. Starting at -PI/2 puts a spike
  // straight up, which reads as deliberate where a flat edge reads as a mistake.
  const step = Math.PI / points;
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = i * step - Math.PI / 2;
    out.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  return out;
}

export function spikeRingPath(cx, cy, inner, outer, points = 18) {
  const pts = spikeRingPoints(cx, cy, inner, outer, points);
  if (!pts.length) return '';
  return pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2)).join('') + 'Z';
}

// How many teeth a ring of this radius wants. Fixed counts look right at one
// size only: the club icon's 14 on a 47px radius would be enormous teeth on a
// 150px wheel. Aiming for a constant tooth width keeps the two consistent.
//
// `width` is the tooth size being aimed at, so a caller that wants a coarser
// ring can ask for one without every other ring changing with it.
export function spikeCountFor(radius, width = 26) {
  const circumference = 2 * Math.PI * Math.max(1, radius);
  return Math.max(12, Math.min(48, Math.round(circumference / Math.max(1, width))));
}
