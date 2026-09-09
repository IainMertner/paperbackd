// The date-range control shared by the stats graphs and the library.
//
// Both pages ask the same question — "what did I finish in this window" — and
// the library has to be able to land on the window a chart was showing when you
// clicked through from it. One implementation so the two cannot drift, and so
// the URL round-trip is written once.

import { presetRange, customRange, toDateInputValue } from './stats-utils.js';

export const PERIOD_OPTIONS = [
  ['all',        'All time'],
  ['this-month', 'This month'],
  ['this-year',  'This year'],
  ['month',      '1 month'],
  ['year',       '1 year'],
  ['custom',     'Custom…'],
];

// The markup, so neither page hand-writes it. `idPrefix` keeps the ids unique on
// a page that might one day carry two of these.
export function periodBarHtml(idPrefix = 'period') {
  const options = PERIOD_OPTIONS
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');
  return `<div class="period-bar">
      <select class="settings-select" id="${idPrefix}-preset">${options}</select>
      <div class="period-custom" id="${idPrefix}-custom" style="display:none">
        <label class="period-field"><span>From</span><input type="date" id="${idPrefix}-from"></label>
        <label class="period-field"><span>To</span><input type="date" id="${idPrefix}-to"></label>
      </div>
      <div class="period-summary" id="${idPrefix}-summary"></div>
    </div>`;
}

// What a chart's click-through needs to append to carry its window along.
// Presets travel by name so the library shows the same option selected; a custom
// range travels as its two dates.
export function periodQuery(preset, range) {
  if (!preset || preset === 'all') return '';
  if (preset !== 'custom') return `&period=${encodeURIComponent(preset)}`;
  const from = toDateInputValue(range?.from);
  const to   = toDateInputValue(range?.to);
  if (!from && !to) return '';
  return `&period=custom${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`;
}

// The reverse: what a URL is asking for. Falls back to all time for anything
// unrecognised rather than showing an empty page.
export function periodFromParams(params) {
  const preset = params.get('period') || 'all';
  const known = PERIOD_OPTIONS.some(([value]) => value === preset);
  if (!known) return { preset: 'all', from: '', to: '' };
  return { preset, from: params.get('from') || '', to: params.get('to') || '' };
}

// Wires a period bar up. `onChange(range, preset)` fires whenever the window
// changes; the caller does whatever filtering it likes with it.
//
// Returns { preset, range, setSummary } so a caller can report what it found and
// build its own links back out.
export function initPeriodBar({ idPrefix = 'period', initial, onChange }) {
  const select = document.getElementById(`${idPrefix}-preset`);
  const custom = document.getElementById(`${idPrefix}-custom`);
  const fromEl = document.getElementById(`${idPrefix}-from`);
  const toEl   = document.getElementById(`${idPrefix}-to`);
  const summary = document.getElementById(`${idPrefix}-summary`);

  const state = { preset: 'all', range: { from: null, to: null } };

  // Where the custom fields start before anything hands them dates of their own.
  const seed = presetRange('year');
  fromEl.value = toDateInputValue(seed.from);
  toEl.value   = toDateInputValue(seed.to);

  function apply(preset, { silent = false } = {}) {
    // Arriving at Custom from another window carries that window into the date
    // fields, so it opens on what was being looked at. Guarded on the previous
    // preset because editing either date calls this again with "custom" —
    // otherwise every edit would overwrite the field being typed into.
    if (preset === 'custom' && state.preset !== 'custom') {
      if (state.range.from) fromEl.value = toDateInputValue(state.range.from);
      if (state.range.to)   toEl.value   = toDateInputValue(state.range.to);
    }
    state.preset = preset;
    select.value = preset;
    custom.style.display = preset === 'custom' ? '' : 'none';
    state.range = preset === 'custom' ? customRange(fromEl.value, toEl.value) : presetRange(preset);
    if (!silent) onChange(state.range, state.preset);
  }

  select.addEventListener('change', () => apply(select.value));
  // Redrawn as each date is picked, so a half-filled range shows what it has
  // rather than waiting for both ends.
  fromEl.addEventListener('change', () => apply('custom'));
  toEl.addEventListener('change', () => apply('custom'));

  if (initial?.from) fromEl.value = initial.from;
  if (initial?.to)   toEl.value   = initial.to;
  // Silent: the caller draws once itself after this returns, and firing here
  // would make it draw twice on every page load.
  apply(initial?.preset || 'all', { silent: true });

  return {
    get preset() { return state.preset; },
    get range()  { return state.range; },
    setSummary(text) { summary.textContent = text; },
  };
}

// "12 of 340 books" and the span it covers, on two lines — the count is the
// answer and the dates are the question, and running them together made a long
// single line that wrapped anywhere it liked.
//
// A newline rather than markup, so setSummary can stay on textContent; the
// .period-summary rule keeps it with white-space: pre-line.
//
// The total is worth saying either way: an empty view is otherwise
// indistinguishable from a broken one.
export function describeRange(range, shown, total, noun = 'book') {
  const plural = n => (n === 1 ? noun : `${noun}s`);
  if (!range?.from && !range?.to) return `${total} ${plural(total)}`;
  const fmt = d => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
  const from = fmt(range.from);
  const to   = fmt(range.to);
  const span = from && to ? `${from} – ${to}` : from ? `since ${from}` : `up to ${to}`;
  return `${shown} of ${total} ${plural(total)}\n${span}`;
}
