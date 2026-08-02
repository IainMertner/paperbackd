// Tests for setActiveNav in js/main.js.
//
// main.js is a classic (non-module) script with no exports, so it is compiled
// here with window/document/localStorage passed in as parameters. Bare global
// references inside the script resolve to those stubs, which lets the nav logic
// be exercised without a DOM implementation.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const mainSrc = readFileSync(fileURLToPath(new URL('../js/main.js', import.meta.url)), 'utf8');

const NAV_IDS = ['home', 'feed', 'search', 'stats', 'settings', 'library', 'profile', 'network', 'lists'];

function loadNav({ pathname = '/', search = '', stored = null, navIds = NAV_IDS } = {}) {
  const store = new Map();
  if (stored !== null) store.set('nav-active', stored);

  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };

  const els = navIds.map(id => ({
    dataset: { nav: id },
    classes: new Set(),
    classList: {
      toggle(cls, on) { on ? this._set.add(cls) : this._set.delete(cls); },
    },
  }));
  // Wire each classList to its element's own class set.
  for (const el of els) el.classList._set = el.classes;

  const bodyClasses = new Set(['auth-loading']);
  const listeners = { window: {}, document: {} };

  const window = {
    location: { pathname, search },
    addEventListener: (type, fn) => { listeners.window[type] = fn; },
  };
  const document = {
    addEventListener: (type, fn) => { listeners.document[type] = fn; },
    querySelectorAll: sel => (sel === '[data-nav]' ? els : []),
    body: { classList: { remove: c => bodyClasses.delete(c) } },
  };

  // eslint-disable-next-line no-new-func
  const factory = new Function('window', 'document', 'localStorage', `${mainSrc}\nreturn setActiveNav;`);
  const setActiveNav = factory(window, document, localStorage);

  const activeIds = () => els.filter(e => e.classes.has('active')).map(e => e.dataset.nav);
  return { setActiveNav, els, store, listeners, activeIds, bodyClasses };
}

// Runs setActiveNav and returns which nav items ended up active.
function activeFor(opts) {
  const nav = loadNav(opts);
  nav.setActiveNav();
  return nav.activeIds();
}

// ── Path → nav mapping ────────────────────────────────────────────────────────

describe('setActiveNav — direct path matches', () => {
  const CASES = [
    ['/home/', 'home'], ['/home', 'home'],
    ['/feed/', 'feed'], ['/feed', 'feed'],
    ['/search/', 'search'], ['/search', 'search'],
    ['/stats/', 'stats'], ['/stats', 'stats'],
    ['/settings/', 'settings'], ['/settings', 'settings'],
    ['/library/', 'library'], ['/library', 'library'],
    ['/profile/', 'profile'], ['/profile', 'profile'],
    ['/network/', 'network'], ['/network', 'network'],
    ['/lists/', 'lists'], ['/lists', 'lists'],
  ];

  it.each(CASES)('%s activates %s', (pathname, expected) => {
    expect(activeFor({ pathname })).toEqual([expected]);
  });

  it.each(CASES)('%s activates exactly one item', pathname => {
    expect(activeFor({ pathname })).toHaveLength(1);
  });

  it('treats the site root as the feed', () => {
    expect(activeFor({ pathname: '/' })).toEqual(['feed']);
  });

  it('treats the singular /list/ detail page as the lists section', () => {
    expect(activeFor({ pathname: '/list/' })).toEqual(['lists']);
  });

  it('activates nothing recognisable for an unknown path and falls back', () => {
    expect(activeFor({ pathname: '/nowhere/', stored: 'library' })).toEqual(['library']);
  });
});

// ── Friend pages (?u=) must not claim your own nav item ───────────────────────

describe('setActiveNav — friend pages with ?u=', () => {
  const SCOPED = ['stats', 'library', 'profile', 'network', 'lists'];

  it.each(SCOPED)('/%s/?u=someone does not activate %s', page => {
    const active = activeFor({ pathname: `/${page}/`, search: '?u=someone', stored: 'feed' });
    expect(active).not.toContain(page);
  });

  it.each(SCOPED)('/%s/?u=someone falls back to the remembered tab', page => {
    expect(activeFor({ pathname: `/${page}/`, search: '?u=someone', stored: 'home' })).toEqual(['home']);
  });

  it.each(SCOPED)('/%s/?u=someone does not overwrite the stored tab', page => {
    const nav = loadNav({ pathname: `/${page}/`, search: '?u=someone', stored: 'home' });
    nav.setActiveNav();
    expect(nav.store.get('nav-active')).toBe('home');
  });

  it('still activates settings on /settings/?u= since it is not user-scoped', () => {
    expect(activeFor({ pathname: '/settings/', search: '?u=someone' })).toEqual(['settings']);
  });

  it('still activates search on /search/?u=', () => {
    expect(activeFor({ pathname: '/search/', search: '?u=someone' })).toEqual(['search']);
  });

  it('still activates home on /home/?u=', () => {
    expect(activeFor({ pathname: '/home/', search: '?u=someone' })).toEqual(['home']);
  });

  it('treats an empty ?u= as still being a friend page', () => {
    // URLSearchParams.has() is true for a valueless key.
    const active = activeFor({ pathname: '/library/', search: '?u=', stored: 'feed' });
    expect(active).toEqual(['feed']);
  });

  it('ignores unrelated query parameters', () => {
    expect(activeFor({ pathname: '/library/', search: '?sort=title' })).toEqual(['library']);
  });

  it('ignores a query parameter merely containing u', () => {
    expect(activeFor({ pathname: '/library/', search: '?user=bob' })).toEqual(['library']);
  });

  it('detects u when it is not the first parameter', () => {
    expect(activeFor({ pathname: '/library/', search: '?sort=title&u=bob', stored: 'feed' })).toEqual(['feed']);
  });
});

