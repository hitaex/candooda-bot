'use strict';

const { inviteCache } = require('../data/stores');

async function snapshotInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(invites.map(i => [i.code, i.uses])));
  } catch { /* missing MANAGE_GUILD permission */ }
}

async function resolveUsedInvite(member) {
  const before = inviteCache.get(member.guild.id);
  try {
    const after = await member.guild.invites.fetch();
    inviteCache.set(member.guild.id, new Map(after.map(i => [i.code, i.uses])));
    if (!before) return null;
    for (const invite of after.values()) {
      const prevUses = before.get(invite.code) ?? 0;
      if (invite.uses > prevUses && invite.inviter) {
        return `\`${invite.code}\` by ${invite.inviter} (${invite.uses} uses)`;
      }
    }
  } catch { /* missing MANAGE_GUILD permission */ }
  return null;
}

module.exports = { snapshotInvites, resolveUsedInvite };
