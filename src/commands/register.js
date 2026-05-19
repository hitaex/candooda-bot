'use strict';

const { REST, Routes } = require('discord.js');
const { commands } = require('./definitions');

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

module.exports = { registerCommands, commands };
