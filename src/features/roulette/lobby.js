'use strict';

const { embed } = require('../../utils/embed');
const ROULETTE_CFG = require('../../config/roulette');
const { buildLobbyRows, disableAllRows } = require('./components');
const { isActive } = require('./state');

const LOBBY_COLOR = 0xE4F000;
const CLOSED_COLOR = 0x0FF000;

const HOW_TO_PLAY = {
  name: '__طريقة اللاعب:__',
  value: '**1-** انضم في اللعبة\n**2-** ستبدأ الجولة الأولى وسيتم تدوير العجلة واختيار لاعب عشوائي\n**3-** إذا كنت اللاعب المختار ، فستختار لاعبًا من اختيارك ليتم طرده من اللعبة\n**4-** يُطرد اللاعب وتبدأ جولة جديدة ، عندما يُطرد جميع اللاعبين ويتبقى لاعبان فقط ، ستدور العجلة ويكون اللاعب المختار هو الفائز باللعبة',
};

function buildDescription(players) {
  if (!players.length) return '__**اللاعبين:**__\nلا يوجد لاعبين مشاركين باللعبة';
  return '__**اللاعبين:**__\n' + [...players]
    .sort((a, b) => a.number - b.number)
    .map(p => `\`${String(p.number + 1).padStart(2, '0')}\`: <@${p.id}>`)
    .join('\n');
}

function lobbyEmbed(players, startAt) {
  return embed(LOBBY_COLOR)
    .setTitle('روليت')
    .setDescription(buildDescription(players))
    .addFields(
      HOW_TO_PLAY,
      { name: '__ستبدأ اللعبة خلال__:', value: `**<t:${startAt}:R>**` },
    );
}

function scheduleLobbyRefresh(channel, game, startAt) {
  if (game.refreshTimer) clearTimeout(game.refreshTimer);
  game.refreshTimer = setTimeout(() => {
    game.refreshTimer = null;
    flushLobbyRefresh(channel, game, startAt).catch(err =>
      console.error('[Roulette] Lobby refresh failed:', err.message),
    );
  }, 200);
}

async function flushLobbyRefresh(channel, game, startAt) {
  if (!isActive(game) || game.phase !== 'lobby') return;
  const { main: mainId, extra: extraId } = game.messages;
  if (!mainId) return;

  const rows = buildLobbyRows(game.suffix, game);
  const payload = {
    embeds: [lobbyEmbed(game.players, startAt)],
    components: rows.first,
  };

  // BUG FIX #1: channel.messages.edit() does not exist on MessageManager.
  // Must fetch the message object first, then call .edit() on it.
  const tasks = [
    channel.messages.fetch(mainId).then(msg => msg.edit(payload)),
  ];
  if (extraId && rows.second.length) {
    tasks.push(
      channel.messages.fetch(extraId).then(msg => msg.edit({ components: rows.second })),
    );
  }
  await Promise.all(tasks);
}

async function closeLobby(channel, game) {
  const { main: mainId, extra: extraId } = game.messages;
  if (!mainId) return;

  try {
    const main = await channel.messages.fetch(mainId);
    const closedEmbed = embed(CLOSED_COLOR)
      .setTitle('روليت')
      .setDescription(main.embeds[0]?.description ?? buildDescription(game.players))
      .addFields(HOW_TO_PLAY);

    const extraEditPromise = extraId
      ? channel.messages.fetch(extraId)
        .then(extraMsg => {
          // BUG FIX #2: Guard against undefined components before passing to
          // disableAllRows — previously null?.components → undefined → passed
          // straight to .edit(), which throws in discord.js.
          const disabled = disableAllRows(extraMsg?.components);
          if (!disabled?.length) return Promise.resolve();
          return extraMsg.edit({ components: disabled });
        })
        .catch(() => {})
      : Promise.resolve();

    await Promise.all([
      main.edit({ embeds: [closedEmbed], components: disableAllRows(main.components) }),
      extraEditPromise,
    ]);
  } catch { /* deleted */ }
}

module.exports = {
  buildDescription,
  lobbyEmbed,
  scheduleLobbyRefresh,
  flushLobbyRefresh,
  closeLobby,
  HOW_TO_PLAY,
  LOBBY_COLOR,
};