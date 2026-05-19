'use strict';

const { embed } = require('../utils/embed');
const { BRAND } = require('../config/constants');
const { REDDIT_URL, REDDIT_NAME, channels: CH } = require('../config/welcome');

function buildWelcomeEmbed(member) {
  return embed(BRAND)
    .setTitle(`هاييي! ولكم ${member} بسيرفر صبنا`)
    .setDescription([
      `[${REDDIT_NAME}](${REDDIT_URL})`,
      '',
      '**تعريف بالقنوات:**',
      '',
      `تأكد من قراءة: <#${CH.rules}>`,
      '',
      `شاهد منشورات الصب <#${CH.posts}>`,
      '',
      `شاهد أخبار السيرفر والتبليغات من <#${CH.news}>`,
      '',
      `أحصل على رتبك من: <#${CH.roles}>`,
      '',
      '',
      `كلمنا بالــ: <#${CH.chat}>`,
      `وانشر صورك بالـ: <#${CH.photos}>`,
    ].join('\n'));
}

async function sendWelcomeDM(member) {
  if (member.user.bot) return;
  try {
    await member.send({ embeds: [buildWelcomeEmbed(member)] });
    console.log(`[Welcome] Sent join DM to ${member.user.tag}`);
  } catch (e) {
    console.warn(`[Welcome] Could not DM ${member.user.tag}:`, e.message);
  }
}

module.exports = { buildWelcomeEmbed, sendWelcomeDM };
