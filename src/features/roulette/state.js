'use strict';

const { rouletteGames } = require('../../data/stores');
const { lobbySuffix } = require('./ids');

function createGame(guildId, gameId, channelId, maxPlayers) {
  const suffix = lobbySuffix(guildId, gameId);
  const game = {
    id: gameId,
    guildId,
    channelId,
    suffix,
    maxPlayers,
    phase: 'lobby',
    players: [],
    takenSlots: new Set(),
    collectors: [],
    refreshTimer: null,
    busy: false,
    messages: { main: null, extra: null },
  };
  rouletteGames.set(guildId, game);
  return game;
}

function getGame(guildId) {
  return rouletteGames.get(guildId);
}

function trackCollector(game, collector) {
  game.collectors.push(collector);
  collector.once('end', () => {
    const i = game.collectors.indexOf(collector);
    if (i !== -1) game.collectors.splice(i, 1);
  });
  return collector;
}

function stopGame(guildId) {
  const game = rouletteGames.get(guildId);
  if (!game) return false;
  game.phase = 'stopped';
  if (game.refreshTimer) {
    clearTimeout(game.refreshTimer);
    game.refreshTimer = null;
  }
  for (const c of game.collectors) {
    try { c.stop('stopped'); } catch { /* already ended */ }
  }
  game.collectors = [];
  rouletteGames.delete(guildId);
  return true;
}

function isActive(game) {
  return game && game.phase !== 'stopped';
}

module.exports = {
  createGame,
  getGame,
  trackCollector,
  stopGame,
  isActive,
};
