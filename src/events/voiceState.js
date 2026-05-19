'use strict';

const { Events, AuditLogEvent } = require('discord.js');
const { SUCCESS, DANGER, WARN, INFO, DARK, CH_TYPE } = require('../config/constants');
const { embed } = require('../utils/embed');
const { ts, tsRel, fmtDuration } = require('../utils/time');
const { sendLog } = require('../utils/logger');
const { getAuditExecutor } = require('../utils/audit');
const { reactionRoles } = require('../data/stores');

function register(client) {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member ?? oldState.member;
  if (!member) return;

  const joined = !oldState.channelId &&  newState.channelId;
  const left   =  oldState.channelId && !newState.channelId;
  const moved  =  oldState.channelId &&  newState.channelId && oldState.channelId !== newState.channelId;

  const mutedNow   = !oldState.mute      && newState.mute;
  const unmutedNow =  oldState.mute      && !newState.mute;
  const deafNow    = !oldState.deaf      && newState.deaf;
  const undeafNow  =  oldState.deaf      && !newState.deaf;
  const streamNow  = !oldState.streaming && newState.streaming;
  const streamEnd  =  oldState.streaming && !newState.streaming;
  const videoNow   = !oldState.selfVideo && newState.selfVideo;
  const videoEnd   =  oldState.selfVideo && !newState.selfVideo;

  if (joined) {
    const chName = newState.channel?.name ?? '*unknown*';
    const chSize = newState.channel?.members.size ?? '?';
    await sendLog(member.guild, embed(SUCCESS)
      .setTitle('🔊 Joined Voice Channel')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User',               value: `${member} (${member.user.tag})`, inline: true },
        { name: 'Channel',            value: `**${chName}**`,                   inline: true },
        { name: 'Channel ID',         value: `\`${newState.channelId}\``,       inline: true },
        { name: 'Members in channel', value: `${chSize}`,                       inline: true },
      ));

  } else if (left) {
    const chName = oldState.channel?.name ?? '*deleted channel*';
    const chSize = oldState.channel?.members.size ?? '?';
    await sendLog(member.guild, embed(WARN)
      .setTitle('🔇 Left Voice Channel')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User',              value: `${member} (${member.user.tag})`, inline: true },
        { name: 'Channel',           value: `**${chName}**`,                  inline: true },
        { name: 'Channel ID',        value: `\`${oldState.channelId}\``,      inline: true },
        { name: 'Members remaining', value: `${chSize}`,                      inline: true },
      ));

  } else if (moved) {
    const fromName = oldState.channel?.name ?? '*deleted channel*';
    const toName   = newState.channel?.name ?? '*deleted channel*';
    await sendLog(member.guild, embed(INFO)
      .setTitle('↔️ Switched Voice Channel')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${member} (${member.user.tag})`,                          inline: false },
        { name: 'From', value: `**${fromName}**\n\`${oldState.channelId}\``,              inline: true  },
        { name: 'To',   value: `**${toName}**\n\`${newState.channelId}\``,                inline: true  },
      ));

  } else {
    const changes = [];
    if (mutedNow)   changes.push('🔇 Server muted');
    if (unmutedNow) changes.push('🔊 Server unmuted');
    if (deafNow)    changes.push('🙉 Server deafened');
    if (undeafNow)  changes.push('👂 Server undeafened');
    if (streamNow)  changes.push('📺 Started streaming');
    if (streamEnd)  changes.push('⏹️ Stopped streaming');
    if (videoNow)   changes.push('📷 Turned camera on');
    if (videoEnd)   changes.push('📵 Turned camera off');
    if (!changes.length) return;

    await sendLog(member.guild, embed(DARK)
      .setTitle('🎛️ Voice State Changed')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User',    value: `${member} (${member.user.tag})`,                                      inline: true },
        { name: 'Channel', value: newState.channel ? `**${newState.channel.name}**` : '*Unknown*',       inline: true },
        { name: 'Changes', value: changes.join('\n') },
      ));
  }
});
}

module.exports = { register };
