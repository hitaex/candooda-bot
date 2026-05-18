// ================================================================
//  Candooda v2 — Discord Moderation & Community Bot
//  discord.js v14 | High-efficiency single-file architecture
// ================================================================

'use strict';
require('dotenv').config();

const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, PermissionsBitField,
  ActivityType, Collection, AuditLogEvent, Events, ChannelType,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ── Constants ────────────────────────────────────────────────────
const BRAND   = 0xE89EB8;
const SUCCESS = 0x57F287;
const DANGER  = 0xED4245;
const WARN    = 0xFEE75C;
const INFO    = 0x5865F2;
const DARK    = 0x2C2F33;
const GOLD    = 0xFFD700;
const GRIM    = 0x36393F;

const DJS_VERSION = require('discord.js').version;

const DURATION_MAP = {
  '1m': 60_000,      '5m': 300_000,    '10m': 600_000,
  '30m': 1_800_000,  '1h': 3_600_000,  '1d': 86_400_000,
  '1w': 604_800_000,
};

const BANNED_WORDS_FILE = path.join(__dirname, 'badwords.json');

// ── Channel type labels — use ChannelType enum, not raw integers ─
const CH_TYPE = {
  [ChannelType.GuildText]:        'Text',
  [ChannelType.GuildVoice]:       'Voice',
  [ChannelType.GuildCategory]:    'Category',
  [ChannelType.GuildAnnouncement]:'Announcement',
  [ChannelType.GuildStageVoice]:  'Stage',
  [ChannelType.GuildForum]:       'Forum',
  [ChannelType.GuildMedia]:       'Media',
};

// ================================================================
//  UTILITY HELPERS
// ================================================================

function loadJSON(file, fallback) {
  try   { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function buildWordRegexes(words) {
  return words.map(w => {
    const esc     = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isLatin = /^[\x00-\x7F]+$/.test(w);
    const pattern = isLatin ? `\\b${esc}\\b` : `(?<!\\S)${esc}(?!\\S)`;
    return { word: w, re: new RegExp(pattern, 'iu') };
  });
}

/** Standardised embed factory */
function embed(color = BRAND) {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

/** Ephemeral embed error reply — safe to call at any interaction state */
async function err(interaction, msg) {
  const e = embed(DANGER).setDescription(`❌  ${msg}`);
  const payload = { embeds: [e], ephemeral: true };
  if (interaction.replied || interaction.deferred)
    return interaction.followUp(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}

/** Cooldown check — returns remaining seconds (number) or 0 */
function cooldown(userId, cmd, secs = 3) {
  const key = `${userId}:${cmd}`;
  const now = Date.now();
  const exp = cooldowns.get(key);
  if (exp && now < exp) return parseFloat(((exp - now) / 1000).toFixed(1));
  cooldowns.set(key, now + secs * 1000);
  setTimeout(() => cooldowns.delete(key), secs * 1000);
  return 0;
}

/** Human-readable duration from ms */
function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

/** Discord timestamp (absolute) */
function ts(date) {
  return `<t:${Math.floor((date instanceof Date ? date : new Date(date)).getTime() / 1000)}:F>`;
}
/** Discord timestamp (relative) */
function tsRel(date) {
  return `<t:${Math.floor((date instanceof Date ? date : new Date(date)).getTime() / 1000)}:R>`;
}

/**
 * Snapshot active invites and their use-counts so we can later diff
 * them to identify which invite a new member used.
 * Called on Ready and after each join to keep the snapshot fresh.
 */
const inviteCache = new Map(); // guildId → Map<code, uses>

async function snapshotInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(invites.map(i => [i.code, i.uses])));
  } catch { /* missing MANAGE_GUILD permission */ }
}

/**
 * FIX: Compare before/after invite snapshots to identify which invite
 * was actually used. Returns a formatted string or null.
 * Previously getActiveInvites() just listed all invites — misleading.
 */
async function resolveUsedInvite(member) {
  const before = inviteCache.get(member.guild.id);
  try {
    const after = await member.guild.invites.fetch();
    // Refresh snapshot for next join
    inviteCache.set(member.guild.id, new Map(after.map(i => [i.code, i.uses])));
    if (!before) return null;
    for (const invite of after.values()) {
      const prevUses = before.get(invite.code) ?? 0;
      if (invite.uses > prevUses && invite.inviter) {
        return `\`${invite.code}\` by ${invite.inviter} (${invite.uses} uses)`;
      }
    }
  } catch { /* missing MANAGE_GUILD permission */ }
  return null;
}

/** Send an embed to the configured log channel */
async function sendLog(guild, embedObj) {
  const cid = process.env.LOG_CHANNEL_ID;
  if (!cid) return;
  try {
    const ch = guild.channels.cache.get(cid)
      ?? await guild.channels.fetch(cid).catch(() => null);
    if (ch?.isTextBased()) await ch.send({ embeds: [embedObj] });
  } catch (e) {
    console.warn('[sendLog] Failed to send log:', e?.message);
  }
}

/**
 * Fetch who performed an audit log action.
 * FIX: For MESSAGE_DELETE the audit log target is the channel (not the author).
 * Pass targetId=null when the target is a channel to skip the id filter.
 */
async function getAuditExecutor(guild, actionType, targetId, maxAgeSecs = 5) {
  try {
    const logs = await guild.fetchAuditLogs({ type: actionType, limit: 5 });
    const entry = logs.entries.find(e =>
      (!targetId || e.target?.id === targetId) &&
      (Date.now() - e.createdTimestamp) < maxAgeSecs * 1000
    );
    return entry?.executor ?? null;
  } catch { return null; }
}

// ── 8-ball responses ─────────────────────────────────────────────
const BALL_RESPONSES = [
  ['🟢', 'It is certain.'],         ['🟢', 'Without a doubt.'],
  ['🟢', 'Yes, definitely!'],       ['🟢', 'You may rely on it.'],
  ['🟡', 'Ask again later.'],       ['🟡', 'Cannot predict now.'],
  ['🟡', 'Concentrate and ask again.'],
  ['🔴', "Don't count on it."],     ['🔴', 'My sources say no.'],
  ['🔴', 'Outlook not so good.'],   ['🔴', 'Very doubtful.'],
];

// ── Word-filter: load once, watch for changes ────────────────────
let bannedWords    = loadJSON(BANNED_WORDS_FILE, []);
let bannedWordRegs = buildWordRegexes(bannedWords);

fs.watchFile(BANNED_WORDS_FILE, { interval: 2000 }, () => {
  bannedWords    = loadJSON(BANNED_WORDS_FILE, bannedWords);
  bannedWordRegs = buildWordRegexes(bannedWords);
  console.log('[AutoMod] Reloaded banned-words.json');
});

// ── Runtime stores ─────────────────────────────────────────────────
const reactionRoles   = new Map();   // "msgId:emoji" → roleId
const imprisonedUsers = new Map();   // userId → { guildId, savedPerms[] }
const cooldowns       = new Collection();

// Hall of Fame / Shame: sourceMessageId → { boardMessageId, count }
const hofPosts = new Map();
const hosPosts = new Map();
const boardInFlight = new Set();     // prevents double-post race condition

const HOF_THRESHOLD  = parseInt(process.env.HOF_THRESHOLD  ?? '4', 10);
const HOS_THRESHOLD  = parseInt(process.env.HOS_THRESHOLD  ?? '4', 10);
const HOF_LOCK_FLOOR = parseInt(process.env.HOF_LOCK_FLOOR ?? '3', 10);
const HOS_LOCK_FLOOR = parseInt(process.env.HOS_LOCK_FLOOR ?? '3', 10);

// ── Client ────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildInvites,   // FIX: required for invite tracking
  ],
  partials: [
    Partials.Message, Partials.Channel, Partials.Reaction,
    Partials.GuildMember, Partials.User,
  ],
});

