'use strict';

const { PermissionFlagsBits } = require('discord.js');
const { BRAND, SUCCESS, WARN } = require('../../config/constants');
const { embed, err } = require('../../utils/embed');
const {
  getPoints, addPoints, removePoints, transferPoints, getLeaderboard,
} = require('../../data/winPoints');

function parseAmount(interaction) {
  return Math.max(1, interaction.options.getInteger('amount') ?? 1);
}

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

async function handlePointsCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const { guild, member } = interaction;
  const guildId = guild.id;
  const amount = parseAmount(interaction);

  if (sub === 'show') {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const pts = getPoints(guildId, target.id);
    return interaction.reply({
      embeds: [embed(BRAND)
        .setTitle('🏆 Win Points')
        .setDescription(`${target.id === interaction.user.id ? 'You have' : `${target} has`} **${pts}** point${pts === 1 ? '' : 's'}.`)],
    });
  }

  if (sub === 'leaderboard') {
    const rows = getLeaderboard(guildId, 15);
    if (!rows.length) {
      return interaction.reply({
        embeds: [embed(WARN).setTitle('🏆 Win Points').setDescription('No points recorded yet.')],
      });
    }
    const lines = rows.map((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
      return `${medal} <@${r.userId}> — **${r.points}**`;
    });
    return interaction.reply({
      embeds: [embed(BRAND).setTitle('🏆 Win Points Leaderboard').setDescription(lines.join('\n'))],
    });
  }

  if (sub === 'add') {
    if (!isAdmin(member)) return err(interaction, 'You need **Administrator** permission.');
    const user = interaction.options.getUser('user', true);
    const balance = addPoints(guildId, user.id, amount);
    return interaction.reply({
      embeds: [embed(SUCCESS)
        .setTitle('✅ Points added')
        .setDescription(`Added **${amount}** to ${user} — balance: **${balance}**`)],
    });
  }

  if (sub === 'remove') {
    if (!isAdmin(member)) return err(interaction, 'You need **Administrator** permission.');
    const user = interaction.options.getUser('user', true);
    const result = removePoints(guildId, user.id, amount);
    if (!result.ok) {
      return err(interaction, `${user} only has **${result.balance}** point(s).`);
    }
    return interaction.reply({
      embeds: [embed(SUCCESS)
        .setTitle('✅ Points removed')
        .setDescription(`Removed **${amount}** from ${user} — balance: **${result.balance}**`)],
    });
  }

  if (sub === 'give') {
    const to = interaction.options.getUser('user', true);
    if (to.id === interaction.user.id) {
      return err(interaction, 'You cannot give points to yourself. Use `/points transfer` (admin) instead.');
    }
    const result = transferPoints(guildId, interaction.user.id, to.id, amount);
    if (!result.ok) {
      if (result.error === 'insufficient') {
        return err(interaction, `You only have **${result.balance}** point(s).`);
      }
      return err(interaction, 'Could not transfer points.');
    }
    return interaction.reply({
      embeds: [embed(SUCCESS)
        .setTitle('✅ Points sent')
        .setDescription(
          `You gave **${amount}** point(s) to ${to}.\nYour balance: **${result.fromBalance}** · Their balance: **${result.toBalance}**`,
        )],
    });
  }

  if (sub === 'transfer') {
    if (!isAdmin(member)) return err(interaction, 'You need **Administrator** permission.');
    const from = interaction.options.getUser('from', true);
    const to = interaction.options.getUser('to', true);
    const result = transferPoints(guildId, from.id, to.id, amount);
    if (!result.ok) {
      if (result.error === 'same_user') {
        return err(interaction, 'Cannot transfer to the same user.');
      }
      if (result.error === 'insufficient') {
        return err(interaction, `${from} only has **${result.balance}** point(s).`);
      }
      return err(interaction, 'Could not transfer points.');
    }
    return interaction.reply({
      embeds: [embed(SUCCESS)
        .setTitle('✅ Points transferred')
        .setDescription(
          `Moved **${amount}** from ${from} to ${to}.\n${from}: **${result.fromBalance}** · ${to}: **${result.toBalance}**`,
        )],
    });
  }

  return false;
}

module.exports = { handlePointsCommand };
