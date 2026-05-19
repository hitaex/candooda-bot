'use strict';

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function ts(date) {
  return `<t:${Math.floor((date instanceof Date ? date : new Date(date)).getTime() / 1000)}:F>`;
}

function tsRel(date) {
  return `<t:${Math.floor((date instanceof Date ? date : new Date(date)).getTime() / 1000)}:R>`;
}

module.exports = { fmtDuration, ts, tsRel };
