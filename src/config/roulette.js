'use strict';

module.exports = Object.freeze({
  rouletteNames: (process.env.ROULETTE_COMMANDS ?? 'roulette,روليت,ر')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  stopNames: (process.env.STOP_COMMANDS ?? 'stop,توقف')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  waitingTime: Math.max(10, parseInt(process.env.ROULETTE_WAITING_TIME ?? '45', 10) || 45),
  kickTime: Math.max(10, parseInt(process.env.ROULETTE_KICK_TIME ?? '20', 10) || 20),
  roundDelayMs: Math.max(0, parseInt(process.env.ROULETTE_ROUND_DELAY_MS ?? '800', 10) || 800),
  maxPlayers: Math.min(40, Math.max(3, parseInt(process.env.ROULETTE_MAX_PLAYERS ?? '40', 10) || 40)),
  minPlayers: Math.max(2, parseInt(process.env.ROULETTE_MIN_PLAYERS ?? '3', 10) || 3),
  prefix: (process.env.ROULETTE_PREFIX ?? process.env.BOT_PREFIX ?? '-').toLowerCase(),
});
