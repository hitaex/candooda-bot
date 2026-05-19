'use strict';

const { Events } = require('discord.js');
const { snapshotInvites } = require('../utils/invites');

function register(client) {
  client.on(Events.GuildCreate, guild => snapshotInvites(guild));
}

module.exports = { register };
