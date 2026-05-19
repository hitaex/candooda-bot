'use strict';

const { Events, ActivityType } = require('discord.js');
const { registerCommands } = require('../commands/register');
const { snapshotInvites } = require('../utils/invites');
const { printStartup } = require('../startup/printStartup');

function register(client) {
  client.once(Events.ClientReady, async () => {
    client.user.setActivity("over Candooda's server", { type: ActivityType.Watching });
    await registerCommands();

    for (const guild of client.guilds.cache.values()) {
      await snapshotInvites(guild);
    }

    printStartup(client);
  });
}

module.exports = { register };