// ================================================================
//  SLASH COMMAND DEFINITIONS
// ================================================================
const commands = [
  // ── Moderation ──────────────────────────────────────────────
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

  // ── Prison ───────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('imprison').setDescription('Restrict a user to the prison channel')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('release').setDescription('Release a user from prison')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),

  // ── Reaction roles ───────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('reaction-role').setDescription('Create a reaction role on a message')
    .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
    .addStringOption(o => o.setName('message-id').setDescription('Message ID').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)),

  new SlashCommandBuilder()
    .setName('reaction-roles-list').setDescription('List all active reaction roles'),

  // ── Info ─────────────────────────────────────────────────────
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

  // ── Fun ──────────────────────────────────────────────────────
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

  // ── Help ─────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('help').setDescription('Show all commands'),

].map(c => c.toJSON());

// ── Register commands ────────────────────────────────────────────
let commandsRegistered = false;
async function registerCommands() {
  if (commandsRegistered) return;
  commandsRegistered = true;
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);
    await rest.put(route, { body: commands });
    console.log(`[Candooda] Commands registered ${process.env.GUILD_ID ? 'to guild' : 'globally'}`);
  } catch (e) {
    commandsRegistered = false;
    console.error('[Candooda] Command registration failed:', e.message);
  }
}

// ================================================================
//  TERMINAL LOGGER
// ================================================================

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

