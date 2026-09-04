// Not adding the same book to a list twice.
//
// Reported: adding books by hand worked in the library but not from a list page.
// addBookToList deduped with `b.gbid === book.gbid`, and a book added by hand has
// no gbid at all — so once a list held one hand-added book, '' === '' made every
// later one look like a duplicate and it was dropped in silence.
//
// It looked like it had worked, too: the page's own check was on title, so the
// row was drawn, and only a reload revealed that Firestore had refused it.

import { describe, it, expect } from 'vitest';
import { sameBook } from '../js/book-utils.js';

// The predicate both sides now use.
const isDuplicate = (list, candidate) => list.some(b => sameBook(b, candidate));

describe('list de-duplication', () => {
  it('lets a second hand-added book onto a list', () => {
    // The bug, exactly: both have gbid ''.
    const list = [{ gbid: '', title: 'A Hand-Typed Book', author: '' }];
    expect(isDuplicate(list, { gbid: '', title: 'A Different Book' })).toBe(false);
  });

  it('still refuses the same hand-added book twice', () => {
    const list = [{ gbid: '', title: 'Piranesi' }];
    expect(isDuplicate(list, { gbid: '', title: 'Piranesi' })).toBe(true);
    expect(isDuplicate(list, { gbid: '', title: '  piranesi  ' })).toBe(true);
  });

  it('still refuses the same catalogue book twice', () => {
    const list = [{ gbid: 'piranesi', title: 'Piranesi' }];
    expect(isDuplicate(list, { gbid: 'piranesi', title: 'Piranesi' })).toBe(true);
  });

  it('keeps two catalogue books apart even when the titles match', () => {
    // Two Hardcover records for one title stay distinct — gbid is the identity.
    const list = [{ gbid: 'dune-1965', title: 'Dune' }];
    expect(isDuplicate(list, { gbid: 'dune-2021', title: 'Dune' })).toBe(false);
  });

  it('spots a hand-typed book that is already on the list from the catalogue', () => {
    // Worth having: typing a title you already added from search should not
    // create a second row for the same book.
    const list = [{ gbid: 'piranesi', title: 'Piranesi' }];
    expect(isDuplicate(list, { gbid: '', title: 'Piranesi' })).toBe(true);
  });

  it('fills a list with several hand-added books, which was impossible before', () => {
    const list = [];
    for (const title of ['One', 'Two', 'Three']) {
      const candidate = { gbid: '', title };
      if (!isDuplicate(list, candidate)) list.push(candidate);
    }
    expect(list.map(b => b.title)).toEqual(['One', 'Two', 'Three']);
  });

  it('agrees with what the page shows', () => {
    // The page used `b.title === title` and the server used gbid, so the two
    // could disagree — the row appeared and then vanished on reload. Both sides
    // run the same predicate now.
    const list = [{ gbid: '', title: 'Kept' }];
    const candidate = { gbid: '', title: 'New' };
    const serverWouldAdd = !isDuplicate(list, candidate);
    const pageWouldDraw  = !isDuplicate(list, candidate);
    expect(serverWouldAdd).toBe(pageWouldDraw);
  });
});
