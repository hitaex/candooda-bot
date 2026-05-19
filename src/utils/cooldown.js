'use strict';

const { cooldowns } = require('../data/stores');

function cooldown(userId, cmd, secs = 3) {
  const key = `${userId}:${cmd}`;
  const now = Date.now();
  const exp = cooldowns.get(key);
  if (exp && now < exp) return parseFloat(((exp - now) / 1000).toFixed(1));
  cooldowns.set(key, now + secs * 1000);
  setTimeout(() => cooldowns.delete(key), secs * 1000);
  return 0;
}

module.exports = { cooldown };
