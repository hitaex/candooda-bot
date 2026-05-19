'use strict';

const { EmbedBuilder } = require('discord.js');
const {
  GOLD, GRIM, HOF_THRESHOLD, HOS_THRESHOLD, HOF_LOCK_FLOOR, HOS_LOCK_FLOOR,
} = require('../config/constants');
const { hofPosts, hosPosts, boardInFlight } = require('../data/stores');

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

module.exports = { handleBoardReaction };
