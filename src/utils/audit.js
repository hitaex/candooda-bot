'use strict';

async function getAuditExecutor(guild, actionType, targetId, maxAgeSecs = 5) {
  try {
    const logs = await guild.fetchAuditLogs({ type: actionType, limit: 5 });
    const entry = logs.entries.find(e =>
      (!targetId || e.target?.id === targetId) &&
      (Date.now() - e.createdTimestamp) < maxAgeSecs * 1000,
    );
    return entry?.executor ?? null;
  } catch { return null; }
}

module.exports = { getAuditExecutor };
