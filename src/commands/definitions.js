'use strict';

const { SlashCommandBuilder } = require('discord.js');
const ROULETTE_CFG = require('../config/roulette');

const commands = [
  new SlashCommandBuilder()
    .setName('timeout').setDescription('Timeout a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration').setRequired(true)
      .addChoices(
        { name: '1 minute',   value: '1m'  }, { name: '5 minutes',  value: '5m'  },
        { name: '10 minutes', value: '10m' }, { name: '30 minutes', value: '30m' },
        { name: '1 hour',     value: '1h'  }, { name: '1 day',      value: '1d'  },
        { name: '1 week',     value: '1w'  },
      ))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('ban').setDescription('Ban a user from the server')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('kick').setDescription('Kick a user from the server')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('warn').setDescription('Issue a formal warning to a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('purge').setDescription('Bulk delete messages')
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user')),

  new SlashCommandBuilder()
    .setName('imprison').setDescription('Restrict a user to the prison channel')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('release').setDescription('Release a user from prison')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),

  new SlashCommandBuilder()
    .setName('reaction-role').setDescription('Create a reaction role on a message')
    .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
    .addStringOption(o => o.setName('message-id').setDescription('Message ID').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)),

  new SlashCommandBuilder()
    .setName('reaction-roles-list').setDescription('List all active reaction roles'),

  new SlashCommandBuilder()
    .setName('user').setDescription('Show detailed info about a user')
    .addUserOption(o => o.setName('target').setDescription('User (defaults to yourself)')),

  new SlashCommandBuilder()
    .setName('server').setDescription('Show detailed info about this server'),

  new SlashCommandBuilder()
    .setName('avatar').setDescription("Get a user's avatar")
    .addUserOption(o => o.setName('target').setDescription('User (defaults to yourself)')),

  new SlashCommandBuilder()
    .setName('banner').setDescription("Get a user's profile banner")
    .addUserOption(o => o.setName('target').setDescription('User (defaults to yourself)')),

  new SlashCommandBuilder()
    .setName('ping').setDescription('Check bot latency'),

  new SlashCommandBuilder()
    .setName('8ball').setDescription('Ask the magic 8-ball a question')
    .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true).setMaxLength(256)),

  new SlashCommandBuilder()
    .setName('coinflip').setDescription('Flip a coin'),

  new SlashCommandBuilder()
    .setName('dice').setDescription('Roll dice')
    .addIntegerOption(o => o.setName('sides').setDescription('Number of sides (default 6)').setMinValue(2).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName('poll').setDescription('Create a quick yes/no poll')
    .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true).setMaxLength(256)),

  new SlashCommandBuilder()
    .setName('help').setDescription('Show all commands'),

  new SlashCommandBuilder()
    .setName('points').setDescription('Roulette win points')
    .addSubcommand(s => s
      .setName('show').setDescription('View win points for yourself or another user')
      .addUserOption(o => o.setName('user').setDescription('User (defaults to you)')))
    .addSubcommand(s => s
      .setName('leaderboard').setDescription('Top win points in this server'))
    .addSubcommand(s => s
      .setName('add').setDescription('Add points to a user (Administrator)')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Points to add (default 1)').setMinValue(1)))
    .addSubcommand(s => s
      .setName('remove').setDescription('Remove points from a user (Administrator)')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Points to remove (default 1)').setMinValue(1)))
    .addSubcommand(s => s
      .setName('give').setDescription('Transfer your points to another user')
      .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Points to send (default 1)').setMinValue(1)))
    .addSubcommand(s => s
      .setName('transfer').setDescription('Transfer points between two users (Administrator)')
      .addUserOption(o => o.setName('from').setDescription('Sender').setRequired(true))
      .addUserOption(o => o.setName('to').setDescription('Recipient').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Points to move (default 1)').setMinValue(1))),

  ...ROULETTE_CFG.rouletteNames.map(name =>
    new SlashCommandBuilder()
      .setName(name).setDescription('بدا فعالية لعبة روليت').setDMPermission(false),
  ),
  ...ROULETTE_CFG.stopNames.map(name =>
    new SlashCommandBuilder()
      .setName(name).setDescription('إيقاف فعالية لعبة روليت').setDMPermission(false),
  ),
].map(c => c.toJSON());

module.exports = { commands };
