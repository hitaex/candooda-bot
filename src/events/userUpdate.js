'use strict';

const { Events, AuditLogEvent } = require('discord.js');
const { SUCCESS, DANGER, WARN, INFO, DARK, CH_TYPE } = require('../config/constants');
const { embed } = require('../utils/embed');
const { ts, tsRel, fmtDuration } = require('../utils/time');
const { sendLog } = require('../utils/logger');
const { getAuditExecutor } = require('../utils/audit');
const { reactionRoles } = require('../data/stores');

function register(client) {
  client.on(Events.UserUpdate, async (oldUser, newUser) => {
  // Compare raw avatar hashes, not URLs (which can differ by format/size)
  if (oldUser.avatar === newUser.avatar) return;

  for (const guild of client.guilds.cache.values()) {
    if (!guild.members.cache.has(newUser.id)) continue;
    await sendLog(guild, embed(INFO)
      .setTitle('🖼️ Avatar Changed')
      .addFields({ name: 'User', value: `${newUser.tag} (\`${newUser.id}\`)` })
      .setThumbnail(oldUser.displayAvatarURL({ size: 256 }))
      .setImage(newUser.displayAvatarURL({ size: 256 }))
      .setFooter({ text: 'Thumbnail = old  ·  Image below = new' })
    );
    break;
  }
});
}

module.exports = { register };
