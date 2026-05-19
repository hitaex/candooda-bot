'use strict';

const { Events, AuditLogEvent } = require('discord.js');
const { SUCCESS, DANGER, INFO, CH_TYPE } = require('../config/constants');
const { embed } = require('../utils/embed');
const { sendLog } = require('../utils/logger');
const { getAuditExecutor } = require('../utils/audit');

function register(client) {
  client.on(Events.ChannelCreate, async channel => {
  if (!channel.guild) return;
  const executor = await getAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);

  await sendLog(channel.guild, embed(SUCCESS)
    .setTitle('📢 Channel Created')
    .addFields(
      { name: 'Name',       value: `${channel}`,                                    inline: true },
      { name: 'Type',       value: CH_TYPE[channel.type] ?? `Type ${channel.type}`, inline: true },
      { name: 'Created by', value: executor ? `${executor}` : '*Unknown*',          inline: true },
      { name: 'Channel ID', value: `\`${channel.id}\``,                             inline: true },
      { name: 'Category',   value: channel.parent?.name ?? 'None',                  inline: true },
      { name: 'NSFW',       value: channel.nsfw ? 'Yes ⚠️' : 'No',                 inline: true },
    )
  );
});

// ─────────────────────────────────────────────────────────────────
//  CHANNEL DELETED
// ─────────────────────────────────────────────────────────────────
  client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;
  const executor = await getAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);

  await sendLog(channel.guild, embed(DANGER)
    .setTitle('🗑️ Channel Deleted')
    .addFields(
      { name: 'Name',       value: `#${channel.name}`,                               inline: true },
      { name: 'Type',       value: CH_TYPE[channel.type] ?? `Type ${channel.type}`,  inline: true },
      { name: 'Deleted by', value: executor ? `${executor}` : '*Unknown*',           inline: true },
      { name: 'Channel ID', value: `\`${channel.id}\``,                              inline: true },
      { name: 'Category',   value: channel.parent?.name ?? 'None',                   inline: true },
      { name: 'Topic',      value: channel.topic ?? 'None',                           inline: false },
    )
  );
});

// ─────────────────────────────────────────────────────────────────
//  CHANNEL UPDATED
// ─────────────────────────────────────────────────────────────────
  client.on(Events.ChannelUpdate, async (oldCh, newCh) => {
  if (!newCh.guild) return;

  const changes = [];
  if (oldCh.name             !== newCh.name)             changes.push({ name: 'Name',     before: oldCh.name,                         after: newCh.name });
  if (oldCh.topic            !== newCh.topic)            changes.push({ name: 'Topic',    before: oldCh.topic || '*none*',             after: newCh.topic || '*none*' });
  if (oldCh.nsfw             !== newCh.nsfw)             changes.push({ name: 'NSFW',     before: String(oldCh.nsfw),                  after: String(newCh.nsfw) });
  if (oldCh.rateLimitPerUser !== newCh.rateLimitPerUser) changes.push({ name: 'Slowmode', before: `${oldCh.rateLimitPerUser}s`,        after: `${newCh.rateLimitPerUser}s` });
  if (!changes.length) return;

  const executor = await getAuditExecutor(newCh.guild, AuditLogEvent.ChannelUpdate, newCh.id);

  const e = embed(INFO)
    .setTitle('🔧 Channel Updated')
    .addFields(
      { name: 'Channel',    value: `${newCh}`,                              inline: true },
      { name: 'Updated by', value: executor ? `${executor}` : '*Unknown*', inline: true },
      { name: 'Channel ID', value: `\`${newCh.id}\``,                      inline: true },
    );

  for (const c of changes) {
    e.addFields(
      { name: `${c.name} — Before`, value: String(c.before).slice(0, 512), inline: true },
      { name: `${c.name} — After`,  value: String(c.after).slice(0, 512),  inline: true },
      { name: '\u200b',             value: '\u200b',                        inline: true },
    );
  }

  await sendLog(newCh.guild, e);
});
}

module.exports = { register };

