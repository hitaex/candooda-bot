'use strict';

const fs = require('fs');
const path = require('path');

function registerEvents(client) {
  const dir = __dirname;
  for (const file of fs.readdirSync(dir)) {
    if (file === 'index.js') continue;
    const mod = require(path.join(dir, file));
    if (typeof mod.register === 'function') mod.register(client);
  }
}

module.exports = { registerEvents };