function printStartup() {
  const W = 62;

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

// ================================================================
//  READY
// ================================================================
client.once(Events.ClientReady, async () => {
  client.user.setActivity("over Candooda's server", { type: ActivityType.Watching });
  await registerCommands();

  // FIX: snapshot invites for all guilds on startup so we can diff on joins
  for (const guild of client.guilds.cache.values()) {
    await snapshotInvites(guild);
  }

  printStartup();
});

// ================================================================
//  SLASH COMMAND HANDLER
// ================================================================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guild || !interaction.member) return;

  const { commandName: cmd, guild, member } = interaction;

  // ─── /ping ───────────────────────────────────────────────────
  if (cmd === 'ping') {
    const sent = await interaction.reply({ content: '🏓 Pinging…', fetchReply: true });
    const rtt  = sent.createdTimestamp - interaction.createdTimestamp;
    return interaction.editReply({
      content: null,
      embeds: [embed(BRAND)
        .setTitle('🏓 Pong!')
        .addFields(
          { name: 'Bot Latency', value: `\`${rtt}ms\``,             inline: true },
          { name: 'WebSocket',   value: `\`${client.ws.ping}ms\``,  inline: true },
          { name: 'Uptime',      value: fmtDuration(client.uptime), inline: true },
        )],
    });
  }

  // ─── /help ───────────────────────────────────────────────────
  if (cmd === 'help') {
    return interaction.reply({ ephemeral: true, embeds: [
      embed(BRAND)
        .setTitle('🌸 Candooda — Command Reference')
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          { name: '🔨 Moderation',  value: '`/timeout` `/ban` `/kick` `/warn` `/purge`' },
          { name: '🏛️ Prison',      value: '`/imprison` `/release`' },
          { name: '⭐ Reaction Roles', value: '`/reaction-role` `/reaction-roles-list`' },
          { name: '📋 Info',         value: '`/user` `/server` `/avatar` `/banner` `/ping`' },
          { name: '🎲 Fun',          value: '`/8ball` `/coinflip` `/dice` `/poll`' },
          { name: '🛡️ Auto-Mod',    value: 'Banned words are auto-detected. Edit `banned-words.json` (hot-reloads).' },
          { name: '📊 Stats',        value: `Servers: \`${client.guilds.cache.size}\` · Uptime: \`${fmtDuration(client.uptime)}\`` },
        )
        .setFooter({ text: 'Candooda v2.0 · All embeds use #E89EB8' }),
    ]});
  }

  // ─── /user ───────────────────────────────────────────────────
  if (cmd === 'user') {
    const target   = interaction.options.getMember('target') ?? member;
    const user     = target.user;
    const fullUser = await client.users.fetch(user.id, { force: true }).catch(() => user);

    const roles = target.roles.cache
      .filter(r => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `${r}`)
      .slice(0, 10)
      .join(' ') || 'None';

    const e = embed(BRAND)
      .setTitle(`👤 ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Display Name',    value: target.displayName ?? user.username,                  inline: true },
        { name: 'User ID',         value: `\`${user.id}\``,                                    inline: true },
        { name: 'Bot?',            value: user.bot ? 'Yes 🤖' : 'No',                          inline: true },
        { name: 'Account Created', value: `${ts(user.createdAt)}\n${tsRel(user.createdAt)}`,    inline: true },
        { name: 'Joined Server',   value: target.joinedAt ? `${ts(target.joinedAt)}\n${tsRel(target.joinedAt)}` : 'Unknown', inline: true },
        { name: 'Boosting Since',  value: target.premiumSince ? tsRel(target.premiumSince) : 'Not boosting', inline: true },
        { name: 'Nickname',        value: target.nickname ?? 'None',                            inline: true },
        { name: 'Highest Role',    value: `${target.roles.highest}`,                            inline: true },
        { name: 'Is Timed Out?',   value: target.isCommunicationDisabled() ? `Until ${tsRel(target.communicationDisabledUntil)}` : 'No', inline: true },
        { name: `Roles [${target.roles.cache.size - 1}]`, value: roles },
      );

    if (fullUser.bannerURL()) e.setImage(fullUser.bannerURL({ size: 512 }));

    return interaction.reply({ embeds: [e] });
  }

  // ─── /server ─────────────────────────────────────────────────
  if (cmd === 'server') {
    await interaction.deferReply();
    const g = guild;
    await g.fetch();

    const channels   = g.channels.cache;
    const textCount  = channels.filter(c => c.type === ChannelType.GuildText).size;
    const voiceCount = channels.filter(c => c.type === ChannelType.GuildVoice).size;
    const catCount   = channels.filter(c => c.type === ChannelType.GuildCategory).size;

    const members = g.memberCount;
    const bots    = g.members.cache.filter(m => m.user?.bot).size;

    const features = g.features.length
      ? g.features.map(f => `\`${f}\``).join(', ')
      : 'None';

    return interaction.editReply({ embeds: [
      embed(BRAND)
        .setTitle(`🏰 ${g.name}`)
        .setThumbnail(g.iconURL({ size: 256 }))
        .setImage(g.bannerURL({ size: 1024 }) ?? null)
        .addFields(
          { name: 'Server ID',    value: `\`${g.id}\``,                                          inline: true },
          { name: 'Owner',        value: `<@${g.ownerId}>`,                                       inline: true },
          { name: 'Created',      value: `${ts(g.createdAt)}`,                                    inline: true },
          { name: 'Members',      value: `👥 ${members} (🤖 ${bots} bots)`,                      inline: true },
          { name: 'Boost Level',  value: `Level ${g.premiumTier} · ${g.premiumSubscriptionCount} boosts`, inline: true },
          { name: 'Verification', value: `${['None','Low','Medium','High','Highest'][g.verificationLevel]}`, inline: true },
          { name: 'Channels',     value: `💬 ${textCount} text · 🔊 ${voiceCount} voice · 📁 ${catCount} categories`, inline: false },
          { name: 'Roles',        value: `${g.roles.cache.size}`,                                 inline: true },
          { name: 'Emojis',       value: `${g.emojis.cache.size}`,                               inline: true },
          { name: 'Stickers',     value: `${g.stickers.cache.size}`,                             inline: true },
          { name: 'Features',     value: features },
        ),
    ]});
  }

  // ─── /avatar ─────────────────────────────────────────────────
  if (cmd === 'avatar') {
    const target = interaction.options.getUser('target') ?? interaction.user;
    return interaction.reply({ embeds: [
      embed(BRAND)
        .setTitle(`🖼️ ${target.username}'s Avatar`)
        .setImage(target.displayAvatarURL({ size: 1024 }))
        .setURL(target.displayAvatarURL({ size: 1024 })),
    ]});
  }

  // ─── /banner ─────────────────────────────────────────────────
  if (cmd === 'banner') {
    const target   = interaction.options.getUser('target') ?? interaction.user;
    const fullUser = await client.users.fetch(target.id, { force: true }).catch(() => target);
    const url      = fullUser.bannerURL?.({ size: 1024 });
    if (!url) return err(interaction, 'That user has no banner set.');
    return interaction.reply({ embeds: [
      embed(BRAND)
        .setTitle(`🎨 ${fullUser.username}'s Banner`)
        .setImage(url)
        .setURL(url),
    ]});
  }

  // ─── /8ball ──────────────────────────────────────────────────
  if (cmd === '8ball') {
    const question = interaction.options.getString('question');
    const [dot, ans] = BALL_RESPONSES[Math.floor(Math.random() * BALL_RESPONSES.length)];
    return interaction.reply({ embeds: [
      embed(BRAND)
        .setTitle('🎱 Magic 8-Ball')
        .addFields(
          { name: '❓ Question', value: question },
          { name: `${dot} Answer`, value: `**${ans}**` },
        ),
    ]});
  }

  // ─── /coinflip ───────────────────────────────────────────────
  if (cmd === 'coinflip') {
    const result = Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!';
    return interaction.reply({ embeds: [
      embed(BRAND).setTitle('Coin Flip').setDescription(`**${result}**`),
    ]});
  }

  // ─── /dice ───────────────────────────────────────────────────
  if (cmd === 'dice') {
    const sides  = interaction.options.getInteger('sides') ?? 6;
    const result = Math.floor(Math.random() * sides) + 1;
    return interaction.reply({ embeds: [
      embed(BRAND)
        .setTitle('🎲 Dice Roll')
        .setDescription(`Rolled a **d${sides}** and got **${result}**!`),
    ]});
  }

  // ─── /poll ───────────────────────────────────────────────────
  if (cmd === 'poll') {
    const question = interaction.options.getString('question');
    const msg = await interaction.reply({ fetchReply: true, embeds: [
      embed(INFO)
        .setTitle('📊 Poll')
        .setDescription(`**${question}**`)
        .setFooter({ text: `Poll by ${interaction.user.username}` }),
    ]});
    await msg.react('✅').catch(() => {});
    await msg.react('❌').catch(() => {});
    return;
  }

  // ─── /reaction-roles-list ────────────────────────────────────
  if (cmd === 'reaction-roles-list') {
    if (!reactionRoles.size)
      return interaction.reply({ ephemeral: true, embeds: [embed(WARN).setDescription('No reaction roles configured yet.')] });
    const lines = [...reactionRoles.entries()].map(([k, rId]) => {
      const colonIdx = k.indexOf(':');
      const msgId    = k.slice(0, colonIdx);
      const emoji    = k.slice(colonIdx + 1);
      return `Msg \`${msgId}\` · ${emoji} → <@&${rId}>`;
    });
    return interaction.reply({ ephemeral: true, embeds: [
      embed(BRAND).setTitle('⭐ Active Reaction Roles').setDescription(lines.join('\n')),
    ]});
  }

  // ─── /reaction-role ──────────────────────────────────────────
  if (cmd === 'reaction-role') {
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles))
      return err(interaction, 'You need **Manage Roles** permission.');

    const channel   = interaction.options.getChannel('channel');
    const messageId = interaction.options.getString('message-id');
    const emoji     = interaction.options.getString('emoji');
    const role      = interaction.options.getRole('role');

    if (role.position >= guild.members.me.roles.highest.position)
      return err(interaction, 'That role is above my highest role.');

    let msg;
    try   { msg = await channel.messages.fetch(messageId); }
    catch { return err(interaction, 'Message not found — check channel and ID.'); }

    try   { await msg.react(emoji); }
    catch { return err(interaction, 'Cannot react with that emoji.'); }

    reactionRoles.set(`${messageId}:${emoji}`, role.id);

    return interaction.reply({ ephemeral: true, embeds: [
      embed(SUCCESS)
        .setTitle('✅ Reaction Role Created')
        .addFields(
          { name: 'Channel', value: `${channel}`,       inline: true },
          { name: 'Message', value: `\`${messageId}\``, inline: true },
          { name: 'Emoji',   value: emoji,               inline: true },
          { name: 'Role',    value: `${role}`,           inline: true },
        ),
    ]});
  }

  // ================================================================
  //  MODERATION (all require cooldown check)
  // ================================================================
  const modCmds = ['timeout','ban','kick','warn','purge','imprison','release'];
  if (modCmds.includes(cmd)) {
    const rem = cooldown(member.id, cmd);
    if (rem) return err(interaction, `Cooldown active — wait **${rem}s**`);
  }

  // ─── /warn ───────────────────────────────────────────────────
  if (cmd === 'warn') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return err(interaction, 'You need **Moderate Members** permission.');

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');
    if (!target) return err(interaction, 'User not found.');

    const warnEmbed = embed(WARN)
      .setTitle('⚠️ You Have Been Warned')
      .setDescription(`You received a warning in **${guild.name}**`)
      .addFields({ name: 'Reason', value: reason });

    try { await target.send({ embeds: [warnEmbed] }); } catch { /* DMs closed */ }

    const logE = embed(WARN)
      .setTitle('⚠️ User Warned')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User',   value: `${target} (${target.user.tag})`, inline: true },
        { name: 'By',     value: `${member}`,                      inline: true },
        { name: 'Reason', value: reason },
      );
    await sendLog(guild, logE);
    console.log(`[MOD] ${member.user.tag} warned ${target.user.tag} — ${reason}`);
    return interaction.reply({ embeds: [logE] });
  }

  // ─── /purge ──────────────────────────────────────────────────
  if (cmd === 'purge') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages))
      return err(interaction, 'You need **Manage Messages** permission.');

    const amount     = interaction.options.getInteger('amount');
    const filterUser = interaction.options.getUser('user');
    const ch         = interaction.channel;

    let messages = await ch.messages.fetch({ limit: 100 });
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    messages = messages.filter(m => m.createdTimestamp > cutoff);
    if (filterUser) messages = messages.filter(m => m.author.id === filterUser.id);
    messages = [...messages.values()].slice(0, amount);

    if (!messages.length) return err(interaction, 'No eligible messages to delete.');

    const deleted = await ch.bulkDelete(messages, true).catch(() => null);
    const count   = deleted?.size ?? messages.length;

    const logE = embed(INFO)
      .setTitle('🗑️ Messages Purged')
      .addFields(
        { name: 'Count',   value: `${count}`, inline: true },
        { name: 'Channel', value: `${ch}`,    inline: true },
        { name: 'By',      value: `${member}`, inline: true },
      );
    if (filterUser) logE.addFields({ name: 'Filtered to', value: `${filterUser}`, inline: true });

    await sendLog(guild, logE);
    return interaction.reply({ ephemeral: true, embeds: [
      embed(SUCCESS).setDescription(`✅ Deleted **${count}** messages.`),
    ]});
  }

  // ─── /timeout ────────────────────────────────────────────────
  if (cmd === 'timeout') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return err(interaction, 'You need **Moderate Members** permission.');

    const target   = interaction.options.getMember('user');
    const duration = interaction.options.getString('duration');
    const reason   = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target)             return err(interaction, 'User not found.');
    if (!target.moderatable) return err(interaction, 'I cannot moderate that user.');

    try {
      await target.timeout(DURATION_MAP[duration], reason);
    } catch (e) {
      console.error('[/timeout]', e.message);
      return err(interaction, `Failed to timeout user: ${e.message}`);
    }

    const e = embed(WARN)
      .setTitle('⏱️ User Timed Out')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User',     value: `${target}`, inline: true },
        { name: 'Duration', value: duration,     inline: true },
        { name: 'By',       value: `${member}`,  inline: true },
        { name: 'Reason',   value: reason },
      );
    await sendLog(guild, e);
    return interaction.reply({ embeds: [e] });
  }

  // ─── /ban ────────────────────────────────────────────────────
  if (cmd === 'ban') {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers))
      return err(interaction, 'You need **Ban Members** permission.');

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target)          return err(interaction, 'User not found.');
    if (!target.bannable) return err(interaction, 'I cannot ban that user.');

    // DM before ban so user can receive it while still in the server
    try { await target.send({ embeds: [
      embed(DANGER)
        .setTitle('🔨 You Have Been Banned')
        .setDescription(`You were banned from **${guild.name}**.\nReason: ${reason}`),
    ]}); } catch { /* DMs closed */ }

    try {
      await target.ban({ reason });
    } catch (e) {
      console.error('[/ban]', e.message);
      return err(interaction, `Failed to ban user: ${e.message}`);
    }

    const e = embed(DANGER)
      .setTitle('🔨 User Banned')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User',   value: target.user.tag, inline: true },
        { name: 'By',     value: `${member}`,      inline: true },
        { name: 'Reason', value: reason },
      );
    await sendLog(guild, e);
    return interaction.reply({ embeds: [e] });
  }

  // ─── /kick ───────────────────────────────────────────────────
  if (cmd === 'kick') {
    if (!member.permissions.has(PermissionFlagsBits.KickMembers))
      return err(interaction, 'You need **Kick Members** permission.');

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target)          return err(interaction, 'User not found.');
    if (!target.kickable) return err(interaction, 'I cannot kick that user.');

    try {
      await target.kick(reason);
    } catch (e) {
      console.error('[/kick]', e.message);
      return err(interaction, `Failed to kick user: ${e.message}`);
    }

    const e = embed(WARN)
      .setTitle('👢 User Kicked')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User',   value: target.user.tag, inline: true },
        { name: 'By',     value: `${member}`,      inline: true },
        { name: 'Reason', value: reason },
      );
    await sendLog(guild, e);
    return interaction.reply({ embeds: [e] });
  }

  // ─── /imprison ───────────────────────────────────────────────
  if (cmd === 'imprison') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return err(interaction, 'You need **Moderate Members** permission.');

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target) return err(interaction, 'User not found.');
    if (imprisonedUsers.has(target.id)) return err(interaction, 'Already imprisoned.');
    if (!process.env.PRISON_CHANNEL_ID) return err(interaction, '`PRISON_CHANNEL_ID` not set in .env');

    // Mark as imprisoned immediately to prevent concurrent /imprison race
    imprisonedUsers.set(target.id, { guildId: guild.id, savedPerms: [] });

    await interaction.deferReply();

    // FIX: save the FULL permission override (all flags as raw bitfields),
    // not just a subset. On release we restore the complete override via .set().
    const savedPerms = [];

    for (const [, ch] of guild.channels.cache) {
      if (!ch.isTextBased()) continue;
      if (ch.id === process.env.PRISON_CHANNEL_ID) continue;
      try {
        const ow = ch.permissionOverwrites.cache.get(target.id);
        savedPerms.push({
          channelId: ch.id,
          allow: ow?.allow.bitfield ?? 0n,
          deny:  ow?.deny.bitfield  ?? 0n,
        });
        await ch.permissionOverwrites.edit(target.user, {
          SendMessages:  false,
          AddReactions:  false,
        });
      } catch { /* skip uneditable channels */ }
    }

    try {
      const prisonCh = guild.channels.cache.get(process.env.PRISON_CHANNEL_ID)
        ?? await guild.channels.fetch(process.env.PRISON_CHANNEL_ID).catch(() => null);
      if (prisonCh) await prisonCh.permissionOverwrites.edit(target.user, {
        ViewChannel:   true,
        SendMessages:  true,
        AddReactions:  false,
      });
    } catch { /* ignore */ }

    imprisonedUsers.set(target.id, { guildId: guild.id, savedPerms });

    const e = embed(DARK)
      .setTitle('🏛️ User Imprisoned')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User',   value: `${target}`, inline: true },
        { name: 'By',     value: `${member}`, inline: true },
        { name: 'Reason', value: reason },
      );

    try { await target.send({ embeds: [embed(DARK).setTitle('🏛️ You Have Been Imprisoned')
      .setDescription(`You may only speak in the designated channel in **${guild.name}**.\nReason: ${reason}`)] }); }
    catch { /* DMs closed */ }

    await sendLog(guild, e);
    return interaction.editReply({ embeds: [e] });
  }

  // ─── /release ────────────────────────────────────────────────
  if (cmd === 'release') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return err(interaction, 'You need **Moderate Members** permission.');

    const target = interaction.options.getMember('user');
    if (!target) return err(interaction, 'User not found.');
    if (!imprisonedUsers.has(target.id)) return err(interaction, 'That user is not imprisoned.');

    await interaction.deferReply();
    const { savedPerms } = imprisonedUsers.get(target.id);

    for (const { channelId, allow, deny } of savedPerms) {
      try {
        const ch = guild.channels.cache.get(channelId);
        if (!ch) continue;

        if (allow === 0n && deny === 0n) {
          // No custom override existed before — remove the one we added entirely
          await ch.permissionOverwrites.delete(target.user).catch(() => {});
        } else {
          // FIX: restore the complete saved bitfields using .set() so ALL
          // permission flags (not just SendMessages + AddReactions) are restored
          await ch.permissionOverwrites.set([
            ...ch.permissionOverwrites.cache.values(),
            {
              id:    target.id,
              allow: new PermissionsBitField(allow),
              deny:  new PermissionsBitField(deny),
              type:  1, // OverwriteType.Member
            },
          ]);
        }
      } catch { /* skip */ }
    }

    try {
      const prisonCh = guild.channels.cache.get(process.env.PRISON_CHANNEL_ID);
      if (prisonCh) await prisonCh.permissionOverwrites.delete(target.user);
    } catch { /* ignore */ }

    imprisonedUsers.delete(target.id);

    const e = embed(SUCCESS)
      .setTitle('🕊️ User Released')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target}`, inline: true },
        { name: 'By',   value: `${member}`, inline: true },
      );

    try { await target.send({ embeds: [embed(SUCCESS).setDescription(`🕊️ You've been released in **${guild.name}**. Welcome back!`)] }); }
    catch { /* DMs closed */ }

    await sendLog(guild, e);
    return interaction.editReply({ embeds: [e] });
  }
});

