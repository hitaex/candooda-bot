'use strict';

const { Events } = require('discord.js');
const { SUCCESS } = require('../config/constants');
const { embed } = require('../utils/embed');
const { ts, tsRel } = require('../utils/time');
const { sendLog } = require('../utils/logger');
const { resolveUsedInvite } = require('../utils/invites');
const { sendWelcomeDM } = require('../features/welcome');

function register(client) {
  client.on(Events.GuildMemberAdd, async member => {
  await sendWelcomeDM(member);

  // FIX: use resolveUsedInvite (invite diffing) instead of listing all invites.
  // This correctly identifies which invite code the new member used.
  const inviteInfo = await resolveUsedInvite(member);
  const accountAge = Date.now() - member.user.createdTimestamp;
  const newAcct    = accountAge < 7 * 24 * 60 * 60 * 1000;

  const e = embed(SUCCESS)
    .setTitle('📥 Member Joined')
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'User',            value: `${member} (${member.user.tag})`,                                  inline: true },
      { name: 'User ID',         value: `\`${member.id}\``,                                                inline: true },
      { name: 'Bot?',            value: member.user.bot ? 'Yes 🤖' : 'No',                                 inline: true },
      { name: 'Account Created', value: `${ts(member.user.createdAt)}\n${tsRel(member.user.createdAt)}`,   inline: true },
      { name: 'Joined At',       value: `${ts(member.joinedAt ?? new Date())}`,                            inline: true },
      { name: 'Member Count',    value: `\`#${member.guild.memberCount}\``,                                inline: true },
    );

  if (newAcct)    e.addFields({ name: '⚠️ New Account',   value: 'Account is less than 7 days old!' });
  if (inviteInfo) e.addFields({ name: '📨 Joined via Invite', value: inviteInfo });

  // ── Auto-role on join ────────────────────────────────────────
  const joinRoleId = process.env.JOIN_ROLE_ID;
  if (joinRoleId && !member.user.bot) {
    try {
      // Resolve from cache first; fetch only if absent (avoids unnecessary API calls)
      const role = member.guild.roles.cache.get(joinRoleId)
        ?? await member.guild.roles.fetch(joinRoleId).catch(() => null);

      if (!role) {
        console.warn(`[AutoRole] JOIN_ROLE_ID ${joinRoleId} not found in guild ${member.guild.id}`);
      } else if (role.position >= member.guild.members.me.roles.highest.position) {
        // Role is at or above the bot's highest role — Discord will reject the assign
        console.warn(`[AutoRole] Cannot assign "${role.name}" — it is at or above my highest role`);
      } else {
        await member.roles.add(role, 'Auto-role on join');
        e.addFields({ name: '🎭 Role Assigned', value: `${role}`, inline: true });
        console.log(`[AutoRole] Assigned "${role.name}" to ${member.user.tag}`);
      }
    } catch (autoRoleErr) {
      console.error(`[AutoRole] Failed to assign role to ${member.user.tag}:`, autoRoleErr.message);
    }
  }

  await sendLog(member.guild, e);
});
}

module.exports = { register };
