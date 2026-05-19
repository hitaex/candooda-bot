'use strict';

const { ChannelType } = require('discord.js');

module.exports = {
  BRAND:   0xE89EB8,
  SUCCESS: 0x57F287,
  DANGER:  0xED4245,
  WARN:    0xFEE75C,
  INFO:    0x5865F2,
  DARK:    0x2C2F33,
  GOLD:    0xFFD700,
  GRIM:    0x36393F,

  DURATION_MAP: {
    '1m': 60_000,      '5m': 300_000,    '10m': 600_000,
    '30m': 1_800_000,  '1h': 3_600_000,  '1d': 86_400_000,
    '1w': 604_800_000,
  },

  CH_TYPE: {
    [ChannelType.GuildText]:         'Text',
    [ChannelType.GuildVoice]:        'Voice',
    [ChannelType.GuildCategory]:     'Category',
    [ChannelType.GuildAnnouncement]: 'Announcement',
    [ChannelType.GuildStageVoice]:   'Stage',
    [ChannelType.GuildForum]:        'Forum',
    [ChannelType.GuildMedia]:        'Media',
  },

  BALL_RESPONSES: [
    ['🟢', 'It is certain.'],         ['🟢', 'Without a doubt.'],
    ['🟢', 'Yes, definitely!'],       ['🟢', 'You may rely on it.'],
    ['🟡', 'Ask again later.'],       ['🟡', 'Cannot predict now.'],
    ['🟡', 'Concentrate and ask again.'],
    ['🔴', "Don't count on it."],     ['🔴', 'My sources say no.'],
    ['🔴', 'Outlook not so good.'],   ['🔴', 'Very doubtful.'],
  ],

  HOF_THRESHOLD:  parseInt(process.env.HOF_THRESHOLD  ?? '4', 10),
  HOS_THRESHOLD:  parseInt(process.env.HOS_THRESHOLD  ?? '4', 10),
  HOF_LOCK_FLOOR: parseInt(process.env.HOF_LOCK_FLOOR ?? '3', 10),
  HOS_LOCK_FLOOR: parseInt(process.env.HOS_LOCK_FLOOR ?? '3', 10),
};
