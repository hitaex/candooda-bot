'use strict';

/** Parse lobby / round button custom_ids (suffix may contain underscores). */
function parseLobbyId(customId) {
  if (customId.startsWith('join_random_')) {
    return { action: 'join', slot: 'random', suffix: customId.slice('join_random_'.length) };
  }
  if (customId.startsWith('leave_')) {
    return { action: 'leave', suffix: customId.slice('leave_'.length) };
  }
  const join = customId.match(/^join_(\d+)_(.+)$/);
  if (join) return { action: 'join', slot: join[1], suffix: join[2] };
  return null;
}

function parseKickId(customId) {
  if (customId.startsWith('withdraw_')) {
    return { action: 'withdraw', suffix: customId.slice('withdraw_'.length) };
  }
  const kick = customId.match(/^kick_(\d+)_(.+)$/);
  if (kick) return { action: 'kick', slot: Number(kick[1]), suffix: kick[2] };
  return null;
}

function lobbySuffix(guildId, gameId) {
  return `roulette_${guildId}_${gameId}`;
}

function kickSuffix(guildId, gameId) {
  return `groulette_${guildId}_${gameId}`;
}

module.exports = { parseLobbyId, parseKickId, lobbySuffix, kickSuffix };
