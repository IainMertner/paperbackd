// Turning a paperbackd announcement into a Discord webhook payload.
//
// Kept apart from index.js so it can be unit-tested: index.js calls
// admin.initializeApp() at module load and cannot be imported by the test runner.

// Discord's own limits on an embed. Going over any of them is a 400 and the post
// is lost entirely, so text is trimmed to fit instead — losing the tail of a long
// announcement beats losing the whole thing.
const TITLE_MAX = 256;
const BODY_MAX  = 4096;

const ACCENT = 0x6B7B3A; // --accent, so the stripe matches the site

// Trimmed to `max` characters, with an ellipsis standing in for what was cut.
// Returns '' for anything absent, which the caller treats as "no such field".
function trimTo(text, max) {
  const s = String(text ?? '').replace(/\s+$/, '').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

// The JSON body for the webhook, or null when there is nothing worth posting.
//
// allowed_mentions is empty on purpose: an @everyone that finds its way into an
// announcement is a mistake, not an instruction, and a webhook will happily ping
// a whole server on the strength of one.
function buildAnnouncementPayload({ title, body }, { url } = {}) {
  const embedTitle = trimTo(title, TITLE_MAX);
  const embedBody  = trimTo(body,  BODY_MAX);
  if (!embedTitle && !embedBody) return null;

  const embed = { color: ACCENT };
  if (embedTitle) embed.title = embedTitle;
  if (embedBody)  embed.description = embedBody;
  if (url)        embed.url = url;

  return { embeds: [embed], allowed_mentions: { parse: [] } };
}

module.exports = { buildAnnouncementPayload, trimTo, TITLE_MAX, BODY_MAX };
