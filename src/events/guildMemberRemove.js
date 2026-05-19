'use strict';

const { Events, AuditLogEvent } = require('discord.js');
const { DANGER } = require('../config/constants');
const { embed } = require('../utils/embed');
const { ts, tsRel, fmtDuration } = require('../utils/time');
const { sendLog } = require('../utils/logger');
const { getAuditExecutor } = require('../utils/audit');

function register(client) {
  client.on(Events.GuildMemberRemove, async member => {
  if (!member.user) return;

  const roles    = member.roles.cache
    .filter(r => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map(r => `${r}`)
    .slice(0, 15)
    .join(' ') || 'None';
  const executor = await getAuditExecutor(member.guild, AuditLogEvent.MemberKick, member.id);

  await sendLog(member.guild, embed(DANGER)
    .setTitle('📤 Member Left')
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'User',           value: `${member.user.tag}`,                                             inline: true },
      { name: 'User ID',        value: `\`${member.id}\``,                                               inline: true },
      { name: 'Kicked by',      value: executor ? `${executor}` : 'Left voluntarily',                    inline: true },
      { name: 'Joined',         value: member.joinedAt ? `${ts(member.joinedAt)}\n${tsRel(member.joinedAt)}` : 'Unknown', inline: true },
      { name: 'Was Member For', value: member.joinedAt ? fmtDuration(Date.now() - member.joinedTimestamp) : 'Unknown', inline: true },
      { name: `Roles [${member.roles.cache.size - 1}]`, value: roles },
    )
  );
});
}

module.exports = { register };