// ================================================================
//  HALL OF FAME & HALL OF SHAME
// ================================================================

function extractImage(message) {
  const img = message.attachments.find(a => a.contentType?.startsWith('image/'));
  if (img) return img.url;
  const eImg = message.embeds.find(e => e.image?.url || e.thumbnail?.url);
  if (eImg) return eImg.image?.url ?? eImg.thumbnail?.url ?? null;
  return null;
}

function buildBoardEmbed(type, sourceMsg, count) {
  const isFame  = type === 'fame';
  const emoji   = isFame ? '⭐' : '💀';
  const title   = isFame ? '⭐  Hall of Fame' : '💀  Hall of Shame';
  const color   = isFame ? GOLD : GRIM;
  const msgLink = `https://discord.com/channels/${sourceMsg.guildId}/${sourceMsg.channelId}/${sourceMsg.id}`;
  const stars   = emoji.repeat(Math.min(count, 10));
  const content = sourceMsg.content?.slice(0, 1024) || '*[no text]*';
  const imageUrl = extractImage(sourceMsg);

  // FIX: sourceMsg.channel can be null if the channel was deleted — guard it
  const channelDisplay = sourceMsg.channel ? `${sourceMsg.channel}` : `\`${sourceMsg.channelId}\``;

  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setAuthor({
      name:    sourceMsg.author?.username ?? 'Unknown',
      iconURL: sourceMsg.author?.displayAvatarURL({ size: 64 }),
    })
    .setDescription(`${content}\n\n[Jump to message](${msgLink})`)
    .addFields(
      { name: 'Reactions', value: `${stars}  **${count}**`, inline: true },
      { name: 'Posted in', value: channelDisplay,            inline: true },
    )
    .setTimestamp(sourceMsg.createdAt);

  if (imageUrl) e.setImage(imageUrl);
  return e;
}

