'use strict';

const { ChannelType } = require('discord.js');
const {
  HOF_THRESHOLD, HOS_THRESHOLD, HOF_LOCK_FLOOR, HOS_LOCK_FLOOR,
} = require('../config/constants');
const ROULETTE_CFG = require('../config/roulette');
const { commands } = require('../commands/register');
const { getBannedWords } = require('../data/automod');

const DJS_VERSION = require('discord.js').version;

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  pink:   '\x1b[38;2;232;158;184m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  gray:   '\x1b[90m',
  white:  '\x1b[97m',
};

function pad(str, len)  { return String(str).padEnd(len); }
function rpad(str, len) { return String(str).padStart(len); }

function printStartup(client) {
  const W = 62;
  const bannedWords = getBannedWords();

  const row = (label, value, labelColor = C.cyan, valColor = C.white) =>
    `${C.pink}│${C.reset} ${labelColor}${pad(label, 22)}${C.reset}${valColor}${pad(value, W - 23)}${C.reset} ${C.pink}│${C.reset}`;

  const sect = (title) => {
    const t    = `  ${title}  `;
    const pad1 = Math.floor((W - t.length) / 2);
    const pad2 = W - t.length - pad1;
    return `${C.pink}├${'─'.repeat(pad1)}${C.yellow}${C.bold}${t}${C.reset}${C.pink}${'─'.repeat(pad2)}┤${C.reset}`;
  };

  const blank = `${C.pink}│${C.reset}${' '.repeat(W + 2)}${C.pink}│${C.reset}`;

  const name     = '  🌸  C A N D O O D A   B O T  v2.0  🌸  ';
  const namepad1 = Math.floor((W - name.length) / 2);
  const namepad2 = W - name.length - namepad1;

  console.log('');
  console.log(`${C.pink}╔${'═'.repeat(W + 2)}╗${C.reset}`);
  console.log(`${C.pink}║${' '.repeat(namepad1)}${C.bold}${C.pink}${name}${C.reset}${' '.repeat(namepad2)}${C.pink}║${C.reset}`);
  console.log(`${C.pink}╚${'═'.repeat(W + 2)}╝${C.reset}`);
  console.log('');

  const bot    = client.user;
  const upSecs = Math.floor(process.uptime());

  console.log(`${C.pink}┌${'─'.repeat(W + 2)}┐${C.reset}`);
  console.log(row('Tag',         bot.tag));
  console.log(row('ID',          bot.id));
  console.log(row('Created',     bot.createdAt.toUTCString()));
  console.log(row('Node.js',     process.version));
  console.log(row('discord.js',  DJS_VERSION));
  console.log(row('Process PID', String(process.pid)));
  console.log(row('Uptime',      `${upSecs}s`));
  console.log(row('Memory',      `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`));

  console.log(sect('⚡ SLASH COMMANDS'));
  const cmdNames = commands.map(c => c.name);
  for (let i = 0; i < cmdNames.length; i += 4) {
    const chunk = cmdNames.slice(i, i + 4).map(n => `/${pad(n, 14)}`).join('  ');
    console.log(row('', `${C.green}${chunk}${C.reset}`));
  }
  console.log(row('Total', `${C.bold}${C.green}${cmdNames.length} commands${C.reset}`));

  console.log(sect('🏰 GUILDS & MEMBERS'));
  let totalMembers = 0, totalBots = 0, totalChannels = 0, totalRoles = 0;

  for (const guild of client.guilds.cache.values()) {
    const bots    = guild.members.cache.filter(m => m.user?.bot).size;
    const chCount = guild.channels.cache.size;
    totalMembers  += guild.memberCount;
    totalBots     += bots;
    totalChannels += chCount;
    totalRoles    += guild.roles.cache.size;

    console.log(row(
      guild.name.slice(0, 22),
      `${C.white}👥 ${rpad(guild.memberCount, 5)}  🤖 ${rpad(bots, 4)}  💬 ${rpad(chCount, 4)} ch  🏷️  ${guild.roles.cache.size} roles${C.reset}`,
    ));
  }

  if (client.guilds.cache.size > 1) {
    console.log(blank);
    console.log(row('TOTAL MEMBERS',  `${C.bold}${C.white}${totalMembers}${C.reset} (${totalBots} bots, ${totalMembers - totalBots} humans)`));
    console.log(row('TOTAL CHANNELS', `${C.bold}${C.white}${totalChannels}${C.reset}`));
    console.log(row('TOTAL ROLES',    `${C.bold}${C.white}${totalRoles}${C.reset}`));
  }

  console.log(sect('📋 CHANNELS'));
  for (const guild of client.guilds.cache.values()) {
    if (client.guilds.cache.size > 1)
      console.log(row('', `${C.yellow}${C.bold}── ${guild.name} ──${C.reset}`));

    const channelTypes = {
      text:  guild.channels.cache.filter(c => c.type === ChannelType.GuildText),
      voice: guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice),
      cat:   guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory),
      forum: guild.channels.cache.filter(c => c.type === ChannelType.GuildForum),
      stage: guild.channels.cache.filter(c => c.type === ChannelType.GuildStageVoice),
    };

    console.log(row('Text channels',  `${channelTypes.text.size}`,  C.cyan));
    console.log(row('Voice channels', `${channelTypes.voice.size}`, C.cyan));
    console.log(row('Categories',     `${channelTypes.cat.size}`,   C.cyan));
    if (channelTypes.forum.size) console.log(row('Forums', `${channelTypes.forum.size}`, C.cyan));
    if (channelTypes.stage.size) console.log(row('Stage',  `${channelTypes.stage.size}`, C.cyan));

    const allNamed = guild.channels.cache
      .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice)
      .sort((a, b) => a.position - b.position);

    for (const ch of allNamed.values()) {
      const icon = ch.type === ChannelType.GuildVoice ? '🔊' : '💬';
      console.log(row('', `${C.gray}${icon} ${ch.name}${C.reset}  ${C.dim}(${ch.id})${C.reset}`));
    }
  }

  console.log(sect('⚙️  CONFIG'));
  const cfgRows = [
    ['Log Channel',      process.env.LOG_CHANNEL_ID],
    ['Prison Channel',   process.env.PRISON_CHANNEL_ID],
    ['Hall of Fame',     process.env.HALL_OF_FAME_CHANNEL_ID],
    ['Hall of Shame',    process.env.HALL_OF_SHAME_CHANNEL_ID],
    ['Join Role',        process.env.JOIN_ROLE_ID],
    ['Guild ID (scope)', process.env.GUILD_ID ?? '(global commands)'],
    ['HOF Threshold',    String(HOF_THRESHOLD)],
    ['HOS Threshold',    String(HOS_THRESHOLD)],
    ['HOF Lock Floor',   String(HOF_LOCK_FLOOR)],
    ['HOS Lock Floor',   String(HOS_LOCK_FLOOR)],
    ['Roulette wait',    `${ROULETTE_CFG.waitingTime}s`],
    ['Roulette kick',    `${ROULETTE_CFG.kickTime}s`],
    ['Roulette prefix',  ROULETTE_CFG.prefix],
  ];
  for (const [label, val] of cfgRows) {
    const isSet   = val && val !== 'undefined';
    const display = isSet ? `${C.green}${val}${C.reset}` : `${C.red}⚠  NOT SET${C.reset}`;
    console.log(row(label, display));
  }

  console.log(sect('🚫 AUTO-MOD'));
  console.log(row('Banned words loaded', `${C.bold}${C.yellow}${bannedWords.length}${C.reset}`));
  if (bannedWords.length) {
    const preview = bannedWords.slice(0, 8).map(w => `||${w}||`).join('  ');
    const extra   = bannedWords.length > 8 ? `  ${C.gray}+${bannedWords.length - 8} more${C.reset}` : '';
    console.log(row('', `${C.red}${preview}${extra}${C.reset}`));
  }

  console.log(`${C.pink}└${'─'.repeat(W + 2)}┘${C.reset}`);
  console.log('');
  console.log(`  ${C.green}${C.bold}✅  Candooda is online and watching.${C.reset}`);
  console.log(`  ${C.gray}${new Date().toUTCString()}${C.reset}`);
  console.log('');
}

module.exports = { printStartup };
