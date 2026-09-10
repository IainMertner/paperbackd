import { describe, it, expect } from 'vitest';
import { titleForSlug, applyTitleOverrides, retitleListBooks } from '../js/book-utils.js';

describe('titleForSlug', () => {
  const titles = { 'gods-children': "God's Children Are Little Broken Things" };

  it('returns the override for a slug that has one', () => {
    expect(titleForSlug('gods-children', titles, 'x')).toBe("God's Children Are Little Broken Things");
  });

  it('falls back when the slug has no override', () => {
    expect(titleForSlug('something-else', titles, 'Fallback')).toBe('Fallback');
  });

  it('falls back with no slug, no table, or an empty override', () => {
    expect(titleForSlug('', titles, 'Fallback')).toBe('Fallback');
    expect(titleForSlug('gods-children', null, 'Fallback')).toBe('Fallback');
    expect(titleForSlug('blank', { blank: '   ' }, 'Fallback')).toBe('Fallback');
  });

  it('trims a padded override', () => {
    expect(titleForSlug('a', { a: '  Trimmed  ' }, 'x')).toBe('Trimmed');
  });

  it('defaults the fallback to an empty string', () => {
    expect(titleForSlug('nope', titles)).toBe('');
  });

  // The prototype chain: titles['constructor'] is a function, not a title.
  it('ignores inherited properties', () => {
    for (const slug of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(titleForSlug(slug, {}, 'Fallback')).toBe('Fallback');
    }
  });
});

describe('applyTitleOverrides', () => {
  const titles = { b: 'Renamed' };

  it('rewrites the title of a matching doc', () => {
    const docs = [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B: Stories' }];
    expect(applyTitleOverrides(docs, titles).map(d => d.title)).toEqual(['A', 'Renamed']);
  });

  it('leaves every other field alone', () => {
    const out = applyTitleOverrides([{ slug: 'b', title: 'B', author_names: ['X'], id: 7 }], titles);
    expect(out[0]).toEqual({ slug: 'b', title: 'Renamed', author_names: ['X'], id: 7 });
  });

  it('does not mutate the input', () => {
    const docs = [{ slug: 'b', title: 'B' }];
    applyTitleOverrides(docs, titles);
    expect(docs[0].title).toBe('B');
  });

  it('returns the same doc object when nothing changes', () => {
    const doc = { slug: 'a', title: 'A' };
    expect(applyTitleOverrides([doc], titles)[0]).toBe(doc);
  });

  it('is a pass-through without a table, and safe on junk', () => {
    const docs = [{ slug: 'b', title: 'B' }];
    expect(applyTitleOverrides(docs, null)).toBe(docs);
    expect(applyTitleOverrides(null, titles)).toEqual([]);
    expect(applyTitleOverrides(undefined, titles)).toEqual([]);
  });

  it('tolerates a doc with no slug', () => {
    expect(applyTitleOverrides([{ title: 'No slug' }], titles)[0].title).toBe('No slug');
  });
});

describe('retitleListBooks', () => {
  const books = [
    { gbid: 'a', title: 'A' },
    { gbid: 'b', title: 'B: Stories' },
    { gbid: 'b', title: 'B: Stories' },
    { gbid: '',  title: 'Hand-added' },
  ];

  it('rewrites every entry pointing at the slug', () => {
    const out = retitleListBooks(books, 'b', 'B');
    expect(out.changed).toBe(2);
    expect(out.books.map(b => b.title)).toEqual(['A', 'B', 'B', 'Hand-added']);
  });

  it('does not mutate the input array or its entries', () => {
    retitleListBooks(books, 'b', 'B');
    expect(books[1].title).toBe('B: Stories');
  });

  // A hand-added book has gbid '', which must not match a missing slug.
  it('never matches a hand-added entry', () => {
    expect(retitleListBooks(books, '', 'X').changed).toBe(0);
    expect(retitleListBooks(books, undefined, 'X').changed).toBe(0);
  });

  it('reports nothing changed when the title already matches', () => {
    const out = retitleListBooks([{ gbid: 'b', title: 'B' }], 'b', 'B');
    expect(out.changed).toBe(0);
  });

  it('returns the original array when nothing changed, so the caller can skip the write', () => {
    const same = [{ gbid: 'a', title: 'A' }];
    expect(retitleListBooks(same, 'b', 'B').books).toBe(same);
  });

  it('is safe on junk', () => {
    expect(retitleListBooks(null, 'b', 'B')).toEqual({ books: [], changed: 0 });
    expect(retitleListBooks(books, 'b', '').changed).toBe(0);
    expect(retitleListBooks([null, undefined], 'b', 'B').changed).toBe(0);
  });
});
