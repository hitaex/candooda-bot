'use strict';

const path = require('path');

module.exports = {
  ROOT:            path.join(__dirname, '../..'),
  BANNED_WORDS:    path.join(__dirname, '../../badwords.json'),
  WIN_POINTS:      path.join(__dirname, '../../win-points.json'),
};
