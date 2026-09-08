// Extra book metadata gathered at add time: genres from Hardcover, and the
// author's country and gender from Wikidata.
//
// Shared because the library and the book page both add books, and for a long
// time only the library did this — a book added from its own page arrived with
// no country, gender or genres, and stayed that way until someone ran Repair.
//
// Every lookup fails soft. This is decoration on top of a book that is being
// saved regardless, so a Wikidata outage must never stop someone logging a book.

import { hcQuery } from './hardcover.js';
import { getAuthorCountryOverrides, getCountryRemaps } from './firebase.js';
import { normalizeCountry } from './utils.js';
import { pickSeries } from './book-utils.js';

const WIKIDATA = 'https://www.wikidata.org/w/api.php';

// Wikidata's P21 (sex or gender) values, mapped to what the app stores.
const GENDER_MAP = {
  Q6581072: 'Female', Q6581097: 'Male', Q1097630: 'Intersex',
  Q48270: 'Non-binary', Q2449503: 'Transgender female', Q1052281: 'Transgender male',
};

// Cached for the page's lifetime: every add would otherwise refetch the whole
// override table.
let overridesCache = null;
async function overrides() {
  if (!overridesCache) overridesCache = await getAuthorCountryOverrides().catch(() => ({}));
  return overridesCache;
}

// Wikidata ranks its statements; an author with several citizenships has one
// marked preferred. Taking the first regardless would pick an arbitrary one.
const bestClaim = claims => claims.find(c => c.rank === 'preferred')
  || claims.find(c => c.rank === 'normal')
  || claims[0];

// Genres and series in one query, since they come from the same record. The
// series is what lets the most-read-authors stat count a trilogy once instead of
// three times — see authorReadCounts.
const HC_FIELDS = 'cached_tags book_series{featured series{id name}}';

async function fetchBookFields(slug) {
  if (!slug) return {};
  const numeric = /^\d+$/.test(slug);
  const query = numeric
    ? `query($id:Int!){books(where:{id:{_eq:$id}},limit:1){${HC_FIELDS}}}`
    : `query($slug:String!){books(where:{slug:{_eq:$slug}},limit:1){${HC_FIELDS}}}`;
  const data = await hcQuery(query, numeric ? { id: parseInt(slug, 10) } : { slug });
  const book = data?.data?.books?.[0];
  const out = {};
  const genres = (book?.cached_tags?.Genre || []).map(t => t.tag).filter(Boolean);
  if (genres.length) out.genres = genres;
  // Always set, '' included: an absent key means nobody has looked, which is
  // what repair tests to decide whether to ask. A standalone that came back
  // empty has been looked up, and must not be asked about again.
  const series = pickSeries(book?.book_series);
  if (book) out.seriesId = series ? series.seriesId : '';
  if (series?.seriesName) out.seriesName = series.seriesName;
  return out;
}

async function fetchAuthorFacts(author) {
  const out = {};
  if (!author) return out;

  // An admin override beats Wikidata: it exists precisely because Wikidata got
  // one wrong.
  const key = author.toLowerCase().trim();
  const override = (await overrides())[key];
  if (override) out.country = override;

  const search = await fetch(`${WIKIDATA}?action=wbsearchentities&search=${encodeURIComponent(author)}&language=en&type=item&format=json&origin=*&limit=1`);
  if (!search.ok) return out;
  const qid = (await search.json()).search?.[0]?.id;
  if (!qid) return out;

  const entity = await fetch(`${WIKIDATA}?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`);
  if (!entity.ok) return out;
  const claims = (await entity.json()).entities?.[qid]?.claims || {};

  if (!out.country) {
    const countryQid = bestClaim(claims.P27 || [])?.mainsnak?.datavalue?.value?.id;
    if (countryQid) {
      const labels = await fetch(`${WIKIDATA}?action=wbgetentities&ids=${countryQid}&props=labels&languages=en&format=json&origin=*`);
      if (labels.ok) {
        const name = (await labels.json()).entities?.[countryQid]?.labels?.en?.value;
        if (name) out.country = normalizeCountry(name, await getCountryRemaps());
      }
    }
  }

  const genderQid = bestClaim(claims.P21 || [])?.mainsnak?.datavalue?.value?.id;
  if (genderQid && GENDER_MAP[genderQid]) out.authorGender = GENDER_MAP[genderQid];
  return out;
}

// Returns whatever could be found — `{ genres?, country?, authorGender?, seriesId?, seriesName? }`.
// Start it as soon as a book is chosen and await it when saving, so the lookups
// overlap with the reader deciding rather than delaying the write.
export async function fetchBookMeta(slug, author) {
  const [fields, facts] = await Promise.all([
    fetchBookFields(slug).catch(() => ({})),
    fetchAuthorFacts(author).catch(() => ({})),
  ]);
  return { ...facts, ...fields };
}

// Waits for an in-flight fetchBookMeta, giving up after `ms` so a slow or dead
// third party cannot block someone adding a book.
export async function awaitMeta(promise, ms = 5000) {
  if (!promise) return {};
  return await Promise.race([
    promise.catch(() => ({})),
    new Promise(resolve => setTimeout(() => resolve({}), ms)),
  ]);
}
