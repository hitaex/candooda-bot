'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const BTN_STYLE = {
  2: ButtonStyle.Secondary,
  3: ButtonStyle.Success,
  4: ButtonStyle.Danger,
};

function getMultipleButtons(defs) {
  const rows = [];
  for (let i = 0; i < defs.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      defs.slice(i, i + 5).map(d => {
        const b = new ButtonBuilder()
          .setCustomId(d.custom_id)
          .setLabel(d.label.slice(0, 80))
          .setStyle(BTN_STYLE[d.style] ?? ButtonStyle.Secondary);
        if (d.disabled) b.setDisabled(true);
        return b;
      }),
    ));
  }
  return rows;
}

function disableAllRows(components) {
  if (!components?.length) return components;
  return components.map(row => {
    const next = ActionRowBuilder.from(row);
    next.components = next.components.map(btn => ButtonBuilder.from(btn).setDisabled(true));
    return next;
  });
}

/** Build join grid from authoritative game state (avoids stale partial edits). */
function buildLobbyRows(suffix, game, { includeLeave = true } = {}) {
  const defs = [];
  const max = game.maxPlayers;

  for (let slot = 0; slot < max; slot++) {
    const p = game.players.find(pl => pl.number === slot);
    defs.push({
      style: 2,
      label: p ? `${slot + 1}. ${p.username}` : String(slot + 1),
      custom_id: `join_${slot}_${suffix}`,
      disabled: Boolean(p),
    });
  }

  if (includeLeave) {
    defs.push(
      { style: 3, label: 'دخول عشوائي', custom_id: `join_random_${suffix}` },
      { style: 4, label: 'اخرج من اللعبة', custom_id: `leave_${suffix}` },
    );
  }

  const splitAt = Math.min(25, defs.length);
  return {
    first: getMultipleButtons(defs.slice(0, splitAt)),
    second: defs.length > splitAt ? getMultipleButtons(defs.slice(splitAt)) : [],
  };
}

function buildKickRows(suffix, players, winnerId) {
  const defs = players
    .filter(p => p.id !== winnerId)
    .slice(0, 24)
    .map(p => ({
      style: 2,
      label: `${p.number + 1}. ${p.username}`,
      custom_id: `kick_${p.number}_${suffix}`,
    }));

  defs.push({ style: 4, label: 'انسحاب', custom_id: `withdraw_${suffix}` });
  return getMultipleButtons(defs);
}

module.exports = {
  getMultipleButtons,
  disableAllRows,
  buildLobbyRows,
  buildKickRows,
};
