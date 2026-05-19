'use strict';

const fs = require('fs');
const { loadJSON } = require('../utils/json');
const { WIN_POINTS } = require('../config/paths');

let data = loadJSON(WIN_POINTS, {});

function save() {
  fs.writeFileSync(WIN_POINTS, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function getPoints(guildId, userId) {
  return data[guildId]?.[userId] ?? 0;
}

function setPoints(guildId, userId, points) {
  if (!data[guildId]) data[guildId] = {};
  if (points <= 0) {
    delete data[guildId][userId];
    if (!Object.keys(data[guildId]).length) delete data[guildId];
  } else {
    data[guildId][userId] = points;
  }
  save();
  return getPoints(guildId, userId);
}

function addPoints(guildId, userId, amount = 1) {
  return setPoints(guildId, userId, getPoints(guildId, userId) + amount);
}

function removePoints(guildId, userId, amount = 1) {
  const current = getPoints(guildId, userId);
  if (current < amount) return { ok: false, error: 'insufficient', balance: current };
  const balance = setPoints(guildId, userId, current - amount);
  return { ok: true, balance };
}

function transferPoints(guildId, fromId, toId, amount = 1) {
  if (fromId === toId) return { ok: false, error: 'same_user' };
  const fromBal = getPoints(guildId, fromId);
  if (fromBal < amount) return { ok: false, error: 'insufficient', balance: fromBal };
  setPoints(guildId, fromId, fromBal - amount);
  const toBalance = addPoints(guildId, toId, amount);
  return {
    ok: true,
    fromBalance: getPoints(guildId, fromId),
    toBalance,
  };
}

function getLeaderboard(guildId, limit = 10) {
  const bucket = data[guildId] ?? {};
  return Object.entries(bucket)
    .map(([userId, points]) => ({ userId, points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

module.exports = {
  getPoints,
  addPoints,
  removePoints,
  transferPoints,
  getLeaderboard,
};
