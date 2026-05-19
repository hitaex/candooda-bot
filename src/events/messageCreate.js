'use strict';

const { Events } = require('discord.js');
const { DANGER } = require('../config/constants');
const ROULETTE_CFG = require('../config/roulette');
const { embed } = require('../utils/embed');
const { sendLog } = require('../utils/logger');
const { getBannedWordRegs } = require('../data/automod');
const { handleRoulettePrefix } = require('../features/roulette/handler');
const { handleAnnounce } = require('../features/announce');

function register(client) {
  client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;
  if (process.env.PRISON_CHANNEL_ID && message.channelId === process.env.PRISON_CHANNEL_ID) return;

  const content = message.content;
  const matched = getBannedWordRegs().find(({ re }) => re.test(content));
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

  client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    if (await handleAnnounce(message)) return;

    if (message.content.includes('😡')) {
      message.reply('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQgSA5Y9bgTXp94O7Fp2NXA5-2NonoH-6OW1Q&s');
      return;
    }

    const content = message.content.toLowerCase().replace(/\s{2,}/g, ' ').trim();
    const { prefix, rouletteNames, stopNames, resolvePrefixCommand } = ROULETTE_CFG;

    const cmdName = resolvePrefixCommand(content, prefix, [...rouletteNames, ...stopNames]);
    if (!cmdName) return;

    await handleRoulettePrefix(message, cmdName);
  });
}

module.exports = { register };
