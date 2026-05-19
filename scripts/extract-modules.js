'use strict';

const fs = require('fs');
const path = require('path');

const bak = fs.readFileSync(path.join(__dirname, '../index.js.bak'), 'utf8');
const lines = bak.split('\n');

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

const root = path.join(__dirname, '..', 'src');

// ── commands/handler.js body: lines 742-1267 (inside interaction handler)
const handlerBody = slice(742, 1267);

fs.writeFileSync(path.join(root, 'commands/handler.js'), `'use strict';

const {
  PermissionFlagsBits, PermissionsBitField, ChannelType, EmbedBuilder,
} = require('discord.js');
const client = require('../client');
const {
  BRAND, SUCCESS, DANGER, WARN, INFO, DARK, GOLD, GRIM,
  DURATION_MAP, BALL_RESPONSES,
} = require('../config/constants');
const ROULETTE_CFG = require('../config/roulette');
const { embed, err } = require('../utils/embed');
const { fmtDuration, ts, tsRel } = require('../utils/time');
const { cooldown } = require('../utils/cooldown');
const { sendLog } = require('../utils/logger');
const {
  reactionRoles, imprisonedUsers,
} = require('../data/stores');
const { handleRouletteSlash } = require('../features/roulette/handler');

async function handleSlashCommand(interaction) {
  const { commandName: cmd, guild, member } = interaction;

${handlerBody}
}

module.exports = { handleSlashCommand };
`);

// ── roulette handler: lines 557-726
const rouletteBody = slice(557, 726).replace(/^async function handleRouletteSlash/, 'async function handleRouletteSlash');

fs.writeFileSync(path.join(root, 'features/roulette/handler.js'), `'use strict';

const { PermissionFlagsBits } = require('discord.js');
const ROULETTE_CFG = require('../../config/roulette');
const { embed, err } = require('../../utils/embed');
const { rouletteGames } = require('../../data/stores');
const {
  getMultipleButtons, disabledMultipleButtons,
  startRoundRoulette, getRandomDarkHexCode, getRandomNumber,
} = require('./functions');
const { sendDM } = require('./dm');

function buildRouletteDescription(players) {
  if (!players.length) return '__**اللاعبين:**__\\nلا يوجد لاعبين مشاركين باللعبة';
  return '__**اللاعبين:**__\\n' + [...players]
    .sort((a, b) => a.number - b.number)
    .map(p => \`\\\`\${String(p.number + 1).padStart(2, '0')}\\\`: <@\${p.id}>\`)
    .join('\\n');
}

function rouletteCanHost(member) {
  return member.permissions.has(PermissionFlagsBits.ManageEvents);
}

${rouletteBody}

/** Prefix-command shim → same handler */
async function handleRoulettePrefix(message, cmdName) {
  let replyMsg;
  const shim = {
    commandName: cmdName,
    guild: message.guild,
    member: message.member,
    user: message.author,
    channel: message.channel,
    guildId: message.guild.id,
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

module.exports = { handleRouletteSlash, handleRoulettePrefix, buildRouletteDescription };
`);

// Extract sendDM from functions.js - I'll add dm.js

// ── hall of fame: lines 1274-1375
const hofBody = slice(1274, 1375);

fs.writeFileSync(path.join(root, 'features/hallOfFame.js'), `'use strict';

const { EmbedBuilder } = require('discord.js');
const {
  GOLD, GRIM, HOF_THRESHOLD, HOS_THRESHOLD, HOF_LOCK_FLOOR, HOS_LOCK_FLOOR,
} = require('../config/constants');
const { hofPosts, hosPosts, boardInFlight } = require('../data/stores');

${hofBody}

module.exports = { handleBoardReaction };
`);

// ── logging events: message delete 1404-1451, bulk, update, voice, channels, member, user
const loggingParts = [
  { file: 'messageDelete.js', start: 1404, end: 1451, wrap: true },
  { file: 'messageBulkDelete.js', start: 1653, end: 1670 },
  { file: 'messageUpdate.js', start: 1675, end: 1694 },
  { file: 'voiceState.js', start: 1572, end: 1648 },
  { file: 'channel.js', start: 1699, end: 1768 },
  { file: 'memberUpdate.js', start: 1773, end: 1808 },
  { file: 'userUpdate.js', start: 1813, end: 1828 },
];

const loggingHeader = `'use strict';

const { Events, AuditLogEvent } = require('discord.js');
const { SUCCESS, DANGER, WARN, INFO, DARK, CH_TYPE } = require('../config/constants');
const { embed } = require('../utils/embed');
const { ts, tsRel, fmtDuration } = require('../utils/time');
const { sendLog } = require('../utils/logger');
const { getAuditExecutor } = require('../utils/audit');
const { reactionRoles } = require('../data/stores');

function register(client) {
`;

