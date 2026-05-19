'use strict';

const {
  createRouletteGifImage, shuffleArray, getRandomDarkHexCode,
} = require('roulette-image');
const ROULETTE_CFG = require('../../config/roulette');
const { replyEphemeral, safeDeferUpdate } = require('../../utils/interaction');
const { buildKickRows, disableAllRows } = require('./components');
const { kickSuffix } = require('./ids');
const { getGame, trackCollector, stopGame, isActive } = require('./state');
const { addPoints } = require('../../data/winPoints');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Run one roulette round: spin GIF, then kick phase or declare winner.
 */
async function startRoundRoulette(channel, guildId, gameId) {
  const game = getGame(guildId);
  if (!game || game.phase !== 'round') return;

  if (!game.players.length) {
    stopGame(guildId);
    return;
  }

  const players = shuffleArray([...game.players].sort((a, b) => a.number - b.number));
  const winner = players[players.length - 1];
  const isFinal = players.length <= 2;

  const spinMsg = await channel.send('🎡 **جاري تدوير العجلة...**').catch(() => null);

  let gif;
  try {
    gif = await createRouletteGifImage(players);
  } catch (e) {
    console.error('[Roulette] GIF failed:', e.message);
    if (spinMsg) await spinMsg.delete().catch(() => {});
    await channel.send(':x: | فشل إنشاء صورة الروليت — تم إيقاف اللعبة.');
    stopGame(guildId);
    return;
  }

  if (spinMsg) await spinMsg.delete().catch(() => {});

  if (!isActive(game)) return;

  await channel.send({
    content: `**${winner.number + 1}** - <@${winner.id}>${
      isFinal ? '\n👑 **هذه الجولة الأخيرة ! اللاعب المختار هو اللاعب الفائز في اللعبة.**' : ''
    }`,
    files: [{ attachment: gif, name: 'roulette.gif' }],
  });

  if (isFinal) {
    const balance = addPoints(guildId, winner.id, 1);
    await channel.send(
      `👑 - فاز <@${winner.id}> في اللعبة · **+1** نقطة (المجموع: **${balance}**)`,
    );
    stopGame(guildId);
    return;
  }

  if (!isActive(game)) return;

  const suffix = kickSuffix(guildId, gameId);
  const kickTime = ROULETTE_CFG.kickTime * 1000;

  const gameMsg = await channel.send({
    content: `<@${winner.id}> لديك **${ROULETTE_CFG.kickTime} ثانية** لإختيار لاعب لطرده`,
    components: buildKickRows(suffix, players, winner.id),
  });

  // FIX 1: Store the winner's chosen customId here instead of passing it as
  // the collector.stop() reason. With max:1, the collector auto-ends with
  // reason 'limit' the instant the filter accepts an interaction — our
  // collector.stop(customId) inside 'collect' fires AFTER 'end' has already
  // run, so the end handler always saw reason='limit', never the customId.
  // Storing it in a closure variable and reading it in 'end' is the fix.
  let chosenCustomId = null;

  // FIX 2: The user check MUST be in the filter, not just in 'collect'.
  // With max:1, any interaction the filter accepts consumes the one slot and
  // ends the collector immediately. If the filter only checked the suffix (not
  // the user), a wrong-user click would pass the filter, fire 'collect', hit
  // the ephemeral branch — and simultaneously end the collector — so the round
  // would die with no kick happening. Rejecting wrong-user clicks in the
  // filter means they never consume the max:1 budget.
  const collector = trackCollector(game, gameMsg.createMessageComponentCollector({
    time: kickTime,
    max: 1,
    filter: async i => {
      if (!i.customId.endsWith(suffix)) return false;
      if (i.user.id !== winner.id) {
        await replyEphemeral(i, ':x: | فقط الشخص الذي لديه الدور يمكنه الاختيار').catch(() => {});
        return false;
      }
      return true;
    },
  }));

  collector.on('collect', async i => {
    // Record the choice BEFORE any await so it's always set when 'end' runs.
    chosenCustomId = i.customId;
    await safeDeferUpdate(i);
    // max:1 ends the collector automatically after this event; no manual stop needed.
    if (!isActive(game)) collector.stop('stopped');
  });

  collector.on('end', async (_collected, reason) => {
    const fresh = await channel.messages.fetch(gameMsg.id).catch(() => null);
    if (fresh?.components?.length) {
      await fresh.edit({ components: disableAllRows(fresh.components) }).catch(() => {});
    }

    if (reason === 'stopped' || !isActive(game)) {
      if (!isActive(game)) {
        await channel.send(':x: | تم إيقاف الجولة بواسطة المسؤولين').catch(() => {});
      }
      return;
    }

    const removeByNumber = num => {
      game.players = game.players.filter(p => p.number !== num);
    };
    const removeById = id => {
      game.players = game.players.filter(p => p.id !== id);
    };

    let removed = false;

    // FIX 3: Use chosenCustomId (captured in 'collect') instead of reason.
    // When a button is clicked with max:1, reason is always 'limit' (Discord.js
    // auto-stop) — never the customId. Timer expiry still comes in as 'time'.
    if (chosenCustomId) {
      if (!isActive(game)) return;

      if (chosenCustomId.startsWith('kick_')) {
        const num = Number(chosenCustomId.split('_')[1]);
        const target = game.players.find(p => p.number === num);
        if (target) {
          removeByNumber(num);
          await channel.send(`💣 | تم طرد <@${target.id}> من اللعبة`);
          removed = true;
        }
      } else if (chosenCustomId.startsWith('withdraw_')) {
        removeById(winner.id);
        await channel.send(`💣 | لقد انسحب <@${winner.id}> من اللعبة`);
        removed = true;
      }
    } else if (reason === 'time') {
      // Timer ran out with no selection — auto-kick the winner.
      if (!isActive(game)) return;
      removeById(winner.id);
      await channel.send(`💣 | تم طرد <@${winner.id}> من اللعبة لعدم تفاعله`);
      removed = true;
    }

    if (!isActive(game)) return;

    if (!removed || game.players.length < 2) {
      if (game.players.length < 2) {
        await channel.send('🚫 | لا يوجد عدد كافٍ من اللاعبين — تم إنهاء اللعبة.');
        stopGame(guildId);
      }
      return;
    }

    if (ROULETTE_CFG.roundDelayMs > 0) await sleep(ROULETTE_CFG.roundDelayMs);

    if (!isActive(game)) return;
    await startRoundRoulette(channel, guildId, gameId);
  });
}

module.exports = {
  startRoundRoulette,
  getRandomDarkHexCode,
};