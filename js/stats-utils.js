// Pure stats computation — no Firebase, no DOM.

export const ISO_CONTINENT = {
  ng:'AF', za:'AF', eg:'AF', ke:'AF', gh:'AF', et:'AF', ma:'AF', tz:'AF', ug:'AF', zw:'AF', rw:'AF', ao:'AF',
  jp:'AS', cn:'AS', kr:'AS', tw:'AS', in:'AS', pk:'AS', bd:'AS', lk:'AS', vn:'AS', th:'AS', id:'AS', ph:'AS',
  my:'AS', sg:'AS', mm:'AS', kh:'AS', ir:'AS', tr:'AS', il:'AS', jo:'AS', iq:'AS', sa:'AS', ae:'AS', hk:'AS',
  gb:'EU', fr:'EU', de:'EU', it:'EU', es:'EU', pt:'EU', nl:'EU', be:'EU', ch:'EU', at:'EU', se:'EU', no:'EU',
  dk:'EU', fi:'EU', pl:'EU', ua:'EU', gr:'EU', cz:'EU', hu:'EU', ro:'EU', rs:'EU', hr:'EU', sk:'EU', bg:'EU',
  ru:'EU', ie:'EU', is:'EU', lu:'EU', ee:'EU', lv:'EU', lt:'EU',
  us:'NA', ca:'NA', mx:'NA', cu:'NA', gt:'NA', cr:'NA', tt:'NA', jm:'NA', ht:'NA', do:'NA',
  au:'OC', nz:'OC',
  br:'SA', ar:'SA', co:'SA', cl:'SA', pe:'SA', ve:'SA', ec:'SA', bo:'SA', uy:'SA', py:'SA',

  dz:'AF', bj:'AF', bw:'AF', bf:'AF', bi:'AF', cv:'AF', cm:'AF', cf:'AF', td:'AF',
  km:'AF', cg:'AF', cd:'AF', ci:'AF', dj:'AF', gq:'AF', er:'AF', sz:'AF', ga:'AF',
  gm:'AF', gn:'AF', gw:'AF', ls:'AF', lr:'AF', ly:'AF', mg:'AF', mw:'AF', ml:'AF',
  mr:'AF', mu:'AF', mz:'AF', na:'AF', ne:'AF', st:'AF', sn:'AF', sc:'AF', sl:'AF',
  so:'AF', ss:'AF', sd:'AF', tg:'AF', tn:'AF', zm:'AF',

  af:'AS', am:'AS', az:'AS', bh:'AS', bt:'AS', bn:'AS', ge:'AS', kz:'AS', kw:'AS',
  kg:'AS', la:'AS', lb:'AS', mv:'AS', mn:'AS', np:'AS', kp:'AS', om:'AS', ps:'AS',
  qa:'AS', sy:'AS', tj:'AS', tl:'AS', tm:'AS', uz:'AS', ye:'AS',

  al:'EU', ad:'EU', by:'EU', ba:'EU', cy:'EU', xk:'EU', li:'EU', mt:'EU', md:'EU',
  mc:'EU', me:'EU', mk:'EU', sm:'EU', si:'EU', va:'EU',

  ag:'NA', bs:'NA', bb:'NA', bz:'NA', dm:'NA', sv:'NA', gd:'NA', hn:'NA', ni:'NA',
  pa:'NA', kn:'NA', lc:'NA', vc:'NA',

  fj:'OC', ki:'OC', mh:'OC', fm:'OC', nr:'OC', pw:'OC', pg:'OC', ws:'OC', sb:'OC',
  to:'OC', tv:'OC', vu:'OC',

  gy:'SA', sr:'SA',
};

