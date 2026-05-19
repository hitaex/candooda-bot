'use strict';

const { Events, AuditLogEvent } = require('discord.js');
const { SUCCESS, DANGER, WARN, INFO, DARK, CH_TYPE } = require('../config/constants');
const { embed } = require('../utils/embed');
const { ts, tsRel, fmtDuration } = require('../utils/time');
const { sendLog } = require('../utils/logger');
const { getAuditExecutor } = require('../utils/audit');
const { reactionRoles } = require('../data/stores');

function register(client) {
  client.on(Events.MessageBulkDelete, async (messages, channel) => {
  if (!channel.guild) return;

  const executor = await getAuditExecutor(channel.guild, AuditLogEvent.MessageBulkDelete, channel.id);
  const lines    = messages.map(m =>
    `[${m.createdAt?.toUTCString() ?? '?'}] ${m.author?.tag ?? 'Unknown'}: ${m.content?.slice(0, 100) ?? '[no text]'}`
  ).join('\n');

  await sendLog(channel.guild, embed(DANGER)
    .setTitle('🗑️ Bulk Delete')
    .addFields(
      { name: 'Channel',    value: `${channel}`,                             inline: true },
      { name: 'Count',      value: `${messages.size} messages`,              inline: true },
      { name: 'Deleted by', value: executor ? `${executor}` : '*Unknown*',  inline: true },
      { name: 'Messages',   value: lines.slice(0, 1024) || '*none cached*' },
    )
  );
});
}

module.exports = { register };
