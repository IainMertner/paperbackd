function setActiveNav() {
  const path = window.location.pathname;
  const hasU = new URLSearchParams(window.location.search).has('u');

  let page = null;
  if (/\/home\/?$/.test(path))                     page = 'home';
  else if (path === '/' || /\/feed\/?$/.test(path)) page = 'feed';
  else if (/\/search\/?$/.test(path))             page = 'search';
  else if (/\/stats\/?$/.test(path)   && !hasU)   page = 'stats';
  else if (/\/settings\/?$/.test(path))           page = 'settings';
  else if (/\/library\/?$/.test(path) && !hasU)   page = 'library';
  else if (/\/profile\/?$/.test(path) && !hasU)   page = 'profile';
  else if (/\/network\/?$/.test(path) && !hasU)   page = 'network';
  else if (/\/lists?\/?$/.test(path)  && !hasU)   page = 'lists';

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

window.addEventListener('pageshow', e => {
  if (e.persisted) setActiveNav();
});

// Safety net: if the module script crashes or hangs, don't leave the page invisible
window.addEventListener('unhandledrejection', () => {
  document.body.classList.remove('auth-loading');
});
window.addEventListener('error', () => {
  document.body.classList.remove('auth-loading');
});
