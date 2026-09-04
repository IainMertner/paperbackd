// Mirroring an announcement into Discord.
//
// The webhook is unforgiving: an embed title over 256 characters or a description
// over 4096 is a 400, and the post is lost with no sign of it on the site. So the
// trimming is the part worth pinning — it is the difference between a long
// announcement arriving shortened and not arriving at all.

import { describe, it, expect } from 'vitest';
import { buildAnnouncementPayload, trimTo, TITLE_MAX, BODY_MAX } from '../functions/discord-utils.js';

describe('trimTo', () => {
  it('leaves text that already fits', () => {
    expect(trimTo('Hello', 10)).toBe('Hello');
    expect(trimTo('exactly10!', 10)).toBe('exactly10!');
  });

  it('trims to the limit, ellipsis included', () => {
    const out = trimTo('a'.repeat(100), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith('…')).toBe(true);
  });

  it('does not leave a space stranded before the ellipsis', () => {
    expect(trimTo('one two three', 9)).toBe('one two…');
  });

  it('treats absent text as empty rather than "undefined"', () => {
    // Which would otherwise be posted to the channel verbatim.
    expect(trimTo(undefined, 10)).toBe('');
    expect(trimTo(null, 10)).toBe('');
    expect(trimTo('   ', 10)).toBe('');
  });
});

describe('buildAnnouncementPayload', () => {
  it('builds an embed from a title and body', () => {
    const out = buildAnnouncementPayload({ title: 'New feature', body: 'Lists can be reordered.' });
    expect(out.embeds).toHaveLength(1);
    expect(out.embeds[0].title).toBe('New feature');
    expect(out.embeds[0].description).toBe('Lists can be reordered.');
  });

  it('suppresses every mention', () => {
    // A webhook will ping a whole server on the strength of an @everyone typed
    // into an announcement body. That is a mistake, not an instruction.
    const out = buildAnnouncementPayload({ title: 'Hi @everyone', body: '@here too, and <@1234>' });
    expect(out.allowed_mentions).toEqual({ parse: [] });
  });

  it('keeps the announcement within Discord\'s limits', () => {
    const out = buildAnnouncementPayload({ title: 'x'.repeat(1000), body: 'y'.repeat(10000) });
    expect(out.embeds[0].title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(out.embeds[0].description.length).toBeLessThanOrEqual(BODY_MAX);
  });

  it('omits a field rather than sending it empty', () => {
    // Discord rejects an embed with an empty title string.
    const noTitle = buildAnnouncementPayload({ body: 'Body only' });
    expect(noTitle.embeds[0].title).toBeUndefined();
    expect(noTitle.embeds[0].description).toBe('Body only');

    const noBody = buildAnnouncementPayload({ title: 'Title only' });
    expect(noBody.embeds[0].description).toBeUndefined();
    expect(noBody.embeds[0].title).toBe('Title only');
  });

  it('returns null when there is nothing to say', () => {
    // The caller skips the post entirely rather than sending an empty embed.
    expect(buildAnnouncementPayload({})).toBe(null);
    expect(buildAnnouncementPayload({ title: '', body: '   ' })).toBe(null);
    expect(buildAnnouncementPayload({ title: null, body: undefined })).toBe(null);
  });

  it('links the embed back to the announcements page when given a url', () => {
    const out = buildAnnouncementPayload({ title: 'T' }, { url: 'https://paperbackd.ink/announcements/' });
    expect(out.embeds[0].url).toBe('https://paperbackd.ink/announcements/');
  });

  it('omits the url when there is none, rather than sending an empty string', () => {
    // Discord rejects url: '' as a malformed URL.
    expect(buildAnnouncementPayload({ title: 'T' }).embeds[0].url).toBeUndefined();
    expect(buildAnnouncementPayload({ title: 'T' }, { url: '' }).embeds[0].url).toBeUndefined();
  });

  it('carries the site accent colour', () => {
    expect(buildAnnouncementPayload({ title: 'T' }).embeds[0].color).toBe(0x6B7B3A);
  });

  it('produces something JSON.stringify can send', () => {
    const out = buildAnnouncementPayload({ title: 'T', body: 'B' });
    expect(() => JSON.stringify(out)).not.toThrow();
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});
