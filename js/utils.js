// Pure utility functions shared across the app.
// No Firebase, no DOM, no side effects — all fully unit-testable.

export function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function toAuthorSlug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function renderStars(rating) {
  if (!rating) return '';
  let html = '<span class="stars-display">';
  for (let i = 1; i <= 5; i++) {
    if (rating >= i)          html += '<span class="star-char full">★</span>';
    else if (rating >= i-0.5) html += '<span class="star-char half">★</span>';
    else                      html += '<span class="star-char">★</span>';
  }
  return html + '</span>';
}

export function fmtTargetNum(n) {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
}

// Strips Goodreads-style series notation: "The Name of the Wind (Kingkiller, #1)" → "The Name of the Wind"
export function cleanTitle(t) {
  return (t || '').replace(/\s*\([^)]*#\s*\d+[^)]*\)/g, '').trim();
}

// Normalises "Last, First" → "First Last"; passes through "First Last" unchanged.
export function cleanAuthor(a) {
  return (a || '').replace(/^([^,]+),\s*(.+)$/, '$2 $1').trim();
}

// Labels a date relative to `now` when it falls inside the last seven days:
// 'Today', 'Yesterday', then the weekday name for 2–6 days ago.
// Returns null for anything older, leaving the caller to format it its own way.
//
// Stops at 6 days deliberately: 7 days ago is the same weekday as today, so
// labelling it would put a second 'Sunday' below 'Monday' in the same feed.
export function recentDayLabel(date, now = new Date()) {
  if (!(date instanceof Date) || isNaN(date)) return null;
  // Compare calendar days, not elapsed hours, so DST shifts can't move a date
  // across a boundary.
  const day      = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((todayDay - day) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays >= 2 && diffDays <= 6) return date.toLocaleDateString('en-GB', { weekday: 'long' });
  return null;
}

// Feed/activity day divider for a Firestore-style timestamp ({ seconds }).
//
// Today / Yesterday / weekday for the last seven days, then the day within the
// current month, then the month, then month + year. The recent-window labels
// take precedence over the month fallback, so a day that is only a few days old
// still reads as 'Friday' rather than collapsing into 'July' just because it
// sits the other side of the 1st.
export function dayLabel(ts, now = new Date()) {
  if (!ts?.seconds) return null;
  const d = new Date(ts.seconds * 1000);
  const recent = recentDayLabel(d, now);
  if (recent) return recent;
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
    return `${ordinal(d.getDate())} ${d.toLocaleDateString('en-GB', { month: 'long' })}`;
  }
  return d.getFullYear() === now.getFullYear()
    ? d.toLocaleDateString('en-GB', { month: 'long' })
    : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// Timestamp shown on an individual activity card.
//
// Relative only within the current day; an exact date after that. A relative
// '3d ago' never told you the actual date, and the day divider above the card
// says 'Thursday' rather than a date either — so the date appeared nowhere.
export function timeAgo(ts, now = new Date()) {
  if (!ts?.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate()  === now.getDate();
  if (sameDay) {
    const mins = Math.floor((now - d) / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor((now - d) / 3600000)}h ago`;
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Groups consecutive "followed" feed events from the same user into one aggregated event.
// getDayKey(timestamp) → string: optional, groups by day key to avoid cross-day merging.
export function aggregateFollows(events, myUid, getDayKey = () => '') {
  const out = [];
  const byKey = {};
  for (const e of events) {
    if (e.type !== 'followed') { out.push(e); continue; }
    const day = getDayKey(e.timestamp);
    const key = `${e.uid}_${day}`;
    if (byKey[key]) {
      byKey[key].targets.push({ username: e.targetUsername, isMe: e.targetUid === myUid });
    } else {
      const agg = { ...e, targets: [{ username: e.targetUsername, isMe: e.targetUid === myUid }] };
      byKey[key] = agg;
      out.push(agg);
    }
  }
  return out;
}

export function normalizeCountry(raw, remaps = null) {
  if (!raw) return raw;

  // Admin remaps come first, so a name the table below has never heard of
  // ("Castile") can be taught without a deploy, and so one of its rules can be
  // overridden when it turns out to be wrong.
  const custom = remaps && remaps[String(raw).trim().toLowerCase()];
  // Not a plain truthiness check: remaps['constructor'] finds the one on
  // Object.prototype and would hand back a function as the country name.
  // Requiring a non-empty string rules that out, and an empty target with it.
  if (typeof custom === 'string' && custom) return custom;

  const overrides = {
    'Soviet Union': 'Russia',
    'Union of Soviet Socialist Republics': 'Russia',
    'Russian Empire': 'Russia',
    'Russian Soviet Federative Socialist Republic': 'Russia',
    'Russian Socialist Federative Soviet Republic': 'Russia',
    'Nazi Germany': 'Germany',
    'German Democratic Republic': 'Germany',
    'West Germany': 'Germany',
    'German Empire': 'Germany',
    'Weimar Republic': 'Germany',
    'Third Reich': 'Germany',
    'Prussia': 'Germany',
    'Cisleithania': 'Austria',
    'Austria-Hungary': 'Austria',
    'Austro-Hungarian Empire': 'Austria',
    'Habsburg Monarchy': 'Austria',
    'Czechoslovakia': 'Czech Republic',
    'Ottoman Empire': 'Turkey',
    'British Empire': 'United Kingdom',
    'British Raj': 'India',
    'Kingdom of Great Britain': 'United Kingdom',
    'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
    'Great Britain': 'United Kingdom',
    'Britain': 'United Kingdom',
    'England': 'United Kingdom',
    'Scotland': 'United Kingdom',
    'Wales': 'United Kingdom',
    'Northern Ireland': 'United Kingdom',
    'Republic of China': 'Taiwan',
    'Socialist Federal Republic of Yugoslavia': 'Serbia',
    'Kingdom of Yugoslavia': 'Serbia',
    'Yugoslavia': 'Serbia',
    'South Vietnam': 'Vietnam',
    'North Vietnam': 'Vietnam',
    'Republic of Korea': 'South Korea',
    "Democratic People's Republic of Korea": 'North Korea',
    "People's Republic of China": 'China',
    'United States of America': 'United States',
    'Federative Republic of Brazil': 'Brazil',
    'United Mexican States': 'Mexico',
    'Commonwealth of Australia': 'Australia',
    "Lao People's Democratic Republic": 'Laos',
    'Brunei Darussalam': 'Brunei',
    'Hashemite Kingdom of Jordan': 'Jordan',
    'Syrian Arab Republic': 'Syria',
    'Hellenic Republic': 'Greece',
    'Swaziland': 'Eswatini',
    'Rhodesia': 'Zimbabwe',
    'Northern Rhodesia': 'Zambia',
    'Nyasaland': 'Malawi',
    'Democratic Republic of the Congo': 'DR Congo',
    'Republic of the Congo': 'Congo',
    'Zaire': 'DR Congo',
    'Cape Verde': 'Cabo Verde',
    "Ivory Coast": "Côte d'Ivoire",
    'Holland': 'Netherlands',
    'Macedonia': 'North Macedonia',
    'East Timor': 'Timor-Leste',
    'Czechia': 'Czech Republic',
    'Independent State of Papua New Guinea': 'Papua New Guinea',
    'Independent State of Samoa': 'Samoa',
    'Federated States of Micronesia': 'Micronesia',
    'Socialist Republic of Vietnam': 'Vietnam',
    'Republic of the Union of Myanmar': 'Myanmar',
    'Burma': 'Myanmar',
    'Ceylon': 'Sri Lanka',
    'Democratic Socialist Republic of Sri Lanka': 'Sri Lanka',
    'Islamic Republic of Pakistan': 'Pakistan',
    'Islamic Republic of Iran': 'Iran',
    'Persia': 'Iran',
    'State of Palestine': 'Palestine',
    'Sultanate of Oman': 'Oman',
    'State of Kuwait': 'Kuwait',
    'State of Qatar': 'Qatar',
  };

  // Same string test as above, and for the same reason: raw could be
  // 'constructor', which every object literal inherits.
  if (typeof overrides[raw] === 'string') return overrides[raw];

  const prefixes = [
    'Kingdom of the ', 'Kingdom of ',
    'Federal Republic of ', 'Islamic Republic of ', 'Democratic Republic of ',
    "People's Republic of ", 'Democratic Socialist Republic of ',
    'Bolivarian Republic of ', 'Oriental Republic of ', 'Plurinational State of ',
    'Arab Republic of ', 'Federative Republic of ',
    'Republic of the ', 'United Republic of ', 'Republic of ',
    'Commonwealth of ', 'Principality of ', 'Grand Duchy of ',
    'Sultanate of ', 'State of ', 'Federation of ',
    'Independent State of ', 'Federated States of ', 'Socialist Republic of ',
    'Hashemite Kingdom of ',
  ];
  for (const prefix of prefixes) {
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
  }

  const knownCountries = [
    'Saint Vincent and the Grenadines', 'Central African Republic',
    'Bosnia and Herzegovina', 'São Tomé and Príncipe', 'Trinidad and Tobago',
    'United Arab Emirates', 'Saint Kitts and Nevis', 'Dominican Republic',
    'Equatorial Guinea', 'Papua New Guinea', 'Antigua and Barbuda',
    'Marshall Islands', 'Solomon Islands', 'North Macedonia', 'Sierra Leone',
    'Saudi Arabia', 'Cabo Verde', 'Guinea-Bissau', 'Burkina Faso',
    'South Africa', 'South Korea', 'South Sudan', 'North Korea',
    "Côte d'Ivoire", 'Timor-Leste', 'El Salvador', 'Saint Lucia',
    'Costa Rica', 'New Zealand', 'Sri Lanka', 'DR Congo',
    'United Kingdom', 'United States', 'Czech Republic', 'Vatican City',
    'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola',
    'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
    'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus',
    'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia',
    'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burundi',
    'Cambodia', 'Cameroon', 'Canada', 'Chad', 'Chile',
    'China', 'Colombia', 'Comoros', 'Congo', 'Croatia',
    'Cuba', 'Cyprus', 'Denmark', 'Djibouti', 'Dominica',
    'Ecuador', 'Egypt', 'Eritrea', 'Estonia', 'Eswatini',
    'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon',
    'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece',
    'Grenada', 'Guatemala', 'Guinea', 'Guyana', 'Haiti',
    'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia',
    'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
    'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya',
    'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos',
    'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya',
    'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi',
    'Malaysia', 'Maldives', 'Mali', 'Malta', 'Mauritania',
    'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco',
    'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
    'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'Nicaragua',
    'Niger', 'Nigeria', 'Norway', 'Oman', 'Pakistan',
    'Palau', 'Palestine', 'Panama', 'Paraguay', 'Peru',
    'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania',
    'Russia', 'Rwanda', 'Samoa', 'San Marino', 'Senegal',
    'Serbia', 'Seychelles', 'Singapore', 'Slovakia', 'Slovenia',
    'Somalia', 'Spain', 'Sudan', 'Suriname', 'Sweden',
    'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania',
    'Thailand', 'Togo', 'Tonga', 'Tunisia', 'Turkey',
    'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'Uruguay',
    'Uzbekistan', 'Vanuatu', 'Venezuela', 'Vietnam', 'Yemen',
    'Zambia', 'Zimbabwe',
  ];

  for (const country of knownCountries) {
    if (new RegExp('\\b' + country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(raw)) return country;
  }

  return raw;
}

// How many overlapping spines fit a container of a given width.
//
// The first spine costs its full width; every one after it costs only
// width - overlap, because they are pulled back over each other. Used by the
// lists page, which shows as many book spines as the card can actually hold at
// the current viewport rather than a fixed number.
export function spineCapacity(containerWidth, spineWidth, overlap) {
  const step = spineWidth - overlap;
  if (!(containerWidth > 0) || !(step > 0)) return 1;
  // Never returns zero: a card too narrow for even one spine still looks more
  // sensible showing a clipped spine than showing an empty strip.
  return Math.max(1, Math.floor((containerWidth - spineWidth) / step) + 1);
}

// ── List ordering ───────────────────────────────────────────────────────────

// Orders a user's lists for display.
//
// The reading list is pinned first and outranks everything, including an
// explicit sortIndex — a stale or hand-edited index cannot dislodge it, so the
// UI never has to be the only thing enforcing that.
//
// Below it, an explicit sortIndex wins: once someone has arranged their lists by
// hand, that arrangement is the answer. Lists with no sortIndex sort after those
// that have one, keeping the original DNF-next rule, so a set nobody has
// reordered looks exactly as it always did.
export function compareLists(a, b) {
  if (!!a?.isDefault !== !!b?.isDefault) return a?.isDefault ? -1 : 1;
  const ai = Number.isFinite(a?.sortIndex) ? a.sortIndex : null;
  const bi = Number.isFinite(b?.sortIndex) ? b.sortIndex : null;
  if (ai !== null && bi !== null) return ai - bi;
  if (ai !== null) return -1;
  if (bi !== null) return 1;
  if (!!a?.isDnf !== !!b?.isDnf) return a?.isDnf ? -1 : 1;
  return 0;
}

// Moves the item at `from` by `delta` places, returning a new array. Out-of-range
// moves return an unchanged copy rather than throwing or dropping the item, so a
// button pressed at either end is a no-op.
export function moveInArray(items, from, delta) {
  const next = (items || []).slice();
  const to = from + delta;
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Wraps an async function so its calls never overlap — each waits for the
// previous one to settle before starting.
//
// For saves, where two writes in flight at once mean whichever lands last wins
// regardless of which one started from fresher data.
//
// A rejection reaches the caller that caused it and nobody else. The internal
// chain deliberately continues from a promise that always settles: a queue left
// rejected would route the *next* call into its own error handler and skip that
// call's work entirely, so one failed save would silently discard the one after
// it while still reporting success. onError covers a caller that never awaits.
export function serialiseCalls(fn, onError) {
  let queue = Promise.resolve();
  return (...args) => {
    const run = queue.then(() => fn(...args), () => fn(...args));
    queue = run.catch(err => { if (onError) onError(err); });
    return run;
  };
}
