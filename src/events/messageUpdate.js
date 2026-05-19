'use strict';

const { Events, AuditLogEvent } = require('discord.js');
const { SUCCESS, DANGER, WARN, INFO, DARK, CH_TYPE } = require('../config/constants');
const { embed } = require('../utils/embed');
const { ts, tsRel, fmtDuration } = require('../utils/time');
const { sendLog } = require('../utils/logger');
const { getAuditExecutor } = require('../utils/audit');
const { reactionRoles } = require('../data/stores');

function register(client) {
  client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (!newMsg.guild) return;
  if (newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  if (newMsg.channelId === process.env.LOG_CHANNEL_ID) return;

  const msgLink = `https://discord.com/channels/${newMsg.guildId}/${newMsg.channelId}/${newMsg.id}`;

  await sendLog(newMsg.guild, embed(INFO)
    .setTitle('✏️ Message Edited')
    .setThumbnail(newMsg.author?.displayAvatarURL({ size: 128 }) ?? null)
    .addFields(
      { name: 'Author',    value: `${newMsg.author} (\`${newMsg.author?.tag}\`)`, inline: true },
      { name: 'Channel',   value: `${newMsg.channel}`,                            inline: true },
      { name: 'Jump',      value: `[View message](${msgLink})`,                   inline: true },
      { name: '📝 Before', value: (oldMsg.content?.slice(0, 1024)) || '*not cached*' },
      { name: '📝 After',  value: newMsg.content?.slice(0, 1024) || '*empty*' },
    )
  );
});
}

module.exports = { register };
