'use strict';

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

module.exports = { sendLog };
