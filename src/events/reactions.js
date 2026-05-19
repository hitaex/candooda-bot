'use strict';

const { Events } = require('discord.js');
const { reactionRoles } = require('../data/stores');
const { handleBoardReaction } = require('../features/hallOfFame');

async function handleReaction(reaction, user, add) {
  if (user.bot) return;
  if (reaction.partial) try { await reaction.fetch(); } catch { return; }

  const emoji = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name;

  const roleId = reactionRoles.get(`${reaction.message.id}:${emoji}`);
  if (!roleId) return;

  try {
    const m = await reaction.message.guild.members.fetch(user.id);
    if (add) await m.roles.add(roleId);
    else     await m.roles.remove(roleId);
  } catch (e) { console.error('[ReactionRole]', e.message); }
}

function register(client) {
  client.on(Events.MessageReactionAdd,    (r, u) => handleBoardReaction(r, u, true));
  client.on(Events.MessageReactionRemove, (r, u) => handleBoardReaction(r, u, false));
  client.on(Events.MessageReactionAdd,    (r, u) => handleReaction(r, u, true));
  client.on(Events.MessageReactionRemove, (r, u) => handleReaction(r, u, false));
}

module.exports = { register };
