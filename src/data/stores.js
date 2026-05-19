'use strict';

const { Collection } = require('discord.js');

module.exports = {
  reactionRoles:   new Map(),
  imprisonedUsers: new Map(),
  cooldowns:       new Collection(),
  hofPosts:        new Map(),
  hosPosts:        new Map(),
  boardInFlight:   new Set(),
  inviteCache:     new Map(),
  rouletteGames:   new Map(),
};
