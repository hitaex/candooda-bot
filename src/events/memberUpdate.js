'use strict';

const { Events, AuditLogEvent } = require('discord.js');
const { SUCCESS, DANGER, WARN, INFO, DARK, CH_TYPE } = require('../config/constants');
const { embed } = require('../utils/embed');
const { ts, tsRel, fmtDuration } = require('../utils/time');
const { sendLog } = require('../utils/logger');
const { getAuditExecutor } = require('../utils/audit');
const { reactionRoles } = require('../data/stores');

function register(client) {
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (!newMember.user || !oldMember.user) return;

  const nickChanged  = oldMember.nickname !== newMember.nickname;
  const addedRoles   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

  if (nickChanged) {
    const executor = await getAuditExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
    await sendLog(newMember.guild, embed(INFO)
      .setTitle('✏️ Nickname Changed')
      .setThumbnail(newMember.user.displayAvatarURL())
      .addFields(
        { name: 'User',       value: `${newMember} (${newMember.user.tag})`, inline: true },
        { name: 'Changed by', value: executor ? `${executor}` : '*Self*',    inline: true },
        { name: '\u200b',     value: '\u200b',                               inline: true },
        { name: 'Before',     value: oldMember.nickname ?? '*None*',          inline: true },
        { name: 'After',      value: newMember.nickname ?? '*None*',          inline: true },
      )
    );
  }

  if (addedRoles.size || removedRoles.size) {
    const executor = await getAuditExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
    const e = embed(INFO)
      .setTitle('🏷️ Roles Updated')
      .setThumbnail(newMember.user.displayAvatarURL())
      .addFields(
        { name: 'User',       value: `${newMember} (${newMember.user.tag})`, inline: true },
        { name: 'Updated by', value: executor ? `${executor}` : '*Unknown*', inline: true },
      );
    if (addedRoles.size)   e.addFields({ name: '✅ Roles Added',   value: addedRoles.map(r => `${r}`).join(' ') });
    if (removedRoles.size) e.addFields({ name: '❌ Roles Removed', value: removedRoles.map(r => `${r}`).join(' ') });
    await sendLog(newMember.guild, e);
  }
});
}

module.exports = { register };
