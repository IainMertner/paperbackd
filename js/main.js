// Normalize a Wikidata country label to a canonical country name
function normalizeCountry(raw) {
  if (!raw) return raw;

  const overrides = {
    // Historical states → modern successor
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
    'Democratic Republic of the Congo': 'Congo',
    'Republic of the Congo': 'Congo',
    'Zaire': 'Congo',
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

  if (overrides[raw]) return overrides[raw];

  // Strip common formal prefixes: "Kingdom of X" → "X", "Republic of X" → "X", etc.
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

  // Last resort: if the string contains a known country name as a whole word, use it.
  // Sorted longest-first so "United States" wins over bare "States".
  // Uses \b word boundaries so "Iran" won't match inside "Ukraine", etc.
  const knownCountries = [
    'Papua New Guinea', 'Trinidad and Tobago', 'Bosnia and Herzegovina',
    'Dominican Republic', 'United Arab Emirates', 'United States', 'United Kingdom',
    'Czech Republic', 'South Africa', 'South Korea', 'North Korea', 'Saudi Arabia',
    'New Zealand', 'Sierra Leone', 'Côte d\'Ivoire', 'Sri Lanka', 'Costa Rica',
    'El Salvador', 'Puerto Rico', 'Netherlands', 'Switzerland', 'Afghanistan',
    'Bangladesh', 'Kazakhstan', 'Madagascar', 'Mozambique', 'Azerbaijan',
    'Cameroon', 'Cambodia', 'Colombia', 'Ethiopia', 'Malaysia', 'Portugal',
    'Romania', 'Slovakia', 'Slovenia', 'Tanzania', 'Thailand', 'Ukraine',
    'Venezuela', 'Zimbabwe', 'Bulgaria', 'Argentina', 'Australia', 'Pakistan',
    'Palestine', 'Mongolia', 'Malaysia', 'Ethiopia', 'Honduras', 'Paraguay',
    'Armenia', 'Albania', 'Algeria', 'Belgium', 'Bolivia', 'Croatia',
    'Denmark', 'Ecuador', 'Estonia', 'Finland', 'Georgia', 'Germany',
    'Hungary', 'Iceland', 'Ireland', 'Jamaica', 'Lebanon', 'Moldova',
    'Morocco', 'Myanmar', 'Nigeria', 'Austria', 'Belarus', 'Tunisia',
    'Uruguay', 'Vietnam', 'Bahrain', 'Comoros', 'Djibouti', 'Eritrea',
    'Eswatini', 'Grenada', 'Guyana', 'Iceland', 'Lesotho', 'Liberia',
    'Namibia', 'Panama', 'Rwanda', 'Senegal', 'Somalia', 'Suriname',
    'Ukraine', 'Vanuatu', 'Zambia', 'Russia', 'France', 'Brazil',
    'Canada', 'Mexico', 'Sweden', 'Norway', 'Poland', 'Greece', 'Turkey',
    'Israel', 'Jordan', 'Egypt', 'Kenya', 'Ghana', 'Uganda', 'Angola',
    'Latvia', 'Libya', 'Malta', 'Niger', 'Qatar', 'Sudan', 'Syria',
    'China', 'India', 'Japan', 'Italy', 'Spain', 'Nepal', 'Haiti',
    'Benin', 'Gabon', 'Palau', 'Tonga', 'Cuba', 'Iraq', 'Iran',
    'Laos', 'Mali', 'Oman', 'Peru', 'Togo', 'Chad', 'Fiji',
  ].filter((v, i, a) => a.indexOf(v) === i);

  for (const country of knownCountries) {
    if (new RegExp('\\b' + country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(raw)) return country;
  }

  return raw;
}

// Apply stored theme before first paint (called inline in <head>)
function applyStoredTheme() {
  const t = localStorage.getItem('theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
}

// Toggle between dark and light, persisting to localStorage
function toggleTheme() {
  const effective = document.documentElement.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = effective === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  renderThemeIcon();
}

function renderThemeIcon() {
  const btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  btn.innerHTML = isDark ? sunIcon() : moonIcon();
  btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}

function sunIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <line x1="12" y1="2" x2="12" y2="4"/>
    <line x1="12" y1="20" x2="12" y2="22"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="2" y1="12" x2="4" y2="12"/>
    <line x1="20" y1="12" x2="22" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>`;
}

function moonIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
  </svg>`;
}

// Mark the active nav link based on current path
function setActiveNav() {
  const path = window.location.pathname;

  // Determine which page we're on
  let page = 'feed';
  if (/\/book\/?/.test(path))          page = 'search';
  else if (/\/author\/?/.test(path))   page = 'search';
  else if (/\/search\/?/.test(path))   page = 'search';
  else if (/\/library\/?/.test(path))  page = 'library';
  else if (/\/friends\/?/.test(path))  page = 'profile';
  else if (/\/profile\/?/.test(path))  page = 'profile';
  else if (/\/lists?\/?/.test(path))   page = 'profile';
  else if (/\/settings\/?/.test(path)) page = 'settings';
  else if (/\/feed\/?/.test(path))     page = 'feed';

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === page);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderThemeIcon();
  setActiveNav();
  document.querySelector('.theme-toggle')?.addEventListener('click', toggleTheme);
});

// Safety net: if the module script crashes or hangs, don't leave the page invisible
window.addEventListener('unhandledrejection', () => {
  document.body.classList.remove('auth-loading');
});
window.addEventListener('error', () => {
  document.body.classList.remove('auth-loading');
});