async function handleBoardReaction(reaction, user, add) {
  if (user.bot) return;
  if (reaction.partial) try { await reaction.fetch(); } catch { return; }
  if (reaction.message.partial) try { await reaction.message.fetch(); } catch { return; }

  // FIX: author can still be null on very old cached partials — bail out cleanly
  if (!reaction.message.author) return;

  const emojiName = reaction.emoji.name;
  const isFame    = emojiName === '⭐';
  const isShame   = emojiName === '💀';
  if (!isFame && !isShame) return;

  const type      = isFame ? 'fame' : 'shame';
  const store     = isFame ? hofPosts : hosPosts;
  const threshold = isFame ? HOF_THRESHOLD : HOS_THRESHOLD;
  const lockFloor = isFame ? HOF_LOCK_FLOOR : HOS_LOCK_FLOOR;
  const channelId = isFame ? process.env.HALL_OF_FAME_CHANNEL_ID : process.env.HALL_OF_SHAME_CHANNEL_ID;

  if (!channelId) return;
  if (reaction.message.channelId === channelId) return;

  const sourceMsg = reaction.message;
  const rawCount  = reaction.count ?? 0;
  const entry     = store.get(sourceMsg.id);

  if (entry) {
    const displayCount = Math.max(rawCount, lockFloor);
    try {
      const boardCh = sourceMsg.guild.channels.cache.get(channelId)
        ?? await sourceMsg.guild.channels.fetch(channelId).catch(() => null);
      if (!boardCh) return;
      const boardMsg = await boardCh.messages.fetch(entry.boardMessageId).catch(() => null);
      if (boardMsg) {
        await boardMsg.edit({ embeds: [buildBoardEmbed(type, sourceMsg, displayCount)] });
        entry.count = displayCount;
      }
    } catch (e) { console.error(`[Hall ${type}] Update failed:`, e.message); }
    return;
  }

  if (!add || rawCount < threshold) return;

  if (boardInFlight.has(sourceMsg.id)) return;
  boardInFlight.add(sourceMsg.id);

  try {
    const boardCh = sourceMsg.guild.channels.cache.get(channelId)
      ?? await sourceMsg.guild.channels.fetch(channelId).catch(() => null);
    if (!boardCh?.isTextBased()) return;

    const boardMsg = await boardCh.send({
      embeds: [buildBoardEmbed(type, sourceMsg, rawCount)],
    });

    store.set(sourceMsg.id, { boardMessageId: boardMsg.id, count: rawCount });
    console.log(`[Hall ${type}] Posted message ${sourceMsg.id} by ${sourceMsg.author.tag} (${rawCount} reactions)`);
  } catch (e) {
    console.error(`[Hall ${type}] Post failed:`, e.message);
  } finally {
    boardInFlight.delete(sourceMsg.id);
  }
}

client.on(Events.MessageReactionAdd,    (r, u) => handleBoardReaction(r, u, true));
client.on(Events.MessageReactionRemove, (r, u) => handleBoardReaction(r, u, false));

