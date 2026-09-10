import { describe, it, expect } from 'vitest';
import { remapListBooks } from '../js/book-utils.js';

const target = { slug: 'the-employees', title: 'The Employees', author: 'Olga Ravn', coverUrl: 'new.jpg' };

describe('remapListBooks', () => {
  it('repoints a matching entry and takes the target\'s facts with it', () => {
    const books = [{ gbid: 'de-ansatte', title: 'De ansatte', author: 'Olga Ravn', coverUrl: 'old.jpg', addedAt: 5 }];
    const { books: out, changed, removed } = remapListBooks(books, 'de-ansatte', target);
    expect(changed).toBe(1);
    expect(removed).toBe(0);
    expect(out[0]).toEqual({
      gbid: 'the-employees', title: 'The Employees', author: 'Olga Ravn', coverUrl: 'new.jpg', addedAt: 5,
    });
  });

  it('leaves entries pointing elsewhere alone', () => {
    const books = [{ gbid: 'dune', title: 'Dune' }, { gbid: 'de-ansatte', title: 'De ansatte' }];
    const out = remapListBooks(books, 'de-ansatte', target).books;
    expect(out[0]).toEqual({ gbid: 'dune', title: 'Dune' });
  });

  it('does not mutate the input', () => {
    const books = [{ gbid: 'de-ansatte', title: 'De ansatte' }];
    remapListBooks(books, 'de-ansatte', target);
    expect(books[0]).toEqual({ gbid: 'de-ansatte', title: 'De ansatte' });
  });

  // A list entry has no reads to merge, so the duplicate is simply dropped.
  it('collapses a remapped entry onto the target already on the list', () => {
    const books = [
      { gbid: 'the-employees', title: 'The Employees', addedAt: 1 },
      { gbid: 'de-ansatte',    title: 'De ansatte',    addedAt: 9 },
    ];
    const { books: out, changed, removed } = remapListBooks(books, 'de-ansatte', target);
    expect(changed).toBe(1);
    expect(removed).toBe(1);
    expect(out).toHaveLength(1);
    // The earliest copy wins, keeping the addedAt that put it in its place.
    expect(out[0].addedAt).toBe(1);
  });

  it('collapses in the other order too', () => {
    const books = [
      { gbid: 'de-ansatte',    title: 'De ansatte',    addedAt: 1 },
      { gbid: 'the-employees', title: 'The Employees', addedAt: 9 },
    ];
    const { books: out, removed } = remapListBooks(books, 'de-ansatte', target);
    expect(removed).toBe(1);
    expect(out).toHaveLength(1);
    expect(out[0].addedAt).toBe(1);
  });

  // A remap should not quietly tidy up duplicates it was never asked about.
  it('leaves duplicates unrelated to the target in place', () => {
    const books = [
      { gbid: 'dune', title: 'Dune' },
      { gbid: 'dune', title: 'Dune' },
      { gbid: 'de-ansatte', title: 'De ansatte' },
    ];
    const out = remapListBooks(books, 'de-ansatte', target).books;
    expect(out).toHaveLength(3);
  });

  it('does not blank a field the target has not got', () => {
    const bare = { slug: 'the-employees' };
    const books = [{ gbid: 'de-ansatte', title: 'De ansatte', author: 'Olga Ravn', coverUrl: 'old.jpg' }];
    const out = remapListBooks(books, 'de-ansatte', bare).books;
    expect(out[0]).toEqual({ gbid: 'the-employees', title: 'De ansatte', author: 'Olga Ravn', coverUrl: 'old.jpg' });
  });

  // Both sides the same slug is a refresh: it rewrites stale facts and counts
  // nothing when there is nothing stale to rewrite.
  it('counts nothing on a refresh that changes nothing', () => {
    const books = [{ gbid: 'the-employees', title: 'The Employees', author: 'Olga Ravn', coverUrl: 'new.jpg' }];
    const out = remapListBooks(books, 'the-employees', target);
    expect(out.changed).toBe(0);
    expect(out.books).toBe(books);   // same array, so the caller skips the write
  });

  it('refreshes a stale title in place', () => {
    const books = [{ gbid: 'the-employees', title: 'The Employees: A Workplace Novel' }];
    const out = remapListBooks(books, 'the-employees', target);
    expect(out.changed).toBe(1);
    expect(out.books[0].title).toBe('The Employees');
    expect(out.removed).toBe(0);
  });

  // A hand-added book carries gbid '', which must never match a missing slug.
  it('never touches a hand-added entry', () => {
    const books = [{ gbid: '', title: 'My own book' }, { title: 'No gbid at all' }];
    expect(remapListBooks(books, '', target).changed).toBe(0);
    expect(remapListBooks(books, undefined, target).changed).toBe(0);
    expect(remapListBooks(books, 'de-ansatte', target).changed).toBe(0);
  });

  it('is safe on junk', () => {
    expect(remapListBooks(null, 'a', target)).toEqual({ books: [], changed: 0, removed: 0 });
    expect(remapListBooks([], 'a', target)).toEqual({ books: [], changed: 0, removed: 0 });
    expect(remapListBooks([{ gbid: 'a' }], 'a', null).changed).toBe(0);
    expect(remapListBooks([{ gbid: 'a' }], 'a', {}).changed).toBe(0);
    expect(remapListBooks([null, undefined, { gbid: 'a', title: 'A' }], 'a', target).changed).toBe(1);
  });
});