export const COUNTRY_ISO = {
  'united states': 'us', 'usa': 'us', 'us': 'us',
  'united kingdom': 'gb', 'uk': 'gb', 'england': 'gb', 'great britain': 'gb', 'britain': 'gb', 'scotland': 'gb', 'wales': 'gb', 'northern ireland': 'gb',
  'france': 'fr', 'germany': 'de', 'italy': 'it', 'spain': 'es', 'portugal': 'pt',
  'netherlands': 'nl', 'belgium': 'be', 'switzerland': 'ch', 'austria': 'at',
  'sweden': 'se', 'norway': 'no', 'denmark': 'dk', 'finland': 'fi',
  'poland': 'pl', 'ukraine': 'ua', 'greece': 'gr',
  'czech republic': 'cz', 'czechia': 'cz', 'hungary': 'hu', 'romania': 'ro',
  'serbia': 'rs', 'croatia': 'hr', 'slovakia': 'sk', 'bulgaria': 'bg',
  'russia': 'ru', 'ireland': 'ie', 'iceland': 'is', 'luxembourg': 'lu',
  'estonia': 'ee', 'latvia': 'lv', 'lithuania': 'lt',
  'japan': 'jp', 'china': 'cn', 'south korea': 'kr', 'korea': 'kr', 'taiwan': 'tw',
  'india': 'in', 'pakistan': 'pk', 'bangladesh': 'bd', 'sri lanka': 'lk',
  'vietnam': 'vn', 'thailand': 'th', 'indonesia': 'id', 'philippines': 'ph',
  'malaysia': 'my', 'singapore': 'sg', 'myanmar': 'mm', 'cambodia': 'kh',
  'iran': 'ir', 'turkey': 'tr', 'israel': 'il', 'jordan': 'jo', 'iraq': 'iq',
  'saudi arabia': 'sa', 'united arab emirates': 'ae', 'uae': 'ae',
  'canada': 'ca', 'mexico': 'mx', 'cuba': 'cu', 'guatemala': 'gt', 'costa rica': 'cr',
  'trinidad and tobago': 'tt', 'trinidad': 'tt', 'tobago': 'tt', 'jamaica': 'jm', 'haiti': 'ht', 'dominican republic': 'do',
  'brazil': 'br', 'argentina': 'ar', 'colombia': 'co', 'chile': 'cl',
  'peru': 'pe', 'venezuela': 've', 'ecuador': 'ec', 'bolivia': 'bo', 'uruguay': 'uy', 'paraguay': 'py',
  'australia': 'au', 'new zealand': 'nz',
  'nigeria': 'ng', 'south africa': 'za', 'egypt': 'eg', 'kenya': 'ke',
  'ghana': 'gh', 'ethiopia': 'et', 'morocco': 'ma', 'tanzania': 'tz',
  'uganda': 'ug', 'zimbabwe': 'zw', 'rwanda': 'rw', 'angola': 'ao',
  'hong kong': 'hk',

  'albania': 'al', 'andorra': 'ad', 'belarus': 'by', 'bosnia and herzegovina': 'ba',
  'cyprus': 'cy', 'kosovo': 'xk', 'liechtenstein': 'li', 'malta': 'mt',
  'moldova': 'md', 'monaco': 'mc', 'montenegro': 'me', 'north macedonia': 'mk',
  'san marino': 'sm', 'slovenia': 'si', 'vatican city': 'va',

  'afghanistan': 'af', 'armenia': 'am', 'azerbaijan': 'az', 'bahrain': 'bh',
  'bhutan': 'bt', 'brunei': 'bn', 'georgia': 'ge', 'kazakhstan': 'kz',
  'kuwait': 'kw', 'kyrgyzstan': 'kg', 'laos': 'la', 'lebanon': 'lb',
  'maldives': 'mv', 'mongolia': 'mn', 'nepal': 'np', 'north korea': 'kp',
  'oman': 'om', 'palestine': 'ps', 'qatar': 'qa', 'syria': 'sy',
  'tajikistan': 'tj', 'timor-leste': 'tl', 'turkmenistan': 'tm',
  'uzbekistan': 'uz', 'yemen': 'ye',

  'algeria': 'dz', 'benin': 'bj', 'botswana': 'bw', 'burkina faso': 'bf',
  'burundi': 'bi', 'cabo verde': 'cv', 'cameroon': 'cm',
  'central african republic': 'cf', 'chad': 'td', 'comoros': 'km',
  'congo': 'cg', 'dr congo': 'cd', "côte d'ivoire": 'ci', 'djibouti': 'dj',
  'equatorial guinea': 'gq', 'eritrea': 'er', 'eswatini': 'sz', 'gabon': 'ga',
  'gambia': 'gm', 'guinea': 'gn', 'guinea-bissau': 'gw', 'lesotho': 'ls',
  'liberia': 'lr', 'libya': 'ly', 'madagascar': 'mg', 'malawi': 'mw',
  'mali': 'ml', 'mauritania': 'mr', 'mauritius': 'mu', 'mozambique': 'mz',
  'namibia': 'na', 'niger': 'ne', 'são tomé and príncipe': 'st',
  'senegal': 'sn', 'seychelles': 'sc', 'sierra leone': 'sl', 'somalia': 'so',
  'south sudan': 'ss', 'sudan': 'sd', 'togo': 'tg', 'tunisia': 'tn',
  'zambia': 'zm',

  'antigua and barbuda': 'ag', 'bahamas': 'bs', 'barbados': 'bb',
  'belize': 'bz', 'dominica': 'dm', 'el salvador': 'sv', 'grenada': 'gd',
  'honduras': 'hn', 'nicaragua': 'ni', 'panama': 'pa',
  'saint kitts and nevis': 'kn', 'saint lucia': 'lc',
  'saint vincent and the grenadines': 'vc',

  'guyana': 'gy', 'suriname': 'sr',

  'fiji': 'fj', 'kiribati': 'ki', 'marshall islands': 'mh', 'micronesia': 'fm',
  'nauru': 'nr', 'palau': 'pw', 'papua new guinea': 'pg', 'samoa': 'ws',
  'solomon islands': 'sb', 'tonga': 'to', 'tuvalu': 'tv', 'vanuatu': 'vu',
};

