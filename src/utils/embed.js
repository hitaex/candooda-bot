'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const { BRAND, DANGER } = require('../config/constants');

function embed(color = BRAND) {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

async function err(interaction, msg) {
  const e = embed(DANGER).setDescription(`❌  ${msg}`);
  const payload = { embeds: [e], flags: MessageFlags.Ephemeral };
  if (interaction.replied || interaction.deferred)
    return interaction.followUp(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}

module.exports = { embed, err };
