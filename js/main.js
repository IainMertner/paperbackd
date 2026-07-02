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
  let page = 'home';
  if (/\/book\/?/.test(path))     page = 'search';
  else if (/\/search\/?/.test(path)) page = 'search';
  else if (/\/library\/?/.test(path)) page = 'library';
  else if (/\/friends\/?/.test(path)) page = 'profile';
  else if (/\/profile\/?/.test(path)) page = 'profile';
  else if (/\/settings\/?/.test(path)) page = 'settings';

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
