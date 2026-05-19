'use strict';

const PREFIX_ONLY = (process.env.ROULETTE_PREFIX_ONLY ?? 'ر')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const rouletteNames = [...new Set(
  (process.env.ROULETTE_COMMANDS ?? 'roulette,روليت,ر')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    .concat(PREFIX_ONLY),
)];

/** Slash commands — excludes short prefix-only aliases like `ر` (avoids duplicate with `-ر`). */
const slashRouletteNames = rouletteNames.filter(n => !PREFIX_ONLY.includes(n));

function resolvePrefixCommand(content, prefix, names) {
  if (!content.startsWith(prefix)) return null;
  const rest = content.slice(prefix.length);
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (rest === name || rest.startsWith(`${name} `)) return name;
  }
  return null;
}

module.exports = Object.freeze({
  rouletteNames,
  slashRouletteNames,
  prefixOnlyNames: PREFIX_ONLY,
  resolvePrefixCommand,
  stopNames: (process.env.STOP_COMMANDS ?? 'stop,توقف')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  waitingTime: Math.max(10, parseInt(process.env.ROULETTE_WAITING_TIME ?? '45', 10) || 45),
  kickTime: Math.max(10, parseInt(process.env.ROULETTE_KICK_TIME ?? '20', 10) || 20),
  roundDelayMs: Math.max(0, parseInt(process.env.ROULETTE_ROUND_DELAY_MS ?? '800', 10) || 800),
  maxPlayers: Math.min(40, Math.max(3, parseInt(process.env.ROULETTE_MAX_PLAYERS ?? '40', 10) || 40)),
  minPlayers: Math.max(2, parseInt(process.env.ROULETTE_MIN_PLAYERS ?? '3', 10) || 3),
  prefix: (process.env.ROULETTE_PREFIX ?? process.env.BOT_PREFIX ?? '-').toLowerCase(),
});