// Lanczos lgamma, regularised incomplete beta, and two-tailed t p-value
export function lgamma(z) {
  const c = [0.99999999999980993,676.5203681218851,-1259.1392167224028,
             771.32342877765313,-176.61502916214059,12.507343278686905,
             -0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z--; let x = c[0];
  for (let i = 1; i <= 8; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function betacf(a, b, x) {
  const MAXIT = 100, EPS = 3e-7, FP = 1e-30;
  const qab = a+b, qap = a+1, qam = a-1;
  let c = 1, d = 1 - qab*x/qap;
  if (Math.abs(d) < FP) d = FP; d = 1/d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2*m;
    let aa = m*(b-m)*x/((qam+m2)*(a+m2));
    d = 1+aa*d; if (Math.abs(d)<FP) d=FP; c = 1+aa/c; if (Math.abs(c)<FP) c=FP; d=1/d; h*=d*c;
    aa = -(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
    d = 1+aa*d; if (Math.abs(d)<FP) d=FP; c = 1+aa/c; if (Math.abs(c)<FP) c=FP; d=1/d;
    const del = d*c; h *= del; if (Math.abs(del-1) < EPS) break;
  }
  return h;
}

export function betai(a, b, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a+b)-lgamma(a)-lgamma(b)+a*Math.log(x)+b*Math.log(1-x));
  return x < (a+1)/(a+b+2) ? bt*betacf(a,b,x)/a : 1-bt*betacf(b,a,1-x)/b;
}

export function tPValue(t, df) { return betai(df/2, 0.5, df/(df + t*t)); }

export function linearRegression(pts) {
  const n = pts.length;
  if (n < 3) return null;
  const sx  = pts.reduce((s, p) => s + p.x, 0);
  const sy  = pts.reduce((s, p) => s + p.y, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sx2 = pts.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sx2 - sx * sx;
  if (!denom) return null;
  const m    = (n * sxy - sx * sy) / denom;
  const b    = (sy - m * sx) / n;
  const SSxx = sx2 - sx * sx / n;
  const SSres = pts.reduce((s, p) => { const e = p.y-(m*p.x+b); return s+e*e; }, 0);
  if (SSres === 0) return { m, b, pValue: m === 0 ? 1 : 0 };
  const SE   = Math.sqrt(SSres / ((n - 2) * SSxx));
  return { m, b, pValue: tPValue(Math.abs(m / SE), n - 2) };
}

export function niceTicks(min, max, count) {
  const range = max - min || 1;
  const step  = Math.pow(10, Math.floor(Math.log10(range / count)));
  const nice  = [1, 2, 5, 10].map(f => f * step).find(s => range / s <= count * 1.5) || step;
  const start = Math.ceil(min / nice) * nice;
  const ticks = [];
  for (let t = start; t <= max + nice * 0.01; t += nice) ticks.push(Math.round(t * 1000) / 1000);
  return ticks;
}

export function niceLogTicks(min, max) {
  const ticks = [];
  const lo = Math.pow(10, Math.floor(Math.log10(Math.max(min, 1))));
  for (let base = lo; base <= max; base *= 10) {
    for (const f of [1, 2, 5]) {
      const v = base * f;
      if (v >= min && v <= max) ticks.push(v);
    }
  }
  return ticks;
}

// Computes summary stats from an array of finished book objects.
// Pass `now` explicitly to make tests deterministic (defaults to current time).
export function calcStats(bks, now = new Date()) {
  const total = bks.length;
  const rated = bks.filter(b => b.rating != null && b.rating >= 0.5);
  const avgRating = rated.length ? rated.reduce((s, b) => s + b.rating, 0) / rated.length : null;
  const stdDev = avgRating != null && rated.length >= 2
    ? Math.sqrt(rated.reduce((s, b) => s + Math.pow(b.rating - avgRating, 2), 0) / rated.length) : null;
  const withPages = bks.filter(b => b.totalPages > 0);
  const totalPages = withPages.reduce((s, b) => s + b.totalPages, 0);
  const avgPages = withPages.length ? Math.round(totalPages / withPages.length) : null;
  const uniqueAuthors   = new Set(bks.map(b => b.author).filter(Boolean)).size;
  const uniqueCountries = new Set(bks.map(b => b.country).filter(Boolean)).size;
  const uniqueLanguages = new Set(bks.map(b => b.language).filter(Boolean)).size;
  const thisYear  = bks.filter(b => { const d = b.finishedAt?.toDate?.() ?? null; return d && d.getFullYear() === now.getFullYear(); }).length;
  const thisMonth = bks.filter(b => { const d = b.finishedAt?.toDate?.() ?? null; return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
  const continentCounts = { AF: 0, AS: 0, EU: 0, NA: 0, OC: 0, SA: 0 };
  for (const b of bks) {
    if (!b.country) continue;
    const iso = COUNTRY_ISO[b.country.toLowerCase()];
    const cont = iso && ISO_CONTINENT[iso];
    if (cont) continentCounts[cont]++;
  }
  // Counted per book rather than per unique author: five books by one author
  // count five times, so the breakdown reflects what was actually read.
  const GENDERS = ['Male', 'Female', 'Non-binary', 'Other'];
  const genderCounts = { Male: 0, Female: 0, 'Non-binary': 0, Other: 0 };
  for (const b of bks) {
    // An explicit list rather than `in`, which walks the prototype chain: a
    // gender of 'constructor' would pass that guard and then increment a
    // function, leaving a junk key on the counts.
    if (GENDERS.includes(b.authorGender)) genderCounts[b.authorGender]++;
  }
  const genderKnown = genderCounts.Male + genderCounts.Female + genderCounts['Non-binary'] + genderCounts.Other;
  const genderRatio = genderKnown > 0
    ? [Math.round(genderCounts.Male / genderKnown * 100), Math.round(genderCounts.Female / genderKnown * 100), Math.round(genderCounts['Non-binary'] / genderKnown * 100)].join('/')
    : '–';
  // The three the library offers. Books added before the field existed, or
  // never set, are counted in neither — formatKnown is what the caller checks
  // before showing the breakdown at all.
  const FORMATS = ['Physical', 'Digital', 'Audiobook'];
  const formatCounts = { Physical: 0, Digital: 0, Audiobook: 0 };
  for (const b of bks) {
    // An explicit list, not : that walks the prototype chain, so a format of
    // 'constructor' would pass the guard and then increment a function.
    if (FORMATS.includes(b.format)) formatCounts[b.format]++;
  }
  const formatKnown = formatCounts.Physical + formatCounts.Digital + formatCounts.Audiobook;

  const fiveStars = rated.filter(b => b.rating === 5).length;
  const halfStars = rated.filter(b => b.rating === 0.5).length;
  return { formatCounts, formatKnown, total, avgRating, stdDev, totalPages, avgPages, uniqueAuthors, uniqueCountries, uniqueLanguages, thisYear, thisMonth, continentCounts, genderCounts, genderKnown, genderRatio, fiveStars, halfStars };
}

// ── Target history ──────────────────────────────────────────────────────────
//
// At the end of each month and year, what you were aiming for and how you did
// is written down. Snapshots are taken lazily — the first time the owner opens
// the page after a period ends — because there is no scheduled job to take them
// on the stroke of midnight.
//
// The consequence, and the reason this is worth stating: the target recorded is
// whatever it was when the snapshot was taken, not when the period ended. Visit
// promptly and they are the same thing; leave it three months and a target you
// have since changed is what gets written down.

// "2026-07" for a month, "2026" for a year. Sorts correctly as a string, which
// is what lets the history be ordered without parsing it back.
export function periodKey(date, period) {
  const y = date.getFullYear();
  if (period === 'yearly') return String(y);
  return `${y}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Whether a date falls inside the period a key names.
export function inPeriod(date, key) {
  if (!date || !key) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  if (!key.includes('-')) return String(d.getFullYear()) === key;
  return periodKey(d, 'monthly') === key;
}

// Keys for every period of this kind that has fully ended and is not already
// recorded, oldest first, back as far as fromKey.
//
// Walks backwards from the present rather than forwards from fromKey, so that
// when the limit bites it keeps the most recent periods. Forwards, a long gap
// would fill the quota with ancient months and never reach the ones anybody
// cares about — and since each key is only offered once, those months would be
// skipped for good.
export function periodsToSnapshot(period, fromKey, now, have = [], limit = 240) {
  const seen = new Set(have);
  const out = [];
  // Starts at the current period, which is unfinished; the first step back
  // lands on the most recent finished one.
  const cursor = new Date(now.getFullYear(), period === 'yearly' ? 0 : now.getMonth(), 1);

  for (let i = 0; i < limit; i++) {
    if (period === 'yearly') cursor.setFullYear(cursor.getFullYear() - 1);
    else cursor.setMonth(cursor.getMonth() - 1);
    const key = periodKey(cursor, period);
    if (key <= fromKey) break;
    if (!seen.has(key)) out.push(key);
  }
  return out.reverse();
}

// How a finished period went: one entry per target, with whether it was met.
export function summariseSnapshot(entry) {
  const targets = entry?.targets || {};
  const results = entry?.results || {};
  const rows = Object.keys(targets).map(type => ({
    type,
    target: targets[type],
    result: results[type] ?? 0,
    met: (results[type] ?? 0) >= targets[type],
  }));
  return { rows, met: rows.filter(r => r.met).length, total: rows.length };
}

// How old a book is now, in years, or null if its year is unusable.
//
// BCE years are negative, and there is no year zero between -1 and 1 — so a
// plain subtraction runs a year long across the boundary: 800 BCE to 2026 CE is
// 2825 years, not 2826.
//
// Anything dated now or later comes back as 1 rather than 0 or a negative: the
// scatter plots this on a log scale, where neither has a position.
export function bookAgeYears(releaseYear, thisYear) {
  if (releaseYear == null || releaseYear === 0) return null;
  return Math.max(1, thisYear - releaseYear - (releaseYear < 0 ? 1 : 0));
}
