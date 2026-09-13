// A club's icon: a round image or its initial, inside the torn ring that marks
// a club apart from a person.
//
// Built here rather than written out on each page because it appears in three
// places - the clubs list, the strip on home, and eventually anywhere else a
// club is named - and three copies of the geometry would drift apart the first
// time the spikes were tuned.
//
// The ring is drawn as a star path rather than filtered, for the reason the club
// page found out the hard way: feTurbulence displaces an edge by noise, so it
// can only ever produce a wobble, never a point.

import { esc, themeColour } from './utils.js';
import { spikeRingPath, RING_BAND, RING_TIP } from './club-utils.js';

// The proportions the club page header settled on, in a 120-unit box around a
// 76-unit circle. Kept in viewBox units and scaled by CSS, so every size gets
// the same shape rather than a separately tuned one.
const CIRCLE = 38;                     // the face, in viewBox units
const INNER = CIRCLE * RING_BAND;      // where the valleys sit
const OUTER = CIRCLE * RING_TIP;       // where the points reach
const BOX = OUTER * 2 + 2;             // a unit of margin, so tips are not clipped
const TEETH = 14;

// How much bigger the ring's box is than the face it surrounds. The element is
// sized from this rather than from a percentage written into the stylesheet,
// because the two would silently disagree the moment the proportions changed.
const SCALE = BOX / (CIRCLE * 2);

export function clubIconEl(club, size = 48) {
  const wrap = document.createElement('span');
  wrap.className = 'club-icon-wrap';
  wrap.style.cssText = `width:${size}px;height:${size}px`;

  // No club colour yet means the app accent, the same fallback the club page's
  // own ring uses.
  const colour = themeColour(club?.ringColor);

  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('class', 'club-icon-ring');
  ring.setAttribute('viewBox', `0 0 ${BOX} ${BOX}`);
  const span = (SCALE * 100).toFixed(2);
  const overhang = (((SCALE - 1) / 2) * 100).toFixed(2);
  ring.style.cssText = `inset:-${overhang}%;width:${span}%;height:${span}%`;
  ring.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', spikeRingPath(BOX / 2, BOX / 2, INNER, OUTER, TEETH));
  path.style.fill = colour || 'var(--accent)';
  ring.appendChild(path);

  const face = document.createElement('span');
  face.className = 'club-icon';
  face.style.fontSize = Math.max(11, Math.round(size * 0.4)) + 'px';
  if (club?.iconUrl) face.innerHTML = `<img src="${esc(club.iconUrl)}" alt="">`;
  else {
    face.textContent = (String(club?.name || '?')[0] || '?').toUpperCase();
    if (colour) face.style.color = colour;
  }

  wrap.append(ring, face);
  return wrap;
}

export { SCALE as CLUB_ICON_SCALE };
