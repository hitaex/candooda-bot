'use strict';

const {
  PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags,
} = require('discord.js');
const client = require('../client');
const {
  BRAND, SUCCESS, DANGER, WARN, INFO, DARK,
  DURATION_MAP, BALL_RESPONSES,
} = require('../config/constants');
const ROULETTE_CFG = require('../config/roulette');
const { embed, err } = require('../utils/embed');
const { fmtDuration, ts, tsRel } = require('../utils/time');
const { cooldown } = require('../utils/cooldown');
const { sendLog } = require('../utils/logger');
const {
  reactionRoles, imprisonedUsers,
} = require('../data/stores');
const { handlePointsCommand } = require('../features/points/handler');

async function handleSlashCommand(interaction) {
  const { commandName: cmd, guild, member } = interaction;

  if (cmd === 'points') {
    return handlePointsCommand(interaction);
  }

  // ─── /ping ───────────────────────────────────────────────────
  if (cmd === 'ping') {
    const sent = await interaction.reply({ content: '🏓 Pinging…', fetchReply: true });
    const rtt  = sent.createdTimestamp - interaction.createdTimestamp;
    return interaction.editReply({
      content: null,
      embeds: [embed(BRAND)
        .setTitle('🏓 Pong!')
        .addFields(
          { name: 'Bot Latency', value: `\`${rtt}ms\``,             inline: true },
          { name: 'WebSocket',   value: `\`${client.ws.ping}ms\``,  inline: true },
          { name: 'Uptime',      value: fmtDuration(client.uptime), inline: true },
        )],
    });
  }

  // ─── /help ───────────────────────────────────────────────────
  if (cmd === 'help') {
    return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [
      embed(BRAND)
        .setTitle('🌸 Candooda — Command Reference')
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          { name: '🔨 Moderation',  value: '`/timeout` `/ban` `/kick` `/warn` `/purge`' },
          { name: '🏛️ Prison',      value: '`/imprison` `/release`' },
          { name: '⭐ Reaction Roles', value: '`/reaction-role` `/reaction-roles-list`' },
          { name: '📋 Info',         value: '`/user` `/server` `/avatar` `/banner` `/ping`' },
          { name: '🎲 Fun',          value: '`/8ball` `/coinflip` `/dice` `/poll`' },
          { name: '🎡 Roulette',     value: `\`${ROULETTE_CFG.rouletteNames.map(n => '/' + n).join('` `')}\` · stop: \`${ROULETTE_CFG.stopNames.join('` `')}\` · prefix: \`${ROULETTE_CFG.prefix}روليت\` \`${ROULETTE_CFG.prefix}ر\`` },
          { name: '📢 Announce',     value: '`announce:` — Title · body · footer · channel · tag · media (Administrator)' },
          { name: '🏆 Win Points',   value: '`/points show` · `leaderboard` · `add` · `remove` · `give` · `transfer`' },
          { name: '🛡️ Auto-Mod',    value: 'Banned words are auto-detected. Edit `banned-words.json` (hot-reloads).' },
          { name: '📊 Stats',        value: `Servers: \`${client.guilds.cache.size}\` · Uptime: \`${fmtDuration(client.uptime)}\`` },
        )
        .setFooter({ text: 'Candooda v2.0 · All embeds use #E89EB8' }),
    ]});
  }

  // ─── /user ───────────────────────────────────────────────────
  if (cmd === 'user') {
    const target   = interaction.options.getMember('target') ?? member;
    const user     = target.user;
    const fullUser = await client.users.fetch(user.id, { force: true }).catch(() => user);

    const roles = target.roles.cache
      .filter(r => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `${r}`)
      .slice(0, 10)
      .join(' ') || 'None';

    const e = embed(BRAND)
      .setTitle(`👤 ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Display Name',    value: target.displayName ?? user.username,                  inline: true },
        { name: 'User ID',         value: `\`${user.id}\``,                                    inline: true },
        { name: 'Bot?',            value: user.bot ? 'Yes 🤖' : 'No',                          inline: true },
        { name: 'Account Created', value: `${ts(user.createdAt)}\n${tsRel(user.createdAt)}`,    inline: true },
        { name: 'Joined Server',   value: target.joinedAt ? `${ts(target.joinedAt)}\n${tsRel(target.joinedAt)}` : 'Unknown', inline: true },
        { name: 'Boosting Since',  value: target.premiumSince ? tsRel(target.premiumSince) : 'Not boosting', inline: true },
        { name: 'Nickname',        value: target.nickname ?? 'None',                            inline: true },
        { name: 'Highest Role',    value: `${target.roles.highest}`,                            inline: true },
        { name: 'Is Timed Out?',   value: target.isCommunicationDisabled() ? `Until ${tsRel(target.communicationDisabledUntil)}` : 'No', inline: true },
        { name: `Roles [${target.roles.cache.size - 1}]`, value: roles },
      );

    if (fullUser.bannerURL()) e.setImage(fullUser.bannerURL({ size: 512 }));

    return interaction.reply({ embeds: [e] });
  }

  // ─── /server ─────────────────────────────────────────────────
  if (cmd === 'server') {
    await interaction.deferReply();
    const g = guild;
    await g.fetch();

    const channels   = g.channels.cache;
    const textCount  = channels.filter(c => c.type === ChannelType.GuildText).size;
    const voiceCount = channels.filter(c => c.type === ChannelType.GuildVoice).size;
    const catCount   = channels.filter(c => c.type === ChannelType.GuildCategory).size;

    const members = g.memberCount;
    const bots    = g.members.cache.filter(m => m.user?.bot).size;

    const features = g.features.length
      ? g.features.map(f => `\`${f}\``).join(', ')
      : 'None';

    return interaction.editReply({ embeds: [
      embed(BRAND)
        .setTitle(`🏰 ${g.name}`)
        .setThumbnail(g.iconURL({ size: 256 }))
        .setImage(g.bannerURL({ size: 1024 }) ?? null)
        .addFields(
          { name: 'Server ID',    value: `\`${g.id}\``,                                          inline: true },
          { name: 'Owner',        value: `<@${g.ownerId}>`,                                       inline: true },
          { name: 'Created',      value: `${ts(g.createdAt)}`,                                    inline: true },
          { name: 'Members',      value: `👥 ${members} (🤖 ${bots} bots)`,                      inline: true },
          { name: 'Boost Level',  value: `Level ${g.premiumTier} · ${g.premiumSubscriptionCount} boosts`, inline: true },
          { name: 'Verification', value: `${['None','Low','Medium','High','Highest'][g.verificationLevel]}`, inline: true },
          { name: 'Channels',     value: `💬 ${textCount} text · 🔊 ${voiceCount} voice · 📁 ${catCount} categories`, inline: false },
          { name: 'Roles',        value: `${g.roles.cache.size}`,                                 inline: true },
          { name: 'Emojis',       value: `${g.emojis.cache.size}`,                               inline: true },
          { name: 'Stickers',     value: `${g.stickers.cache.size}`,                             inline: true },
          { name: 'Features',     value: features },
        ),
    ]});
  }

  // ─── /avatar ─────────────────────────────────────────────────
  if (cmd === 'avatar') {
    const target = interaction.options.getUser('target') ?? interaction.user;
    return interaction.reply({ embeds: [
      embed(BRAND)
        .setTitle(`🖼️ ${target.username}'s Avatar`)
        .setImage(target.displayAvatarURL({ size: 1024 }))
        .setURL(target.displayAvatarURL({ size: 1024 })),
    ]});
  }

  // ─── /banner ─────────────────────────────────────────────────
  if (cmd === 'banner') {
    const target   = interaction.options.getUser('target') ?? interaction.user;
    const fullUser = await client.users.fetch(target.id, { force: true }).catch(() => target);
    const url      = fullUser.bannerURL?.({ size: 1024 });
    if (!url) return err(interaction, 'That user has no banner set.');
    return interaction.reply({ embeds: [
      embed(BRAND)
        .setTitle(`🎨 ${fullUser.username}'s Banner`)
        .setImage(url)
        .setURL(url),
    ]});
  }

  // ─── /8ball ──────────────────────────────────────────────────
  if (cmd === '8ball') {
    const question = interaction.options.getString('question');
    const [dot, ans] = BALL_RESPONSES[Math.floor(Math.random() * BALL_RESPONSES.length)];
    return interaction.reply({ embeds: [
      embed(BRAND)
        .setTitle('🎱 Magic 8-Ball')
        .addFields(
          { name: '❓ Question', value: question },
          { name: `${dot} Answer`, value: `**${ans}**` },
        ),
    ]});
  }

  // ─── /coinflip ───────────────────────────────────────────────
  if (cmd === 'coinflip') {
    const result = Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!';
    return interaction.reply({ embeds: [
      embed(BRAND).setTitle('Coin Flip').setDescription(`**${result}**`),
    ]});
  }

  // ─── /dice ───────────────────────────────────────────────────
  if (cmd === 'dice') {
    const sides  = interaction.options.getInteger('sides') ?? 6;
    const result = Math.floor(Math.random() * sides) + 1;
    return interaction.reply({ embeds: [
      embed(BRAND)
        .setTitle('🎲 Dice Roll')
        .setDescription(`Rolled a **d${sides}** and got **${result}**!`),
    ]});
  }

  // ─── /poll ───────────────────────────────────────────────────
  if (cmd === 'poll') {
    const question = interaction.options.getString('question');
    const msg = await interaction.reply({ fetchReply: true, embeds: [
      embed(INFO)
        .setTitle('📊 Poll')
        .setDescription(`**${question}**`)
        .setFooter({ text: `Poll by ${interaction.user.username}` }),
    ]});
    await msg.react('✅').catch(() => {});
    await msg.react('❌').catch(() => {});
    return;
  }

  // ─── /reaction-roles-list ────────────────────────────────────
  if (cmd === 'reaction-roles-list') {
    if (!reactionRoles.size)
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed(WARN).setDescription('No reaction roles configured yet.')] });
    const lines = [...reactionRoles.entries()].map(([k, rId]) => {
      const colonIdx = k.indexOf(':');
      const msgId    = k.slice(0, colonIdx);
      const emoji    = k.slice(colonIdx + 1);
      return `Msg \`${msgId}\` · ${emoji} → <@&${rId}>`;
    });
    return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [
      embed(BRAND).setTitle('⭐ Active Reaction Roles').setDescription(lines.join('\n')),
    ]});
  }

  // ─── /reaction-role ──────────────────────────────────────────
  if (cmd === 'reaction-role') {
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles))
      return err(interaction, 'You need **Manage Roles** permission.');

    const channel   = interaction.options.getChannel('channel');
    const messageId = interaction.options.getString('message-id');
    const emoji     = interaction.options.getString('emoji');
    const role      = interaction.options.getRole('role');

    if (role.position >= guild.members.me.roles.highest.position)
      return err(interaction, 'That role is above my highest role.');

    let msg;
    try   { msg = await channel.messages.fetch(messageId); }
    catch { return err(interaction, 'Message not found — check channel and ID.'); }

    try   { await msg.react(emoji); }
    catch { return err(interaction, 'Cannot react with that emoji.'); }

    reactionRoles.set(`${messageId}:${emoji}`, role.id);

    return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [
      embed(SUCCESS)
        .setTitle('✅ Reaction Role Created')
        .addFields(
          { name: 'Channel', value: `${channel}`,       inline: true },
          { name: 'Message', value: `\`${messageId}\``, inline: true },
          { name: 'Emoji',   value: emoji,               inline: true },
          { name: 'Role',    value: `${role}`,           inline: true },
        ),
    ]});
  }

  // ================================================================
  //  MODERATION (all require cooldown check)
  // ================================================================
  const modCmds = ['timeout','ban','kick','warn','purge','imprison','release'];
  if (modCmds.includes(cmd)) {
    const rem = cooldown(member.id, cmd);
    if (rem) return err(interaction, `Cooldown active — wait **${rem}s**`);
  }

  // ─── /warn ───────────────────────────────────────────────────
  if (cmd === 'warn') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return err(interaction, 'You need **Moderate Members** permission.');

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');
    if (!target) return err(interaction, 'User not found.');

    const warnEmbed = embed(WARN)
      .setTitle('⚠️ You Have Been Warned')
      .setDescription(`You received a warning in **${guild.name}**`)
      .addFields({ name: 'Reason', value: reason });

    try { await target.send({ embeds: [warnEmbed] }); } catch { /* DMs closed */ }

    const logE = embed(WARN)
      .setTitle('⚠️ User Warned')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User',   value: `${target} (${target.user.tag})`, inline: true },
        { name: 'By',     value: `${member}`,                      inline: true },
        { name: 'Reason', value: reason },
      );
    await sendLog(guild, logE);
    console.log(`[MOD] ${member.user.tag} warned ${target.user.tag} — ${reason}`);
    return interaction.reply({ embeds: [logE] });
  }

  // ─── /purge ──────────────────────────────────────────────────
  if (cmd === 'purge') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages))
      return err(interaction, 'You need **Manage Messages** permission.');

    const amount     = interaction.options.getInteger('amount');
    const filterUser = interaction.options.getUser('user');
    const ch         = interaction.channel;

    let messages = await ch.messages.fetch({ limit: 100 });
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    messages = messages.filter(m => m.createdTimestamp > cutoff);
    if (filterUser) messages = messages.filter(m => m.author.id === filterUser.id);
    messages = [...messages.values()].slice(0, amount);

    if (!messages.length) return err(interaction, 'No eligible messages to delete.');

    const deleted = await ch.bulkDelete(messages, true).catch(() => null);
    const count   = deleted?.size ?? messages.length;

    const logE = embed(INFO)
      .setTitle('🗑️ Messages Purged')
      .addFields(
        { name: 'Count',   value: `${count}`, inline: true },
        { name: 'Channel', value: `${ch}`,    inline: true },
        { name: 'By',      value: `${member}`, inline: true },
      );
    if (filterUser) logE.addFields({ name: 'Filtered to', value: `${filterUser}`, inline: true });

    await sendLog(guild, logE);
    return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [
      embed(SUCCESS).setDescription(`✅ Deleted **${count}** messages.`),
    ]});
  }

  // ─── /timeout ────────────────────────────────────────────────
  if (cmd === 'timeout') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return err(interaction, 'You need **Moderate Members** permission.');

    const target   = interaction.options.getMember('user');
    const duration = interaction.options.getString('duration');
    const reason   = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target)             return err(interaction, 'User not found.');
    if (!target.moderatable) return err(interaction, 'I cannot moderate that user.');

    try {
      await target.timeout(DURATION_MAP[duration], reason);
    } catch (e) {
      console.error('[/timeout]', e.message);
      return err(interaction, `Failed to timeout user: ${e.message}`);
    }

    const e = embed(WARN)
      .setTitle('⏱️ User Timed Out')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User',     value: `${target}`, inline: true },
        { name: 'Duration', value: duration,     inline: true },
        { name: 'By',       value: `${member}`,  inline: true },
        { name: 'Reason',   value: reason },
      );
    await sendLog(guild, e);
    return interaction.reply({ embeds: [e] });
  }

  // ─── /ban ────────────────────────────────────────────────────
  if (cmd === 'ban') {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers))
      return err(interaction, 'You need **Ban Members** permission.');

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target)          return err(interaction, 'User not found.');
    if (!target.bannable) return err(interaction, 'I cannot ban that user.');

    // DM before ban so user can receive it while still in the server
    try { await target.send({ embeds: [
      embed(DANGER)
        .setTitle('🔨 You Have Been Banned')
        .setDescription(`You were banned from **${guild.name}**.\nReason: ${reason}`),
    ]}); } catch { /* DMs closed */ }

    try {
      await target.ban({ reason });
    } catch (e) {
      console.error('[/ban]', e.message);
      return err(interaction, `Failed to ban user: ${e.message}`);
    }

    const e = embed(DANGER)
      .setTitle('🔨 User Banned')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User',   value: target.user.tag, inline: true },
        { name: 'By',     value: `${member}`,      inline: true },
        { name: 'Reason', value: reason },
      );
    await sendLog(guild, e);
    return interaction.reply({ embeds: [e] });
  }

  // ─── /kick ───────────────────────────────────────────────────
  if (cmd === 'kick') {
    if (!member.permissions.has(PermissionFlagsBits.KickMembers))
      return err(interaction, 'You need **Kick Members** permission.');

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target)          return err(interaction, 'User not found.');
    if (!target.kickable) return err(interaction, 'I cannot kick that user.');

    try {
      await target.kick(reason);
    } catch (e) {
      console.error('[/kick]', e.message);
      return err(interaction, `Failed to kick user: ${e.message}`);
    }

    const e = embed(WARN)
      .setTitle('👢 User Kicked')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User',   value: target.user.tag, inline: true },
        { name: 'By',     value: `${member}`,      inline: true },
        { name: 'Reason', value: reason },
      );
    await sendLog(guild, e);
    return interaction.reply({ embeds: [e] });
  }

  // ─── /imprison ───────────────────────────────────────────────
  if (cmd === 'imprison') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return err(interaction, 'You need **Moderate Members** permission.');

    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target) return err(interaction, 'User not found.');
    if (imprisonedUsers.has(target.id)) return err(interaction, 'Already imprisoned.');
    if (!process.env.PRISON_CHANNEL_ID) return err(interaction, '`PRISON_CHANNEL_ID` not set in .env');

    // Mark as imprisoned immediately to prevent concurrent /imprison race
    imprisonedUsers.set(target.id, { guildId: guild.id, savedPerms: [] });

    await interaction.deferReply();

    // FIX: save the FULL permission override (all flags as raw bitfields),
    // not just a subset. On release we restore the complete override via .set().
    const savedPerms = [];

    for (const [, ch] of guild.channels.cache) {
      if (!ch.isTextBased()) continue;
      if (ch.id === process.env.PRISON_CHANNEL_ID) continue;
      try {
        const ow = ch.permissionOverwrites.cache.get(target.id);
        savedPerms.push({
          channelId: ch.id,
          allow: ow?.allow.bitfield ?? 0n,
          deny:  ow?.deny.bitfield  ?? 0n,
        });
        await ch.permissionOverwrites.edit(target.user, {
          SendMessages:  false,
          AddReactions:  false,
        });
      } catch { /* skip uneditable channels */ }
    }

    try {
      const prisonCh = guild.channels.cache.get(process.env.PRISON_CHANNEL_ID)
        ?? await guild.channels.fetch(process.env.PRISON_CHANNEL_ID).catch(() => null);
      if (prisonCh) await prisonCh.permissionOverwrites.edit(target.user, {
        ViewChannel:   true,
        SendMessages:  true,
        AddReactions:  false,
      });
    } catch { /* ignore */ }

    imprisonedUsers.set(target.id, { guildId: guild.id, savedPerms });

    const e = embed(DARK)
      .setTitle('🏛️ User Imprisoned')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User',   value: `${target}`, inline: true },
        { name: 'By',     value: `${member}`, inline: true },
        { name: 'Reason', value: reason },
      );

    try { await target.send({ embeds: [embed(DARK).setTitle('🏛️ You Have Been Imprisoned')
      .setDescription(`You may only speak in the designated channel in **${guild.name}**.\nReason: ${reason}`)] }); }
    catch { /* DMs closed */ }

    await sendLog(guild, e);
    return interaction.editReply({ embeds: [e] });
  }

  // ─── /release ────────────────────────────────────────────────
  if (cmd === 'release') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return err(interaction, 'You need **Moderate Members** permission.');

    const target = interaction.options.getMember('user');
    if (!target) return err(interaction, 'User not found.');
    if (!imprisonedUsers.has(target.id)) return err(interaction, 'That user is not imprisoned.');

    await interaction.deferReply();
    const { savedPerms } = imprisonedUsers.get(target.id);

    for (const { channelId, allow, deny } of savedPerms) {
      try {
        const ch = guild.channels.cache.get(channelId);
        if (!ch) continue;

        if (allow === 0n && deny === 0n) {
          // No custom override existed before — remove the one we added entirely
          await ch.permissionOverwrites.delete(target.user).catch(() => {});
        } else {
          // FIX: restore the complete saved bitfields using .set() so ALL
          // permission flags (not just SendMessages + AddReactions) are restored
          await ch.permissionOverwrites.set([
            ...ch.permissionOverwrites.cache.values(),
            {
              id:    target.id,
              allow: new PermissionsBitField(allow),
              deny:  new PermissionsBitField(deny),
              type:  1, // OverwriteType.Member
            },
          ]);
        }
      } catch { /* skip */ }
    }

    try {
      const prisonCh = guild.channels.cache.get(process.env.PRISON_CHANNEL_ID);
      if (prisonCh) await prisonCh.permissionOverwrites.delete(target.user);
    } catch { /* ignore */ }

    imprisonedUsers.delete(target.id);

    const e = embed(SUCCESS)
      .setTitle('🕊️ User Released')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target}`, inline: true },
        { name: 'By',   value: `${member}`, inline: true },
      );

    try { await target.send({ embeds: [embed(SUCCESS).setDescription(`🕊️ You've been released in **${guild.name}**. Welcome back!`)] }); }
    catch { /* DMs closed */ }

    await sendLog(guild, e);
    return interaction.editReply({ embeds: [e] });
  }
}

module.exports = { handleSlashCommand };
