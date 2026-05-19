'use strict';

const fs = require('fs');
const { loadJSON } = require('../utils/json');
const { BANNED_WORDS } = require('../config/paths');

function buildWordRegexes(words) {
  return words.map(w => {
    const esc     = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isLatin = /^[\x00-\x7F]+$/.test(w);
    const pattern = isLatin ? `\\b${esc}\\b` : `(?<!\\S)${esc}(?!\\S)`;
    return { word: w, re: new RegExp(pattern, 'iu') };
  });
}

let bannedWords    = loadJSON(BANNED_WORDS, []);
let bannedWordRegs = buildWordRegexes(bannedWords);

function reloadBannedWords() {
  bannedWords    = loadJSON(BANNED_WORDS, bannedWords);
  bannedWordRegs = buildWordRegexes(bannedWords);
  console.log('[AutoMod] Reloaded badwords.json');
}

function watchBannedWords() {
  fs.watchFile(BANNED_WORDS, { interval: 2000 }, reloadBannedWords);
}

function unwatchBannedWords() {
  fs.unwatchFile(BANNED_WORDS);
}

function getBannedWords() {
  return bannedWords;
}

function getBannedWordRegs() {
  return bannedWordRegs;
}

module.exports = {
  getBannedWords,
  getBannedWordRegs,
  watchBannedWords,
  unwatchBannedWords,
};
