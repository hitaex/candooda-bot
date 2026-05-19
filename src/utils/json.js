'use strict';

const fs = require('fs');

function loadJSON(file, fallback) {
  try   { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

module.exports = { loadJSON };
