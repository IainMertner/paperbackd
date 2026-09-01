// The edge cache in front of Hardcover.
//
// Two things here can quietly cost real money or real correctness. Under-
// normalising means "Piranesi" and "piranesi" occupy separate cache entries and
// the hit rate collapses; over-normalising means a slug or an ISBN gets mangled
// on the way to the key and one book's answer is served for another's question.
// Both halves are pinned below.

import { describe, it, expect } from 'vitest';
import { normaliseBody, isSearch, freshSeconds } from '../worker/hardcover-proxy.js';

const search = q => JSON.stringify({
  query: 'query($q:String!){search(query:$q,query_type:"Book",per_page:8,page:1){results}}',
  variables: { q },
});

describe('normaliseBody — what shares a cache entry', () => {
  it('folds case and stray space in the search term', () => {
    // Search-as-you-type is the whole reason this exists.
    expect(normaliseBody(search('Piranesi'))).toBe(normaliseBody(search('piranesi')));
    expect(normaliseBody(search('  piranesi  '))).toBe(normaliseBody(search('piranesi')));
    expect(normaliseBody(search('susanna   clarke'))).toBe(normaliseBody(search('susanna clarke')));
  });

  it('keeps different searches apart', () => {
    expect(normaliseBody(search('piranesi'))).not.toBe(normaliseBody(search('babel')));
  });

  it('ignores whitespace differences in the query document', () => {
    // The same query written tersely in one page and prettily in another should
    // not cost two upstream calls.
    const a = JSON.stringify({ query: 'query($q:String!){search(query:$q){results}}', variables: { q: 'x' } });
    const b = JSON.stringify({ query: 'query($q:String!) {\n  search(query: $q) { results }\n}', variables: { q: 'x' } });
    expect(normaliseBody(a)).toBe(normaliseBody(b));
  });

  it('leaves spacing inside a string literal alone', () => {
    // Squeezing whitespace around punctuation must stop at the quote marks, or
    // a genre or query_type argument silently changes meaning.
    const out = normaliseBody(JSON.stringify({
      query: 'query { search(query_type: "Historical Fiction, US") { results } }',
      variables: {},
    }));
    // The result is itself JSON, so the literal's quotes come back escaped —
    // what matters is that the comma still has its space.
    expect(out).toContain('Historical Fiction, US');
  });

  it('does not weld two words together when it removes the space between them', () => {
    const out = normaliseBody(JSON.stringify({ query: 'query  Search { me { id } }', variables: {} }));
    expect(out).toContain('query Search');
  });

  it('ignores the order keys happen to be serialised in', () => {
    const a = JSON.stringify({ query: 'q{search(x)}', variables: { q: 'x', n: 5 } });
    const b = JSON.stringify({ query: 'q{search(x)}', variables: { n: 5, q: 'x' } });
    expect(normaliseBody(a)).toBe(normaliseBody(b));
  });

  it('sorts keys inside nested variables too', () => {
    const a = JSON.stringify({ query: 'q{books}', variables: { where: { slug: { _in: ['a'] }, b: 1 } } });
    const b = JSON.stringify({ query: 'q{books}', variables: { where: { b: 1, slug: { _in: ['a'] } } } });
    expect(normaliseBody(a)).toBe(normaliseBody(b));
  });
});

describe('normaliseBody — what must never be touched', () => {
  it('leaves identifiers other than q exactly alone', () => {
    // Case-folding a slug or an ISBN would key two different books together and
    // serve one the other's answer.
    const body = JSON.stringify({ query: 'q{books}', variables: { slugs: ['The-Employees', 'DUNE'], isbn: '9780571350865' } });
    const out  = normaliseBody(body);
    expect(out).toContain('The-Employees');
    expect(out).toContain('DUNE');
    expect(out).toContain('9780571350865');
  });

  it('keeps array order, which is not incidental', () => {
    const a = normaliseBody(JSON.stringify({ query: 'q{books}', variables: { ids: [1, 2, 3] } }));
    const b = normaliseBody(JSON.stringify({ query: 'q{books}', variables: { ids: [3, 2, 1] } }));
    expect(a).not.toBe(b);
  });

  it('preserves numbers and nulls rather than stringifying them', () => {
    const out = normaliseBody(JSON.stringify({ query: 'q{books}', variables: { n: 100, missing: null } }));
    expect(out).toContain('"n":100');
    expect(out).toContain('"missing":null');
  });

  it('does not fold case on a q that is not a string', () => {
    const out = normaliseBody(JSON.stringify({ query: 'q{search(x)}', variables: { q: 42 } }));
    expect(out).toContain('"q":42');
  });
});

