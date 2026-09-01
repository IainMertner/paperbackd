// Lint config, kept deliberately narrow.
//
// This exists because of one bug: addFinishedBook referenced `format`, which was
// never a parameter, and it shipped. `node --check` parses but does not resolve
// identifiers, and js/firebase.js cannot be imported by the test suite — it pulls
// the Firebase SDK over https, which the Node runner will not resolve. So the
// one class of error with no net at all was the undefined identifier.
//
// Only rules that catch real defects are on. Style rules are left off on purpose:
// a lint run nobody reads because it is mostly noise catches nothing.

import globals from 'globals';
import html from 'eslint-plugin-html';

// Every page's inline module script is a separate scope, so anything one page
// defines and another uses would be a genuine error rather than a shared global.
const BUG_RULES = {
  'no-undef': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-dupe-class-members': 'error',
  'no-const-assign': 'error',
  'no-redeclare': 'error',
  'no-unreachable': 'error',
  'no-self-assign': 'error',
  'no-unsafe-negation': 'error',
  'no-cond-assign': 'error',
  'no-dupe-else-if': 'error',
  'no-duplicate-case': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  // The prototype-chain trap that has bitten this codebase three times now —
  // formatCounts, genderCounts, and normalizeCountry's overrides table.
  'no-prototype-builtins': 'error',
  // A warning, not an error, and deliberately so. There are a few dozen dead
  // imports and leftovers in the pages; as errors they would fail every run and
  // the whole thing would stop being read, which is how a lint step becomes
  // decorative. Worth tidying, not worth blocking on.
  //
  // Arguments are exempt: a destructured parameter list documents the shape a
  // function accepts even where a field goes unread.
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
};

export default [
  {
    ignores: ['node_modules/**', 'functions/node_modules/**'],
  },
  {
    // The pure modules, the tests, and the Cloudflare worker.
    files: ['js/**/*.js', 'test/**/*.js', 'worker/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: BUG_RULES,
  },
  {
    // The service worker has its own globals — self, clients, skipWaiting.
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.serviceworker,
    },
    rules: BUG_RULES,
  },
  {
    // Cloud Functions are CommonJS and run in Node.
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: BUG_RULES,
  },
  {
    // Every page is one big inline <script type="module">, which is exactly
    // where the untested code lives. eslint-plugin-html extracts them.
    files: ['**/*.html'],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: BUG_RULES,
  },
];
