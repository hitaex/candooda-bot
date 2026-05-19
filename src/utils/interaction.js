'use strict';

const { MessageFlags } = require('discord.js');

const EPHEMERAL = MessageFlags.Ephemeral;

/** Ephemeral reply (discord.js v14+ — use flags, not deprecated `ephemeral`). */
async function replyEphemeral(interaction, content) {
  const payload = typeof content === 'string'
    ? { content, flags: EPHEMERAL }
    : { ...content, flags: (content.flags ?? 0) | EPHEMERAL };

  if (interaction.deferred || interaction.replied)
    return interaction.followUp(payload).catch(() => null);
  return interaction.reply(payload).catch(() => null);
}

/** Acknowledge a button click within Discord's 3s window. */
async function safeDeferUpdate(interaction) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferUpdate();
    return true;
  } catch (err) {
    // 10062 = unknown/expired interaction, 40060 = already acknowledged
    if (err.code === 10062 || err.code === 40060) return false;
    throw err;
  }
}

module.exports = { EPHEMERAL, replyEphemeral, safeDeferUpdate };
