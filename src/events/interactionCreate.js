'use strict';

const { Events } = require('discord.js');
const { handleRouletteSlash } = require('../features/roulette/handler');
const { handleSlashCommand } = require('../commands/handler');

function register(client) {
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.guild || !interaction.member) return;

    if (!interaction.isChatInputCommand()) return;

    if (await handleRouletteSlash(interaction)) return;

    await handleSlashCommand(interaction);
  });
}

module.exports = { register };