// ── localStorage persistence ──────────────────────────────────────────────────

describe('setActiveNav — persistence', () => {
  it.each(NAV_IDS)('stores %s when that page is visited', page => {
    const nav = loadNav({ pathname: `/${page}/` });
    nav.setActiveNav();
    expect(nav.store.get('nav-active')).toBe(page);
  });

  it('overwrites a previously stored tab on a real page visit', () => {
    const nav = loadNav({ pathname: '/search/', stored: 'library' });
    nav.setActiveNav();
    expect(nav.store.get('nav-active')).toBe('search');
  });

  it('defaults to feed when nothing is stored and the path is unknown', () => {
    expect(activeFor({ pathname: '/book/' })).toEqual(['feed']);
  });

  it('does not write to storage on an unknown path', () => {
    const nav = loadNav({ pathname: '/book/' });
    nav.setActiveNav();
    expect(nav.store.has('nav-active')).toBe(false);
  });

  it('restores the stored tab on a detail page', () => {
    expect(activeFor({ pathname: '/book/', stored: 'library' })).toEqual(['library']);
  });

  it('restores the stored tab on an author page', () => {
    expect(activeFor({ pathname: '/author/', stored: 'search' })).toEqual(['search']);
  });

  it('restores the stored tab on the activity page', () => {
    expect(activeFor({ pathname: '/activity/', stored: 'feed' })).toEqual(['feed']);
  });

  it('activates nothing when the stored tab has no matching element', () => {
    expect(activeFor({ pathname: '/book/', stored: 'nonexistent' })).toEqual([]);
  });
});

// ── Idempotence and exclusivity ───────────────────────────────────────────────

describe('setActiveNav — exclusivity', () => {
  it('clears a previously active item when the page changes', () => {
    const nav = loadNav({ pathname: '/library/' });
    nav.setActiveNav();
    expect(nav.activeIds()).toEqual(['library']);
    nav.els.find(e => e.dataset.nav === 'feed').classes.add('active');
    nav.setActiveNav();
    expect(nav.activeIds()).toEqual(['library']);
  });

  it('is idempotent across repeated calls', () => {
    const nav = loadNav({ pathname: '/stats/' });
    nav.setActiveNav();
    nav.setActiveNav();
    nav.setActiveNav();
    expect(nav.activeIds()).toEqual(['stats']);
  });

  it('leaves other classes on the element untouched', () => {
    const nav = loadNav({ pathname: '/home/' });
    nav.els[0].classes.add('custom');
    nav.setActiveNav();
    expect(nav.els[0].classes.has('custom')).toBe(true);
  });

  it('handles a page with no nav elements at all', () => {
    const nav = loadNav({ pathname: '/home/', navIds: [] });
    expect(() => nav.setActiveNav()).not.toThrow();
  });

  it('handles duplicate nav elements for the same page', () => {
    const nav = loadNav({ pathname: '/feed/', navIds: ['feed', 'feed', 'home'] });
    nav.setActiveNav();
    expect(nav.activeIds()).toEqual(['feed', 'feed']);
  });
});

// ── Registered listeners ──────────────────────────────────────────────────────

describe('main.js listeners', () => {
  it('registers a DOMContentLoaded handler', () => {
    expect(loadNav().listeners.document.DOMContentLoaded).toBeTypeOf('function');
  });

  it('registers a pageshow handler', () => {
    expect(loadNav().listeners.window.pageshow).toBeTypeOf('function');
  });

  it('registers an unhandledrejection handler', () => {
    expect(loadNav().listeners.window.unhandledrejection).toBeTypeOf('function');
  });

  it('registers an error handler', () => {
    expect(loadNav().listeners.window.error).toBeTypeOf('function');
  });

  it('applies nav state on DOMContentLoaded', () => {
    const nav = loadNav({ pathname: '/network/' });
    nav.listeners.document.DOMContentLoaded();
    expect(nav.activeIds()).toEqual(['network']);
  });

  it('reapplies nav state for a bfcache restore', () => {
    const nav = loadNav({ pathname: '/profile/' });
    nav.listeners.window.pageshow({ persisted: true });
    expect(nav.activeIds()).toEqual(['profile']);
  });

  it('ignores a non-persisted pageshow', () => {
    const nav = loadNav({ pathname: '/profile/' });
    nav.listeners.window.pageshow({ persisted: false });
    expect(nav.activeIds()).toEqual([]);
  });

  it('unhides the body when a promise rejection escapes', () => {
    const nav = loadNav();
    expect(nav.bodyClasses.has('auth-loading')).toBe(true);
    nav.listeners.window.unhandledrejection();
    expect(nav.bodyClasses.has('auth-loading')).toBe(false);
  });

  it('unhides the body on a script error', () => {
    const nav = loadNav();
    nav.listeners.window.error();
    expect(nav.bodyClasses.has('auth-loading')).toBe(false);
  });
});

// ── The duplicated helper is gone ─────────────────────────────────────────────

describe('main.js scope', () => {
  it('no longer defines its own copy of normalizeCountry', () => {
    // The country logic lives in js/utils.js and is imported by the pages that
    // need it; a second copy here would drift out of sync with the tested one.
    expect(mainSrc).not.toMatch(/function normalizeCountry/);
  });

  it('stays small enough to be obviously a nav helper', () => {
    expect(mainSrc.split('\n').length).toBeLessThan(80);
  });
});