const loggingFooter = `
}

module.exports = { register };
`;

for (const p of loggingParts) {
  let body = slice(p.start, p.end);
  if (p.wrap) {
    body = body.replace(/^client\.on\(Events\.MessageDelete/, '  client.on(Events.MessageDelete');
  } else {
    body = body.replace(/^client\.on\(/gm, '  client.on(');
  }
  fs.writeFileSync(
    path.join(root, 'events', p.file),
    loggingHeader + body + loggingFooter,
  );
}

// member join/leave
fs.writeFileSync(path.join(root, 'events/guildMemberAdd.js'), `'use strict';

const { Events } = require('discord.js');
const { SUCCESS } = require('../config/constants');
const { embed } = require('../utils/embed');
const { ts, tsRel } = require('../utils/time');
const { sendLog } = require('../utils/logger');
const { resolveUsedInvite } = require('../utils/invites');
const { sendWelcomeDM } = require('../features/welcome');

function register(client) {
${slice(1490, 1536).replace(/^client\.on\(/gm, '  client.on(')}
}

module.exports = { register };
`);

fs.writeFileSync(path.join(root, 'events/guildMemberRemove.js'), `'use strict';

const { Events, AuditLogEvent } = require('discord.js');
const { DANGER } = require('../config/constants');
const { embed } = require('../utils/embed');
const { ts, tsRel, fmtDuration } = require('../utils/time');
const { sendLog } = require('../utils/logger');
const { getAuditExecutor } = require('../utils/audit');

function register(client) {
${slice(1544, 1567).replace(/^client\.on\(/gm, '  client.on(')}
}

module.exports = { register };
`);

fs.writeFileSync(path.join(root, 'events/guildCreate.js'), `'use strict';

const { Events } = require('discord.js');
const { snapshotInvites } = require('../utils/invites');

function register(client) {
  client.on(Events.GuildCreate, guild => snapshotInvites(guild));
}

module.exports = { register };
`);

// reactions
fs.writeFileSync(path.join(root, 'events/reactions.js'), `'use strict';

const { Events } = require('discord.js');
const { reactionRoles } = require('../data/stores');
const { handleBoardReaction } = require('../features/hallOfFame');

async function handleReaction(reaction, user, add) {
  if (user.bot) return;
  if (reaction.partial) try { await reaction.fetch(); } catch { return; }

  const emoji = reaction.emoji.id
    ? \`<:\${reaction.emoji.name}:\${reaction.emoji.id}>\`
    : reaction.emoji.name;

  const roleId = reactionRoles.get(\`\${reaction.message.id}:\${emoji}\`);
  if (!roleId) return;

  try {
    const m = await reaction.message.guild.members.fetch(user.id);
    if (add) await m.roles.add(roleId);
    else     await m.roles.remove(roleId);
  } catch (e) { console.error('[ReactionRole]', e.message); }
}

function register(client) {
  client.on(Events.MessageReactionAdd,    (r, u) => handleBoardReaction(r, u, true));
  client.on(Events.MessageReactionRemove, (r, u) => handleBoardReaction(r, u, false));
  client.on(Events.MessageReactionAdd,    (r, u) => handleReaction(r, u, true));
  client.on(Events.MessageReactionRemove, (r, u) => handleReaction(r, u, false));
}

module.exports = { register };
`);

// automod + custom + roulette prefix message handler
fs.writeFileSync(path.join(root, 'events/messageCreate.js'), `'use strict';

const { Events } = require('discord.js');
const { DANGER } = require('../config/constants');
const ROULETTE_CFG = require('../config/roulette');
const { embed } = require('../utils/embed');
const { sendLog } = require('../utils/logger');
const { getBannedWordRegs } = require('../data/automod');
const { handleRoulettePrefix } = require('../features/roulette/handler');

function register(client) {
${slice(1456, 1481).replace(/^client\.on\([^)]+\), async /gm, '  client.on(Events.MessageCreate, async ').replace(/^client\.on\(Events\.MessageCreate/, '  client.on(Events.MessageCreate')}

  client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    if (message.content.includes('😡')) {
      message.reply('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQgSA5Y9bgTXp94O7Fp2NXA5-2NonoH-6OW1Q&s');
      return;
    }

    const content = message.content.toLowerCase().replace(/\\s{2,}/g, ' ').trim();
    const { prefix, rouletteNames, stopNames } = ROULETTE_CFG;
    if (!content.startsWith(prefix)) return;

    const cmdName = content.slice(prefix.length).split(/\\s+/)[0];
    if (!rouletteNames.includes(cmdName) && !stopNames.includes(cmdName)) return;

    await handleRoulettePrefix(message, cmdName);
  });
}

module.exports = { register };
`);

console.log('Extracted modules OK');
