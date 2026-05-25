'use strict';

const fs = require('fs');
const { loadJSON } = require('../utils/json');
const { UNO_GAMES } = require('../config/paths');

let data = loadJSON(UNO_GAMES, {});

function save() {
  fs.writeFileSync(UNO_GAMES, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function getGame(guildId) {
  const game = data[guildId];
  return game ? JSON.parse(JSON.stringify(game)) : null;
}

function setGame(guildId, game) {
  data[guildId] = game;
  save();
  return game;
}

function deleteGame(guildId) {
  if (data[guildId]) {
    delete data[guildId];
    save();
  }
}

function hasGame(guildId) {
  return Boolean(data[guildId]);
}

module.exports = {
  getGame,
  setGame,
  deleteGame,
  hasGame,
};