// ================================================================
//  REACTION ROLES
// ================================================================
async function handleReaction(reaction, user, add) {
  if (user.bot) return;
  if (reaction.partial) try { await reaction.fetch(); } catch { return; }

  const emoji = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name;

  const roleId = reactionRoles.get(`${reaction.message.id}:${emoji}`);
  if (!roleId) return;

  try {
    const m = await reaction.message.guild.members.fetch(user.id);
    if (add) await m.roles.add(roleId);
    else     await m.roles.remove(roleId);
  } catch (e) { console.error('[ReactionRole]', e.message); }
}
client.on(Events.MessageReactionAdd,    (r, u) => handleReaction(r, u, true));
client.on(Events.MessageReactionRemove, (r, u) => handleReaction(r, u, false));

// Clean up dead reactionRoles entries when a message is deleted
client.on(Events.MessageDelete, async message => {
  for (const key of reactionRoles.keys()) {
    if (key.startsWith(`${message.id}:`)) reactionRoles.delete(key);
  }

  // ── Log message deletion ────────────────────────────────────
  if (!message.guild) return;
  if (message.author?.bot) return;
  if (message.channelId === process.env.LOG_CHANNEL_ID) return;

  // FIX: MESSAGE_DELETE audit log target is the channel, not the author.
  // Pass null as targetId so the lookup isn't filtered by author id.
  const executor = await getAuditExecutor(message.guild, AuditLogEvent.MessageDelete, null);

  const e = embed(DANGER)
    .setTitle('🗑️ Message Deleted')
    .setThumbnail(message.author?.displayAvatarURL({ size: 256 }) ?? null)
    .addFields(
      { name: 'Author',     value: message.author ? `${message.author} (\`${message.author.tag}\`)` : '*Unknown*', inline: true },
      { name: 'Channel',    value: `${message.channel}`,                                                           inline: true },
      { name: 'Deleted by', value: executor ? `${executor}` : '*Author or auto-mod*',                             inline: true },
      { name: 'Message ID', value: `\`${message.id}\``,                                                           inline: true },
      { name: 'Sent at',    value: message.createdAt ? ts(message.createdAt) : 'Unknown',                         inline: true },
    );

  const content = message.content?.trim();
  if (content) e.addFields({ name: '📝 Content', value: content.slice(0, 1024) });
  if (content?.length > 1024) e.addFields({ name: '📝 Content (cont.)', value: content.slice(1024, 2048) });

  if (message.attachments.size) {
    const files = message.attachments.map(a => `[${a.name}](${a.url})`).join('\n');
    e.addFields({ name: `📎 Attachments [${message.attachments.size}]`, value: files.slice(0, 1024) });
    const firstImg = message.attachments.find(a => a.contentType?.startsWith('image/'));
    if (firstImg) e.setImage(firstImg.url);
  }

  if (message.embeds.length) {
    const embedSummary = message.embeds.map((em, i) =>
      `${i + 1}. ${em.title ?? em.description?.slice(0, 60) ?? '*[no title]*'}`
    ).join('\n');
    e.addFields({ name: `🖼️ Had Embeds [${message.embeds.length}]`, value: embedSummary.slice(0, 512) });
  }

  if (message.stickers.size)
    e.addFields({ name: '🎨 Stickers', value: message.stickers.map(s => s.name).join(', ') });

  await sendLog(message.guild, e);
});

// ================================================================
//  AUTO-MOD — banned word filter
// ================================================================
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;
  if (process.env.PRISON_CHANNEL_ID && message.channelId === process.env.PRISON_CHANNEL_ID) return;

  const content = message.content;
  const matched = bannedWordRegs.find(({ re }) => re.test(content));
  if (!matched) return;

  try { await message.delete(); } catch { /* already gone */ }

  try { await message.author.send({ embeds: [
    embed(DANGER)
      .setTitle('⚠️ Message Removed')
      .setDescription(`Your message in **${message.guild.name}** was removed for containing prohibited language.`),
  ]}); } catch { /* DMs closed */ }

  await sendLog(message.guild, embed(DANGER)
    .setTitle('🚫 Auto-Mod: Banned Word')
    .addFields(
      { name: 'User',    value: `${message.author} (\`${message.author.tag}\`)`, inline: true },
      { name: 'Channel', value: `${message.channel}`,                            inline: true },
      { name: 'Word',    value: `||${matched.word}||`,                           inline: true },
      { name: 'Content', value: message.content.slice(0, 300) },
    )
  );
});

// ================================================================
//  ACTIVITY LOGS
// ================================================================

// ─────────────────────────────────────────────────────────────────
//  MEMBER JOIN
// ─────────────────────────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async member => {
  // FIX: use resolveUsedInvite (invite diffing) instead of listing all invites.
  // This correctly identifies which invite code the new member used.
  const inviteInfo = await resolveUsedInvite(member);
  const accountAge = Date.now() - member.user.createdTimestamp;
  const newAcct    = accountAge < 7 * 24 * 60 * 60 * 1000;

  const e = embed(SUCCESS)
    .setTitle('📥 Member Joined')
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'User',            value: `${member} (${member.user.tag})`,                                  inline: true },
      { name: 'User ID',         value: `\`${member.id}\``,                                                inline: true },
      { name: 'Bot?',            value: member.user.bot ? 'Yes 🤖' : 'No',                                 inline: true },
      { name: 'Account Created', value: `${ts(member.user.createdAt)}\n${tsRel(member.user.createdAt)}`,   inline: true },
      { name: 'Joined At',       value: `${ts(member.joinedAt ?? new Date())}`,                            inline: true },
      { name: 'Member Count',    value: `\`#${member.guild.memberCount}\``,                                inline: true },
    );

  if (newAcct)    e.addFields({ name: '⚠️ New Account',   value: 'Account is less than 7 days old!' });
  if (inviteInfo) e.addFields({ name: '📨 Joined via Invite', value: inviteInfo });

  // ── Auto-role on join ────────────────────────────────────────
  const joinRoleId = process.env.JOIN_ROLE_ID;
  if (joinRoleId && !member.user.bot) {
    try {
      // Resolve from cache first; fetch only if absent (avoids unnecessary API calls)
      const role = member.guild.roles.cache.get(joinRoleId)
        ?? await member.guild.roles.fetch(joinRoleId).catch(() => null);

      if (!role) {
        console.warn(`[AutoRole] JOIN_ROLE_ID ${joinRoleId} not found in guild ${member.guild.id}`);
      } else if (role.position >= member.guild.members.me.roles.highest.position) {
        // Role is at or above the bot's highest role — Discord will reject the assign
        console.warn(`[AutoRole] Cannot assign "${role.name}" — it is at or above my highest role`);
      } else {
        await member.roles.add(role, 'Auto-role on join');
        e.addFields({ name: '🎭 Role Assigned', value: `${role}`, inline: true });
        console.log(`[AutoRole] Assigned "${role.name}" to ${member.user.tag}`);
      }
    } catch (autoRoleErr) {
      console.error(`[AutoRole] Failed to assign role to ${member.user.tag}:`, autoRoleErr.message);
    }
  }

  await sendLog(member.guild, e);
});

// FIX: snapshot invites when a new guild is joined by the bot
client.on(Events.GuildCreate, guild => snapshotInvites(guild));

