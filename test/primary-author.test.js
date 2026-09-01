// Picking the author out of Hardcover's contributions list.
//
// Reported: "Are Prisons Obsolete?" showed as Angela Y. Davis in search but
// Micah S. Cottingham on the book page. Cottingham narrated the audiobook, and
// Hardcover happens to list him first:
//
//   [{ contribution: 'Narrator', author: 'Micah S. Cottingham' },
//    { contribution: 'Author',   author: 'Angela Y. Davis' }]
//
// Five call sites took contributions[0] without asking what the role was, so
// narrators, translators and illustrators were being written into the author
// field and then merged across editions.

import { describe, it, expect } from 'vitest';
import { primaryAuthor } from '../js/book-utils.js';

const c = (contribution, name) => ({ contribution, author: { name } });

describe('primaryAuthor', () => {
  it('picks the author when the narrator is listed first', () => {
    // The exact record from the report, verified against the live API.
    expect(primaryAuthor([
      c('Narrator', 'Micah S. Cottingham'),
      c('Author', 'Angela Y. Davis'),
    ])).toBe('Angela Y. Davis');
  });

  it('picks the author over a translator, whichever way round they come', () => {
    expect(primaryAuthor([c('Translator', 'Ann Goldstein'), c('Author', 'Elena Ferrante')]))
      .toBe('Elena Ferrante');
    expect(primaryAuthor([c('Author', 'Elena Ferrante'), c('Translator', 'Ann Goldstein')]))
      .toBe('Elena Ferrante');
  });

  it('ignores the other non-writing credits', () => {
    for (const role of ['Illustrator', 'Foreword', 'Introduction', 'Afterword',
                        'Cover Artist', 'Photographer', 'Reader', 'Adapter',
                        'Compiler', 'Annotator', 'Contributor', 'Designer']) {
      expect(primaryAuthor([c(role, 'Someone Else'), c('Author', 'Real Writer')]))
        .toBe('Real Writer');
    }
  });

  it('matches a role by its beginning, not the whole string', () => {
    // Hardcover qualifies some of them.
    expect(primaryAuthor([c('Translator (from the French)', 'A Translator'), c(null, 'The Writer')]))
      .toBe('The Writer');
    expect(primaryAuthor([c('Illustrations by', 'An Artist'), c(null, 'The Writer')]))
      .toBe('The Writer');
  });

  it('takes an unlabelled contribution as the author', () => {
    // Older records leave the role empty for the writer.
    expect(primaryAuthor([c('Narrator', 'A Narrator'), c(null, 'The Writer')])).toBe('The Writer');
    expect(primaryAuthor([c('Narrator', 'A Narrator'), c('', 'The Writer')])).toBe('The Writer');
    expect(primaryAuthor([c('Narrator', 'A Narrator'), c('   ', 'The Writer')])).toBe('The Writer');
  });

  it('prefers an explicit Author over an unlabelled entry', () => {
    expect(primaryAuthor([c(null, 'Ambiguous'), c('Author', 'Definite')])).toBe('Definite');
  });

  it('treats an unrecognised role as a writing credit', () => {
    // The list of non-writing roles is not exhaustive on purpose — anything it
    // does not know should still be allowed to be the author.
    expect(primaryAuthor([c('Narrator', 'A Narrator'), c('Co-Author', 'A Writer')])).toBe('A Writer');
    expect(primaryAuthor([c('Narrator', 'A Narrator'), c('Writer', 'A Writer')])).toBe('A Writer');
  });

  it('names the only person there when everyone listed is a helper', () => {
    // An anthology credited solely to its editor should still show a name,
    // and an audiobook listing only a narrator is no worse off than before.
    expect(primaryAuthor([c('Editor', 'The Editor')])).toBe('The Editor');
    expect(primaryAuthor([c('Narrator', 'Only A Narrator')])).toBe('Only A Narrator');
  });

  it('keeps the first of several authors', () => {
    expect(primaryAuthor([c('Author', 'First'), c('Author', 'Second')])).toBe('First');
  });

  it('returns an empty string rather than throwing on nothing usable', () => {
    expect(primaryAuthor([])).toBe('');
    expect(primaryAuthor(null)).toBe('');
    expect(primaryAuthor(undefined)).toBe('');
    expect(primaryAuthor([{}, { author: null }, { author: {} }])).toBe('');
  });

  it('skips entries with no name and keeps going', () => {
    expect(primaryAuthor([{ contribution: 'Author', author: {} }, c('Author', 'Real')])).toBe('Real');
  });

  it('is case-insensitive about roles', () => {
    expect(primaryAuthor([c('NARRATOR', 'A Narrator'), c('author', 'The Writer')])).toBe('The Writer');
  });
});
