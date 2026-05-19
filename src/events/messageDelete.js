'use strict';

const { Events, AuditLogEvent } = require('discord.js');
const { SUCCESS, DANGER, WARN, INFO, DARK, CH_TYPE } = require('../config/constants');
const { embed } = require('../utils/embed');
const { ts, tsRel, fmtDuration } = require('../utils/time');
const { sendLog } = require('../utils/logger');
const { getAuditExecutor } = require('../utils/audit');
const { reactionRoles } = require('../data/stores');

function register(client) {
  client.on(Events.MessageDelete, async message => {
  for (const key of reactionRoles.keys()) {
    if (key.startsWith(`${message.id}:`)) reactionRoles.delete(key);
  }

  // ── Log message deletion ────────────────────────────────────
  if (!message.guild) return;
  if (message.author?.bot) return;
  if (message.channelId === process.env.LOG_CHANNEL_ID) return;

  // FIX: MESSAGE_DELETE audit log target is the channel, not the author.
  // Pass null as targetId so the lookup isn't filtered by author id.
  const executor = await getAuditExecutor(message.guild, AuditLogEvent.MessageDelete, null);

  const e = embed(DANGER)
    .setTitle('🗑️ Message Deleted')
    .setThumbnail(message.author?.displayAvatarURL({ size: 256 }) ?? null)
    .addFields(
      { name: 'Author',     value: message.author ? `${message.author} (\`${message.author.tag}\`)` : '*Unknown*', inline: true },
      { name: 'Channel',    value: `${message.channel}`,                                                           inline: true },
      { name: 'Deleted by', value: executor ? `${executor}` : '*Author or auto-mod*',                             inline: true },
      { name: 'Message ID', value: `\`${message.id}\``,                                                           inline: true },
      { name: 'Sent at',    value: message.createdAt ? ts(message.createdAt) : 'Unknown',                         inline: true },
    );

  const content = message.content?.trim();
  if (content) e.addFields({ name: '📝 Content', value: content.slice(0, 1024) });
  if (content?.length > 1024) e.addFields({ name: '📝 Content (cont.)', value: content.slice(1024, 2048) });

  if (message.attachments.size) {
    const files = message.attachments.map(a => `[${a.name}](${a.url})`).join('\n');
    e.addFields({ name: `📎 Attachments [${message.attachments.size}]`, value: files.slice(0, 1024) });
    const firstImg = message.attachments.find(a => a.contentType?.startsWith('image/'));
    if (firstImg) e.setImage(firstImg.url);
  }

  if (message.embeds.length) {
    const embedSummary = message.embeds.map((em, i) =>
      `${i + 1}. ${em.title ?? em.description?.slice(0, 60) ?? '*[no title]*'}`
    ).join('\n');
    e.addFields({ name: `🖼️ Had Embeds [${message.embeds.length}]`, value: embedSummary.slice(0, 512) });
  }

  if (message.stickers.size)
    e.addFields({ name: '🎨 Stickers', value: message.stickers.map(s => s.name).join(', ') });

  await sendLog(message.guild, e);
});
}

module.exports = { register };