// ─────────────────────────────────────────────────────────────────
//  MEMBER LEAVE
// ─────────────────────────────────────────────────────────────────
client.on(Events.GuildMemberRemove, async member => {
  if (!member.user) return;

  const roles    = member.roles.cache
    .filter(r => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map(r => `${r}`)
    .slice(0, 15)
    .join(' ') || 'None';
  const executor = await getAuditExecutor(member.guild, AuditLogEvent.MemberKick, member.id);

  await sendLog(member.guild, embed(DANGER)
    .setTitle('📤 Member Left')
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'User',           value: `${member.user.tag}`,                                             inline: true },
      { name: 'User ID',        value: `\`${member.id}\``,                                               inline: true },
      { name: 'Kicked by',      value: executor ? `${executor}` : 'Left voluntarily',                    inline: true },
      { name: 'Joined',         value: member.joinedAt ? `${ts(member.joinedAt)}\n${tsRel(member.joinedAt)}` : 'Unknown', inline: true },
      { name: 'Was Member For', value: member.joinedAt ? fmtDuration(Date.now() - member.joinedTimestamp) : 'Unknown', inline: true },
      { name: `Roles [${member.roles.cache.size - 1}]`, value: roles },
    )
  );
});

// ─────────────────────────────────────────────────────────────────
//  VOICE STATE
// ─────────────────────────────────────────────────────────────────
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member ?? oldState.member;
  if (!member) return;

  const joined = !oldState.channelId &&  newState.channelId;
  const left   =  oldState.channelId && !newState.channelId;
  const moved  =  oldState.channelId &&  newState.channelId && oldState.channelId !== newState.channelId;

  const mutedNow   = !oldState.mute      && newState.mute;
  const unmutedNow =  oldState.mute      && !newState.mute;
  const deafNow    = !oldState.deaf      && newState.deaf;
  const undeafNow  =  oldState.deaf      && !newState.deaf;
  const streamNow  = !oldState.streaming && newState.streaming;
  const streamEnd  =  oldState.streaming && !newState.streaming;
  const videoNow   = !oldState.selfVideo && newState.selfVideo;
  const videoEnd   =  oldState.selfVideo && !newState.selfVideo;

  if (joined) {
    const chName = newState.channel?.name ?? '*unknown*';
    const chSize = newState.channel?.members.size ?? '?';
    await sendLog(member.guild, embed(SUCCESS)
      .setTitle('🔊 Joined Voice Channel')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User',               value: `${member} (${member.user.tag})`, inline: true },
        { name: 'Channel',            value: `**${chName}**`,                   inline: true },
        { name: 'Channel ID',         value: `\`${newState.channelId}\``,       inline: true },
        { name: 'Members in channel', value: `${chSize}`,                       inline: true },
      ));

  } else if (left) {
    const chName = oldState.channel?.name ?? '*deleted channel*';
    const chSize = oldState.channel?.members.size ?? '?';
    await sendLog(member.guild, embed(WARN)
      .setTitle('🔇 Left Voice Channel')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User',              value: `${member} (${member.user.tag})`, inline: true },
        { name: 'Channel',           value: `**${chName}**`,                  inline: true },
        { name: 'Channel ID',        value: `\`${oldState.channelId}\``,      inline: true },
        { name: 'Members remaining', value: `${chSize}`,                      inline: true },
      ));

  } else if (moved) {
    const fromName = oldState.channel?.name ?? '*deleted channel*';
    const toName   = newState.channel?.name ?? '*deleted channel*';
    await sendLog(member.guild, embed(INFO)
      .setTitle('↔️ Switched Voice Channel')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${member} (${member.user.tag})`,                          inline: false },
        { name: 'From', value: `**${fromName}**\n\`${oldState.channelId}\``,              inline: true  },
        { name: 'To',   value: `**${toName}**\n\`${newState.channelId}\``,                inline: true  },
      ));

  } else {
    const changes = [];
    if (mutedNow)   changes.push('🔇 Server muted');
    if (unmutedNow) changes.push('🔊 Server unmuted');
    if (deafNow)    changes.push('🙉 Server deafened');
    if (undeafNow)  changes.push('👂 Server undeafened');
    if (streamNow)  changes.push('📺 Started streaming');
    if (streamEnd)  changes.push('⏹️ Stopped streaming');
    if (videoNow)   changes.push('📷 Turned camera on');
    if (videoEnd)   changes.push('📵 Turned camera off');
    if (!changes.length) return;

    await sendLog(member.guild, embed(DARK)
      .setTitle('🎛️ Voice State Changed')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User',    value: `${member} (${member.user.tag})`,                                      inline: true },
        { name: 'Channel', value: newState.channel ? `**${newState.channel.name}**` : '*Unknown*',       inline: true },
        { name: 'Changes', value: changes.join('\n') },
      ));
  }
});

// ─────────────────────────────────────────────────────────────────
//  MESSAGE BULK DELETED
// ─────────────────────────────────────────────────────────────────
client.on(Events.MessageBulkDelete, async (messages, channel) => {
  if (!channel.guild) return;

  const executor = await getAuditExecutor(channel.guild, AuditLogEvent.MessageBulkDelete, channel.id);
  const lines    = messages.map(m =>
    `[${m.createdAt?.toUTCString() ?? '?'}] ${m.author?.tag ?? 'Unknown'}: ${m.content?.slice(0, 100) ?? '[no text]'}`
  ).join('\n');

  await sendLog(channel.guild, embed(DANGER)
    .setTitle('🗑️ Bulk Delete')
    .addFields(
      { name: 'Channel',    value: `${channel}`,                             inline: true },
      { name: 'Count',      value: `${messages.size} messages`,              inline: true },
      { name: 'Deleted by', value: executor ? `${executor}` : '*Unknown*',  inline: true },
      { name: 'Messages',   value: lines.slice(0, 1024) || '*none cached*' },
    )
  );
});

// ─────────────────────────────────────────────────────────────────
//  MESSAGE EDITED
// ─────────────────────────────────────────────────────────────────
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (!newMsg.guild) return;
  if (newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  if (newMsg.channelId === process.env.LOG_CHANNEL_ID) return;

  const msgLink = `https://discord.com/channels/${newMsg.guildId}/${newMsg.channelId}/${newMsg.id}`;

  await sendLog(newMsg.guild, embed(INFO)
    .setTitle('✏️ Message Edited')
    .setThumbnail(newMsg.author?.displayAvatarURL({ size: 128 }) ?? null)
    .addFields(
      { name: 'Author',    value: `${newMsg.author} (\`${newMsg.author?.tag}\`)`, inline: true },
      { name: 'Channel',   value: `${newMsg.channel}`,                            inline: true },
      { name: 'Jump',      value: `[View message](${msgLink})`,                   inline: true },
      { name: '📝 Before', value: (oldMsg.content?.slice(0, 1024)) || '*not cached*' },
      { name: '📝 After',  value: newMsg.content?.slice(0, 1024) || '*empty*' },
    )
  );
});

