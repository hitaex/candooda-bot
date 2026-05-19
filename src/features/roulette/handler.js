'use strict';

const { PermissionFlagsBits } = require('discord.js');
const ROULETTE_CFG = require('../../config/roulette');
const { err } = require('../../utils/embed');
const { replyEphemeral, safeDeferUpdate } = require('../../utils/interaction');
const { parseLobbyId } = require('./ids');
const { buildLobbyRows } = require('./components');
const {
  lobbyEmbed, scheduleLobbyRefresh, closeLobby,
} = require('./lobby');
const {
  createGame, getGame, trackCollector, stopGame, isActive,
} = require('./state');
const { startRoundRoulette, getRandomDarkHexCode } = require('./functions');
const { sendDM } = require('./dm');

/** Prevents two lobbies from racing when the same prefix command fires twice. */
const startingGuilds = new Set();
/** Same Discord message must not start roulette twice (duplicate events). */
const seenPrefixMessages = new Set();

function rouletteCanHost(member) {
  return member.permissions.has(PermissionFlagsBits.ManageEvents);
}

/** Pick a free slot without async work (must deferUpdate within 3s). */
function pickFreeSlot(game, maxPlayers) {
  const free = [];
  for (let s = 0; s < maxPlayers; s++) {
    if (!game.takenSlots.has(s)) free.push(s);
  }
  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

async function handleRouletteSlash(interaction) {
  const cmd = interaction.commandName.toLowerCase();
  const { rouletteNames, stopNames, waitingTime, maxPlayers, minPlayers } = ROULETTE_CFG;
  const isStop = stopNames.includes(cmd);
  const isStart = rouletteNames.includes(cmd);
  if (!isStop && !isStart) return false;

  const { guild, member, channel } = interaction;
  const guildId = guild.id;

  // FIX: Defer the interaction immediately — before any other work — to
  // acknowledge it within Discord's 3-second window. Everything after this
  // point can take as long as it needs; we edit the deferred reply when ready.
  // Failure to defer in time causes DiscordAPIError[10062]: Unknown interaction.
  //
  // Use ephemeral=false for the start command (lobby is public).
  // For stop/error replies we send an ephemeral followUp after deferring.
  //
  // NOTE: The prefix shim below does not use deferReply — it replies directly
  // since message commands have no interaction token expiry.
  if (interaction.deferReply) {
    await interaction.deferReply();
  }

  if (isStop) {
    if (!rouletteCanHost(member)) {
      await interaction.editReply({ content: ':x: | فقط Manga Events يمكنهم قيام بهذا الامر' });
      return true;
    }
    if (!getGame(guildId)) {
      await interaction.editReply({ content: '❌ لا توجد لعبة قيد التشغيل في الوقت الحالي' });
      return true;
    }
    stopGame(guildId);
    await interaction.editReply({ content: `:x: | تم طلب أيقاف لعبة روليت من قبل <@${member.id}>` });
    return true;
  }

  if (!rouletteCanHost(member)) {
    await interaction.editReply({ content: ':x: | فقط Manga Events يمكنهم قيام بهذا الامر' });
    return true;
  }
  if (getGame(guildId)) {
    await interaction.editReply({ content: ':x: | يوجد جولة تعمل الان بالفعل' });
    return true;
  }
  if (startingGuilds.has(guildId)) {
    await interaction.editReply({ content: ':x: | جاري بدء اللعبة بالفعل، انتظر لحظة' });
    return true;
  }

  startingGuilds.add(guildId);
  let game;
  try {
    if (getGame(guildId)) {
      await interaction.editReply({ content: ':x: | يوجد جولة تعمل الان بالفعل' });
      return true;
    }

    const gameId = Date.now();
    const startAt = Math.floor((Date.now() + waitingTime * 1000) / 1000);
    game = createGame(guildId, gameId, channel.id, maxPlayers);
    const rows = buildLobbyRows(game.suffix, game);

    await interaction.editReply({
      embeds: [lobbyEmbed([], startAt)],
      components: rows.first,
    });
    const mainMsg = await interaction.fetchReply();
    game.messages.main = mainMsg.id;

    if (rows.second.length) {
      const extraMsg = await channel.send({
        content: '⬆️ أزرار إضافية للانضمام',
        components: rows.second,
      });
      game.messages.extra = extraMsg.id;
    }
  } finally {
    startingGuilds.delete(guildId);
  }

  const collector = trackCollector(game, channel.createMessageComponentCollector({
    time: waitingTime * 1000,
    filter: i => {
      if (!i.isButton()) return false;
      const parsed = parseLobbyId(i.customId);
      return parsed?.suffix === game.suffix;
    },
  }));

  collector.on('collect', async i => {
    if (game.phase !== 'lobby') return;

    const parsed = parseLobbyId(i.customId);
    if (!parsed) return;

    if (game.busy) {
      return replyEphemeral(i, '⏳ انتظر لحظة...');
    }

    if (parsed.action === 'leave') {
      const idx = game.players.findIndex(p => p.id === i.user.id);
      if (idx === -1) {
        return replyEphemeral(i, ':x: | انت غير مشارك بالفعل');
      }

      game.busy = true;
      if (!(await safeDeferUpdate(i))) {
        game.busy = false;
        return;
      }
      try {
        const removed = game.players[idx];
        game.players.splice(idx, 1);
        game.takenSlots.delete(removed.number);
      } finally {
        game.busy = false;
      }
      scheduleLobbyRefresh(channel, game, startAt);
      return replyEphemeral(i, '✅ | تم إزالتك من اللعبة');
    }

    if (game.players.length >= maxPlayers) {
      return replyEphemeral(i, 'عدد المشاركين مكتمل');
    }
    if (game.players.some(p => p.id === i.user.id)) {
      return replyEphemeral(i, 'انت مشارك بالفعل لكي تغير مكانك يجب عليك الخروج من الروليت ثم الدخول مرة اخري');
    }

    let slot;
    if (parsed.slot === 'random') {
      slot = pickFreeSlot(game, maxPlayers);
      if (slot === null) return replyEphemeral(i, 'لا توجد خانات فارغة');
    } else {
      slot = Number(parsed.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= maxPlayers) {
        return replyEphemeral(i, ':x: | رقم غير صالح');
      }
      if (game.takenSlots.has(slot)) {
        return replyEphemeral(i, ':x: | هذه الخانة محجوزة بالفعل');
      }
    }

    game.busy = true;
    if (!(await safeDeferUpdate(i))) {
      game.busy = false;
      return;
    }
    try {
      if (game.takenSlots.has(slot)) return;
      game.takenSlots.add(slot);
      game.players.push({
        username: i.user.username,
        id: i.user.id,
        avatarURL: i.user.displayAvatarURL({ extension: 'png', size: 512 }),
        number: slot,
        color: getRandomDarkHexCode(),
      });
    } finally {
      game.busy = false;
    }

    scheduleLobbyRefresh(channel, game, startAt);
  });

  collector.on('end', async () => {
    game.phase = 'closing';

    if (game.refreshTimer) {
      clearTimeout(game.refreshTimer);
      game.refreshTimer = null;
    }

    await closeLobby(channel, game);

    if (!isActive(game) || !getGame(guildId)) {
      if (!getGame(guildId)) {
        await channel.send(':x: | تم إيقاف الجولة بواسطة المسؤولين').catch(() => {});
      }
      return;
    }

    if (game.players.length < minPlayers) {
      stopGame(guildId);
      await channel.send(`🚫 | تم إلغاء اللعبة لعدم وجود ${minPlayers} لاعبين على الأقل`);
      return;
    }

    game.phase = 'round';
    await channel.send('✅ | تم توزيع الأرقام — تبدأ الجولة الآن!');
    await startRoundRoulette(channel, guildId, gameId);
  });

  return true;
}

async function handleRoulettePrefix(message, cmdName) {
  if (seenPrefixMessages.has(message.id)) return true;
  seenPrefixMessages.add(message.id);
  setTimeout(() => seenPrefixMessages.delete(message.id), 60_000);

  let replyMsg;
  const shim = {
    commandName: cmdName,
    guild: message.guild,
    member: message.member,
    user: message.author,
    channel: message.channel,
    guildId: message.guild.id,
    // Prefix commands have no interaction token — no deferReply needed.
    deferReply: null,
    async editReply(payload) {
      const body = typeof payload === 'string' ? { content: payload } : payload;
      if (replyMsg) {
        replyMsg = await replyMsg.edit(body).catch(() => replyMsg);
      } else {
        // channel.send (not message.reply) — one lobby message; avoids duplicate reply chains
        replyMsg = await message.channel.send(body).catch(() => null);
      }
      return replyMsg;
    },
    async reply(payload) {
      if (payload?.ephemeral) {
        await sendDM(message.member, typeof payload.content === 'string' ? payload.content : payload).catch(() => {});
        await message.react('❌').catch(() => {});
        return;
      }
      const body = typeof payload === 'string' ? { content: payload } : payload;
      replyMsg = await message.reply({ ...body, allowedMentions: { repliedUser: false } }).catch(() => null);
      return replyMsg;
    },
    async fetchReply() { return replyMsg; },
  };
  return handleRouletteSlash(shim);
}

module.exports = { handleRouletteSlash, handleRoulettePrefix };