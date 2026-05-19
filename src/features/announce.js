'use strict';

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { BRAND } = require('../config/constants');
const { embed } = require('../utils/embed');

const ANNOUNCE_RE = /^(?:-)?announce:\s*([\s\S]+)/i;

const USAGE = [
  '**Usage** (pipe or `---` blocks):',
  '`-announce: Title | Body | Footer | #channel | tag | media-url`',
  '',
  '**Tag:** `user` · `here` · `everyone` · `none` · or mention `@Someone`',
  '**Channel:** `#name` · `<#id>` · or channel ID',
  '**Media:** optional image/GIF URL (6th field)',
  '',
  '**Multiline example:**',
  '```',
  '-announce:',
  'Title',
  '---',
  'Body line 1',
  'Body line 2',
  '---',
  'Footer text',
  '---',
  '#announcements',
  '---',
  'everyone',
  '---',
  'https://example.com/image.png',
  '```',
].join('\n');

function unescapeNewlines(s) {
  return s.replace(/\\n/g, '\n');
}

function parseFields(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parts;
  if (/\n---\r?\n/.test(trimmed)) {
    parts = trimmed.split(/\n---\r?\n/).map(p => p.trim());
  } else {
    parts = trimmed.split(/\s*\|\s*/).map(p => p.trim());
  }

  if (parts.length < 4) return null;

  if (parts.length === 4) {
    return {
      title: parts[0],
      body: unescapeNewlines(parts[1]),
      footer: parts[2],
      channelRaw: parts[3],
      tag: 'none',
      media: null,
    };
  }

  if (parts.length === 5) {
    return {
      title: parts[0],
      body: unescapeNewlines(parts[1]),
      footer: parts[2],
      channelRaw: parts[3],
      tag: parts[4],
      media: null,
    };
  }

  if (parts.length === 6) {
    return {
      title: parts[0],
      body: unescapeNewlines(parts[1]),
      footer: parts[2],
      channelRaw: parts[3],
      tag: parts[4],
      media: /^https?:\/\//i.test(parts[5]) ? parts[5] : null,
    };
  }

  // Body may contain `|` — keep first title, last four slots, join the middle as body.
  return {
    title: parts[0],
    body: unescapeNewlines(parts.slice(1, parts.length - 4).join('\n')),
    footer: parts[parts.length - 4],
    channelRaw: parts[parts.length - 3],
    tag: parts[parts.length - 2],
    media: /^https?:\/\//i.test(parts[parts.length - 1]) ? parts[parts.length - 1] : null,
  };
}

function resolveChannel(guild, raw) {
  if (!raw) return null;

  const mention = raw.match(/^<#(\d+)>$/);
  if (mention) return guild.channels.cache.get(mention[1]) ?? null;

  if (/^\d{17,20}$/.test(raw)) {
    return guild.channels.cache.get(raw) ?? null;
  }

  const name = raw.replace(/^#/, '').toLowerCase();
  return guild.channels.cache.find(
    ch => ch.isTextBased() && ch.name.toLowerCase() === name,
  ) ?? null;
}

function buildPingContent(tagRaw, authorId) {
  const t = (tagRaw ?? '').trim().toLowerCase();

  if (!t || t === 'none' || t === '-') return '';

  if (t === 'user' || t === '<user>') return `<@${authorId}>`;
  if (t === 'here' || t === '@here' || t === '<here>') return '@here';
  if (t === 'everyone' || t === '@everyone' || t === '<everyone>' || t === 'heveryone') {
    return '@everyone';
  }

  const userMention = tagRaw.match(/^<@!?(\d+)>$/);
  if (userMention) return `<@${userMention[1]}>`;

  if (/^\d{17,20}$/.test(tagRaw)) return `<@${tagRaw}>`;

  return tagRaw;
}

async function handleAnnounce(message) {
  const match = message.content.trim().match(ANNOUNCE_RE);
  if (!match) return false;

  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply('❌ You need **Administrator** permission to use `announce:`.').catch(() => {});
    return true;
  }

  const fields = parseFields(match[1]);
  if (!fields?.title || !fields.body) {
    await message.reply({ content: USAGE }).catch(() => {});
    return true;
  }

  const target = resolveChannel(message.guild, fields.channelRaw);
  if (!target?.isTextBased()) {
    await message.reply('❌ Could not find that channel. Use `#name`, `<#id>`, or a channel ID.').catch(() => {});
    return true;
  }

  const me = message.guild.members.me;
  if (!target.permissionsFor(me)?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ])) {
    await message.reply(`❌ I cannot send embeds in ${target}.`).catch(() => {});
    return true;
  }

  const e = embed(BRAND)
    .setTitle(fields.title.slice(0, 256))
    .setDescription(fields.body.slice(0, 4096));

  if (fields.footer) e.setFooter({ text: fields.footer.slice(0, 2048) });
  if (fields.media) e.setImage(fields.media);

  const ping = buildPingContent(fields.tag, message.author.id);
  const allowedMentions = { parse: [] };
  if (ping === '@here' || ping === '@everyone') {
    allowedMentions.parse = ['everyone'];
  } else if (ping.startsWith('<@')) {
    allowedMentions.users = [ping.replace(/\D/g, '')];
  }

  try {
    await target.send({
      content: ping || undefined,
      embeds: [e],
      allowedMentions,
    });
  } catch (sendErr) {
    await message.reply(`❌ Failed to send announce: ${sendErr.message}`).catch(() => {});
    return true;
  }

  const confirm = embed(BRAND)
    .setTitle('✅ Announcement sent')
    .setDescription(`Posted in ${target}${fields.media ? `\nMedia: ${fields.media}` : ''}`);

  await message.reply({ embeds: [confirm] }).catch(() => {});

  if (message.channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages)) {
    await message.delete().catch(() => {});
  }

  return true;
}

module.exports = { handleAnnounce, USAGE };
