"use strict";

const { PermissionFlagsBits } = require('discord.js');
const { embed, err } = require('../../utils/embed');
const { AternosProxyBot } = require('./aternos');

// Try to load mcping-js first; fall back to minecraft-server-util if available.
let pingLib = null;
try { pingLib = require('mcping-js'); } catch (e) { /* ignore */ }
let msu = null;
if (!pingLib) {
  try { msu = require('minecraft-server-util'); } catch (e) { /* ignore */ }
}

const HOST = process.env.MC_PING_HOST || 'livingprooof.aternos.me';
const PORT = parseInt(process.env.MC_PING_PORT || '31802', 10);

async function pingServer() {
  if (pingLib) {
    // mcping-js usage can vary; try a callback style if available
    try {
      const McPing = pingLib.MCPing || pingLib.MCClient || pingLib;
      return await new Promise((resolve, reject) => {
        try {
          const client = new McPing(HOST, PORT);
          // prefer callback-style ping
          if (typeof client.ping === 'function') {
            client.ping((err, res) => err ? reject(err) : resolve(res));
          } else if (typeof McPing.ping === 'function') {
            McPing.ping(HOST, PORT, (err, res) => err ? reject(err) : resolve(res));
          } else {
            reject(new Error('Unsupported mcping-js API')); 
          }
        } catch (e) { reject(e); }
      });
    } catch (e) {
      // fall through to other library
      pingLib = null;
    }
  }

  if (msu) {
    try {
      const { status } = msu;
      const res = await status(HOST, PORT, { timeout: 5000 });
      return res;
    } catch (e) {
      throw e;
    }
  }

  throw new Error('No ping library installed. Install `mcping-js` or `minecraft-server-util`.');
}

async function handleMinecraftCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'status') {
    await interaction.deferReply({ ephemeral: false }).catch(() => {});
    try {
      const data = await pingServer();
      // data shape varies depending on library; attempt to normalize
      let description = '', players = 'unknown', version = 'unknown', latency = 'unknown';
      if (data) {
        // minecraft-server-util response
        if (data.players || data.version) {
          players = data.players ? `${data.players.online}/${data.players.max}` : 'unknown';
          version = data.version?.name ?? data.version ?? 'unknown';
          latency = data.roundTripLatency ?? data.latency ?? 'unknown';
          description = data.description?.toString() ?? data.motd ?? '';
        } else {
          // mcping-js response (unknown structure) — stringify
          description = JSON.stringify(data);
        }
      }

      const e = embed().setTitle('Minecraft Server Status')
        .addFields(
          { name: 'Server', value: `${HOST}:${PORT}`, inline: true },
          { name: 'Status', value: `${description ? description : 'reachable'}`, inline: true },
          { name: 'Players', value: `${players}`, inline: true },
          { name: 'Version', value: `${version}`, inline: true },
          { name: 'Latency', value: `${latency}`, inline: true },
        );

      return interaction.editReply({ embeds: [e] }).catch(() => null);
    } catch (e) {
      return err(interaction, `Ping failed: ${e.message}`);
    }
  }

  if (sub === 'start') {
    await interaction.deferReply({ ephemeral: false }).catch(() => {});
    try {
      const bot = new AternosProxyBot({
        username: process.env.MC_USERNAME,
        password: process.env.MC_PASSWORD,
        serverId: process.env.MC_SERVER_ID,
        headless: process.env.MC_HEADLESS === 'true',
        useProxy: process.env.MC_USE_PROXY !== 'false',
      });

      await bot.init(bot.useProxy);
      await bot.login();
      const ok = await bot.startServer();
      await bot.close();
      if (ok) return interaction.editReply({ embeds: [embed().setDescription('✅ Server start requested.')] });
      return interaction.editReply({ embeds: [embed().setDescription('⚠️ Start request sent but could not confirm online status.')] });
    } catch (e) {
      return err(interaction, `Start failed: ${e.message}`);
    }
  }

  if (sub === 'stop') {
    // require Manage Events permission
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageEvents)) return err(interaction, 'You need **Manage Events** permission to stop the server.');

    await interaction.deferReply({ ephemeral: false }).catch(() => {});
    try {
      const bot = new AternosProxyBot({
        username: process.env.MC_USERNAME,
        password: process.env.MC_PASSWORD,
        serverId: process.env.MC_SERVER_ID,
        headless: process.env.MC_HEADLESS === 'true',
        useProxy: process.env.MC_USE_PROXY !== 'false',
      });

      await bot.init(bot.useProxy);
      await bot.login();
      const ok = await bot.stopServer();
      await bot.close();
      if (ok) return interaction.editReply({ embeds: [embed().setDescription('🛑 Server stop requested.')] });
      return interaction.editReply({ embeds: [embed().setDescription('⚠️ Stop request sent but server may still be online.')] });
    } catch (e) {
      return err(interaction, `Stop failed: ${e.message}`);
    }
  }

  return err(interaction, 'Unknown minecraft subcommand.');
}

module.exports = { handleMinecraftCommand };
