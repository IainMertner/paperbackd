// Ordering people search results by follower count.
//
// The interesting property is stability rather than the sort itself. Almost
// every account here has no followers, so almost every comparison is a tie — and
// if ties did not hold their relevance order, searching an exact username could
// bury it under a dozen partial matches.

import { describe, it, expect } from 'vitest';
import { orderByFollowers } from '../js/utils.js';

const u = (username, followerCount) => ({ username, followerCount });
const names = list => list.map(x => x.username);

describe('orderByFollowers', () => {
  it('puts the most followed first', () => {
    expect(names(orderByFollowers([u('a', 3), u('b', 40), u('c', 12)])))
      .toEqual(['b', 'c', 'a']);
  });

  it('keeps the incoming order when counts tie', () => {
    // searchUsers returns its best match first; a tie must not disturb that.
    const results = [u('exact', 0), u('exactish', 0), u('exactly', 0)];
    expect(names(orderByFollowers(results))).toEqual(['exact', 'exactish', 'exactly']);
  });

  it('keeps relevance order within each tied group', () => {
    const results = [u('a', 0), u('b', 5), u('c', 0), u('d', 5), u('e', 0)];
    expect(names(orderByFollowers(results))).toEqual(['b', 'd', 'a', 'c', 'e']);
  });

  it('treats a missing count as zero rather than dropping the person', () => {
    // A count query that failed costs someone their place, not their listing.
    const results = [{ username: 'nocount' }, u('one', 1), { username: 'undef', followerCount: undefined }];
    expect(names(orderByFollowers(results))).toEqual(['one', 'nocount', 'undef']);
    expect(orderByFollowers(results)).toHaveLength(3);
  });

  it('does not reorder the caller\'s array', () => {
    const results = [u('a', 1), u('b', 9)];
    const before = names(results);
    orderByFollowers(results);
    expect(names(results)).toEqual(before);
  });

  it('handles an empty or missing list', () => {
    expect(orderByFollowers([])).toEqual([]);
    expect(orderByFollowers(null)).toEqual([]);
    expect(orderByFollowers(undefined)).toEqual([]);
  });

  it('survives a null entry rather than throwing', () => {
    expect(orderByFollowers([u('a', 2), null]).length).toBe(2);
  });

  it('is idempotent', () => {
    const results = [u('a', 0), u('b', 5), u('c', 0)];
    const once = orderByFollowers(results);
    expect(names(orderByFollowers(once))).toEqual(names(once));
  });
});
