'use strict';

require('dotenv').config();

const client = require('./client');
const { registerEvents } = require('./events');
const { watchBannedWords, unwatchBannedWords } = require('./data/automod');
const { BANNED_WORDS } = require('./config/paths');

watchBannedWords();
registerEvents(client);

function shutdown(signal) {
  console.log(`\n[Candooda] Received ${signal}, shutting down…`);
  unwatchBannedWords();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', e => console.error('[Candooda] Unhandled rejection:', e));
process.on('uncaughtException',  e => console.error('[Candooda] Uncaught exception:',  e));

client.login(process.env.TOKEN);