describe('normaliseBody — refusing to key on nonsense', () => {
  it('returns null for anything unparseable, so it is proxied uncached', () => {
    expect(normaliseBody('not json')).toBe(null);
    expect(normaliseBody('')).toBe(null);
  });

  it('returns null for a body with no query in it', () => {
    expect(normaliseBody(JSON.stringify({ variables: { q: 'x' } }))).toBe(null);
    expect(normaliseBody(JSON.stringify({ query: '   ' }))).toBe(null);
  });

  it('returns null for JSON that is not an object', () => {
    expect(normaliseBody('[]')).toBe(null);
    expect(normaliseBody('null')).toBe(null);
    expect(normaliseBody('"hello"')).toBe(null);
  });

  it('handles a body with no variables at all', () => {
    expect(normaliseBody(JSON.stringify({ query: '{me{id}}' }))).toBe('{"query":"{me{id}}","variables":null}');
  });
});

describe('isSearch', () => {
  it('spots the search endpoint', () => {
    expect(isSearch(normaliseBody(search('x')))).toBe(true);
  });

  it('does not mistake a batch metadata query for one', () => {
    const body = normaliseBody(JSON.stringify({
      query: 'query($slugs:[String!]!){books(where:{slug:{_in:$slugs}},limit:100){id slug pages}}',
      variables: { slugs: ['piranesi'] },
    }));
    expect(isSearch(body)).toBe(false);
  });

  it('is not fooled by the word appearing in a field name', () => {
    expect(isSearch('{ searchable_title }')).toBe(false);
  });

  it('survives being handed nothing', () => {
    expect(isSearch(null)).toBe(false);
    expect(isSearch('')).toBe(false);
  });
});

describe('freshSeconds — what is worth remembering', () => {
  const hits = n => ({ data: { search: { results: { hits: Array(n).fill({ document: {} }) } } } });
  const searchBody = normaliseBody(search('piranesi'));
  const otherBody  = normaliseBody(JSON.stringify({ query: '{books{id}}', variables: {} }));

  it('holds a search with results for hours', () => {
    expect(freshSeconds(searchBody, hits(8))).toBe(6 * 3600);
  });

  it('holds an empty result only briefly', () => {
    // Half-typed words are the most repeated query there is, so it is worth
    // caching — but the book may simply not be in the catalogue yet.
    expect(freshSeconds(searchBody, hits(0))).toBe(600);
  });

  it('gives non-search queries their own, shorter life', () => {
    expect(freshSeconds(otherBody, { data: { books: [] } })).toBe(3600);
  });

  it('refuses to cache a GraphQL error, which arrives as a 200', () => {
    // This is the one that would really hurt: caching it pins the failure for
    // hours for everyone, long after upstream has recovered.
    expect(freshSeconds(searchBody, { errors: [{ message: 'rate limited' }] })).toBe(0);
    expect(freshSeconds(searchBody, { data: null, errors: [{ message: 'boom' }] })).toBe(0);
  });

  it('refuses a response carrying no data at all', () => {
    expect(freshSeconds(searchBody, {})).toBe(0);
    expect(freshSeconds(searchBody, { data: null })).toBe(0);
  });

  it('refuses anything that is not a response object', () => {
    expect(freshSeconds(searchBody, null)).toBe(0);
    expect(freshSeconds(searchBody, undefined)).toBe(0);
    expect(freshSeconds(searchBody, 'garbage')).toBe(0);
    expect(freshSeconds(searchBody, [])).toBe(0);
  });

  it('caches a search whose shape it does not recognise, rather than dropping it', () => {
    // An author search nests differently. It has data and no errors, so it is a
    // real answer and gets the normal search life.
    expect(freshSeconds(searchBody, { data: { search: { results: {} } } })).toBe(6 * 3600);
  });
});
