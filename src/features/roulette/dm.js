'use strict';

async function sendDM(member, payload) {
  const user = member.user ?? member;
  const dm = await user.createDM();
  if (typeof payload === 'string') return dm.send(payload);
  return dm.send(payload);
}

module.exports = { sendDM };
