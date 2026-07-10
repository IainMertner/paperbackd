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
    // Multi-word and compound names first (longest matches win)
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
    // Single-word countries
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


function setActiveNav() {
  const path = window.location.pathname;
  const hasU = new URLSearchParams(window.location.search).has('u');

  let page = null;
  if (/\/feed\/?$/.test(path))                  page = 'feed';
  else if (/\/search\/?$/.test(path))           page = 'search';
  else if (/\/stats\/?$/.test(path)   && !hasU) page = 'stats';
  else if (/\/settings\/?$/.test(path))         page = 'profile';
  else if (/\/library\/?$/.test(path) && !hasU) page = 'library';
  else if (/\/profile\/?$/.test(path) && !hasU) page = 'profile';

  if (page) {
    localStorage.setItem('nav-active', page);
  } else {
    page = localStorage.getItem('nav-active') || 'feed';
  }

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === page);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setActiveNav();
});

// Safety net: if the module script crashes or hangs, don't leave the page invisible
window.addEventListener('unhandledrejection', () => {
  document.body.classList.remove('auth-loading');
});
window.addEventListener('error', () => {
  document.body.classList.remove('auth-loading');
});