// ─────────────────────────────────────────────────────────────────
//  CHANNEL CREATED
// ─────────────────────────────────────────────────────────────────
client.on(Events.ChannelCreate, async channel => {
  if (!channel.guild) return;
  const executor = await getAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);

  await sendLog(channel.guild, embed(SUCCESS)
    .setTitle('📢 Channel Created')
    .addFields(
      { name: 'Name',       value: `${channel}`,                                    inline: true },
      { name: 'Type',       value: CH_TYPE[channel.type] ?? `Type ${channel.type}`, inline: true },
      { name: 'Created by', value: executor ? `${executor}` : '*Unknown*',          inline: true },
      { name: 'Channel ID', value: `\`${channel.id}\``,                             inline: true },
      { name: 'Category',   value: channel.parent?.name ?? 'None',                  inline: true },
      { name: 'NSFW',       value: channel.nsfw ? 'Yes ⚠️' : 'No',                 inline: true },
    )
  );
});

// ─────────────────────────────────────────────────────────────────
//  CHANNEL DELETED
// ─────────────────────────────────────────────────────────────────
client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;
  const executor = await getAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);

  await sendLog(channel.guild, embed(DANGER)
    .setTitle('🗑️ Channel Deleted')
    .addFields(
      { name: 'Name',       value: `#${channel.name}`,                               inline: true },
      { name: 'Type',       value: CH_TYPE[channel.type] ?? `Type ${channel.type}`,  inline: true },
      { name: 'Deleted by', value: executor ? `${executor}` : '*Unknown*',           inline: true },
      { name: 'Channel ID', value: `\`${channel.id}\``,                              inline: true },
      { name: 'Category',   value: channel.parent?.name ?? 'None',                   inline: true },
      { name: 'Topic',      value: channel.topic ?? 'None',                           inline: false },
    )
  );
});

// ─────────────────────────────────────────────────────────────────
//  CHANNEL UPDATED
// ─────────────────────────────────────────────────────────────────
client.on(Events.ChannelUpdate, async (oldCh, newCh) => {
  if (!newCh.guild) return;

  const changes = [];
  if (oldCh.name             !== newCh.name)             changes.push({ name: 'Name',     before: oldCh.name,                         after: newCh.name });
  if (oldCh.topic            !== newCh.topic)            changes.push({ name: 'Topic',    before: oldCh.topic || '*none*',             after: newCh.topic || '*none*' });
  if (oldCh.nsfw             !== newCh.nsfw)             changes.push({ name: 'NSFW',     before: String(oldCh.nsfw),                  after: String(newCh.nsfw) });
  if (oldCh.rateLimitPerUser !== newCh.rateLimitPerUser) changes.push({ name: 'Slowmode', before: `${oldCh.rateLimitPerUser}s`,        after: `${newCh.rateLimitPerUser}s` });
  if (!changes.length) return;

  const executor = await getAuditExecutor(newCh.guild, AuditLogEvent.ChannelUpdate, newCh.id);

  const e = embed(INFO)
    .setTitle('🔧 Channel Updated')
    .addFields(
      { name: 'Channel',    value: `${newCh}`,                              inline: true },
      { name: 'Updated by', value: executor ? `${executor}` : '*Unknown*', inline: true },
      { name: 'Channel ID', value: `\`${newCh.id}\``,                      inline: true },
    );

  for (const c of changes) {
    e.addFields(
      { name: `${c.name} — Before`, value: String(c.before).slice(0, 512), inline: true },
      { name: `${c.name} — After`,  value: String(c.after).slice(0, 512),  inline: true },
      { name: '\u200b',             value: '\u200b',                        inline: true },
    );
  }

  await sendLog(newCh.guild, e);
});

// ─────────────────────────────────────────────────────────────────
//  NICKNAME & ROLE CHANGES
// ─────────────────────────────────────────────────────────────────
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (!newMember.user || !oldMember.user) return;

  const nickChanged  = oldMember.nickname !== newMember.nickname;
  const addedRoles   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

  if (nickChanged) {
    const executor = await getAuditExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
    await sendLog(newMember.guild, embed(INFO)
      .setTitle('✏️ Nickname Changed')
      .setThumbnail(newMember.user.displayAvatarURL())
      .addFields(
        { name: 'User',       value: `${newMember} (${newMember.user.tag})`, inline: true },
        { name: 'Changed by', value: executor ? `${executor}` : '*Self*',    inline: true },
        { name: '\u200b',     value: '\u200b',                               inline: true },
        { name: 'Before',     value: oldMember.nickname ?? '*None*',          inline: true },
        { name: 'After',      value: newMember.nickname ?? '*None*',          inline: true },
      )
    );
  }

  if (addedRoles.size || removedRoles.size) {
    const executor = await getAuditExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
    const e = embed(INFO)
      .setTitle('🏷️ Roles Updated')
      .setThumbnail(newMember.user.displayAvatarURL())
      .addFields(
        { name: 'User',       value: `${newMember} (${newMember.user.tag})`, inline: true },
        { name: 'Updated by', value: executor ? `${executor}` : '*Unknown*', inline: true },
      );
    if (addedRoles.size)   e.addFields({ name: '✅ Roles Added',   value: addedRoles.map(r => `${r}`).join(' ') });
    if (removedRoles.size) e.addFields({ name: '❌ Roles Removed', value: removedRoles.map(r => `${r}`).join(' ') });
    await sendLog(newMember.guild, e);
  }
});

// ─────────────────────────────────────────────────────────────────
//  AVATAR CHANGE
// ─────────────────────────────────────────────────────────────────
client.on(Events.UserUpdate, async (oldUser, newUser) => {
  // Compare raw avatar hashes, not URLs (which can differ by format/size)
  if (oldUser.avatar === newUser.avatar) return;

  for (const guild of client.guilds.cache.values()) {
    if (!guild.members.cache.has(newUser.id)) continue;
    await sendLog(guild, embed(INFO)
      .setTitle('🖼️ Avatar Changed')
      .addFields({ name: 'User', value: `${newUser.tag} (\`${newUser.id}\`)` })
      .setThumbnail(oldUser.displayAvatarURL({ size: 256 }))
      .setImage(newUser.displayAvatarURL({ size: 256 }))
      .setFooter({ text: 'Thumbnail = old  ·  Image below = new' })
    );
    break;
  }
});
// custom replies section

client.on('messageCreate', (message) => {
  if (message.author.bot) return; // Ignore bots

  if (message.content.includes('😡')) {
    message.reply('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQgSA5Y9bgTXp94O7Fp2NXA5-2NonoH-6OW1Q&s');
  }
});



// ================================================================
//  GRACEFUL SHUTDOWN
// ================================================================
function shutdown(signal) {
  console.log(`\n[Candooda] Received ${signal}, shutting down…`);
  fs.unwatchFile(BANNED_WORDS_FILE);
  client.destroy();
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ================================================================
//  GLOBAL ERROR SAFETY
// ================================================================
process.on('unhandledRejection', e => console.error('[Candooda] Unhandled rejection:', e));
process.on('uncaughtException',  e => console.error('[Candooda] Uncaught exception:',  e));

// ── Start ────────────────────────────────────────────────────────
client.login(process.env.TOKEN);