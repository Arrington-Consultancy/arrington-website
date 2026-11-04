'use strict';

// Reads Microsoft Clarity's Data Export API for the website's project and
// writes a plain report, run on a GitHub Actions runner (the build sandbox
// cannot reach clarity.ms). Added 04/11/2026 when Windsor's connector cap
// was reached: the token lives in the GitHub Actions secret
// CLARITY_API_TOKEN, never in code, git, Drive or chat.
//
// The API answers the last 1 to 3 days only, broken down by up to three
// dimensions per call, and allows 10 calls per project per day. One run
// makes CALLS requests (default 3), so two runs a day is the sensible limit.
// It gives numbers (sessions, scroll depth, engagement time, dead clicks,
// rage clicks, quick backs, script errors), never the recordings.

const fs = require('fs');
const path = require('path');

const TOKEN = (process.env.CLARITY_API_TOKEN || '').trim();
const DAYS = Math.min(3, Math.max(1, parseInt(process.env.NUM_OF_DAYS || '3', 10) || 3));
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'clarity-out');
const ENDPOINT = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

// Each entry is one API call: the dimensions Clarity breaks the metrics by.
const DEFAULT_CALLS = [
  ['URL', 'Device'],
  ['URL', 'Source', 'Medium'],
  ['Device', 'Source', 'Channel']
];

function parseCalls() {
  const raw = (process.env.CALLS || '').trim();
  if (!raw) return DEFAULT_CALLS;
  return raw.split(';').map((c) => c.split(',').map((d) => d.trim()).filter(Boolean)).filter((c) => c.length);
}

async function fetchInsights(dimensions) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('numOfDays', String(DAYS));
  dimensions.forEach((d, i) => url.searchParams.set(`dimension${i + 1}`, d));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) {
    const why = res.status === 401 || res.status === 403 ? 'the token was refused (recreate it in Clarity, Settings, Data export, and update the GitHub secret)'
      : res.status === 429 ? 'the daily limit of 10 calls is spent; try tomorrow'
        : text.slice(0, 300);
    throw new Error(`Clarity answered ${res.status} for ${dimensions.join(' x ')}: ${why}`);
  }
  return JSON.parse(text);
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function fmt(n, dp = 0) { return n === null ? '' : n.toLocaleString('en-GB', { maximumFractionDigits: dp, minimumFractionDigits: dp }); }
function secs(ms) { return ms === null ? '' : `${fmt(ms / 1000, 0)}s`; }

// Clarity returns [{ metricName, information: [ { <dimension values...>, <metric fields...> } ] }].
function table(metrics, dimensions) {
  const rows = new Map();
  const key = (r) => dimensions.map((d) => r[d] ?? '').join(' | ');
  const touch = (r) => {
    const k = key(r);
    if (!rows.has(k)) rows.set(k, Object.fromEntries(dimensions.map((d) => [d, r[d] ?? ''])));
    return rows.get(k);
  };
  for (const m of metrics) {
    for (const r of m.information || []) {
      const row = touch(r);
      switch (m.metricName) {
        case 'Traffic':
          row.sessions = num(r.totalSessionCount); row.users = num(r.distinctUserCount);
          row.bots = num(r.totalBotSessionCount); row.pagesPerSession = num(r.PagesPerSessionPercentage);
          break;
        case 'ScrollDepth': row.scroll = num(r.averageScrollDepth); break;
        case 'EngagementTime': row.total = num(r.totalTime); row.active = num(r.activeTime); break;
        case 'DeadClickCount': row.dead = num(r.subTotal ?? r.sessionsCount); break;
        case 'RageClickCount': row.rage = num(r.subTotal ?? r.sessionsCount); break;
        case 'QuickbackClick': row.quickback = num(r.subTotal ?? r.sessionsCount); break;
        case 'ExcessiveScroll': row.excessiveScroll = num(r.subTotal ?? r.sessionsCount); break;
        case 'ScriptErrorCount': row.scriptErrors = num(r.subTotal ?? r.sessionsCount); break;
        case 'ErrorClickCount': row.errorClicks = num(r.subTotal ?? r.sessionsCount); break;
        default: break;
      }
    }
  }
  return [...rows.values()].sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
}

function renderTable(rows, dimensions) {
  const cols = [...dimensions, 'sessions', 'users', 'scroll', 'total', 'active', 'dead', 'rage', 'quickback', 'scriptErrors'];
  const head = [...dimensions, 'Sessions', 'Users', 'Scroll %', 'Time', 'Active', 'Dead clicks', 'Rage clicks', 'Quick backs', 'Script errors'];
  const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
  for (const r of rows.slice(0, 60)) {
    lines.push(`| ${cols.map((c) => {
      if (dimensions.includes(c)) return String(r[c] ?? '').replace(/\|/g, '/');
      if (c === 'scroll') return r.scroll === null || r.scroll === undefined ? '' : fmt(r.scroll, 0);
      if (c === 'total' || c === 'active') return r[c] === null || r[c] === undefined ? '' : secs(r[c]);
      return r[c] === null || r[c] === undefined ? '' : fmt(r[c]);
    }).join(' | ')} |`);
  }
  if (rows.length > 60) lines.push(`\n(${rows.length - 60} more rows in the JSON)`);
  return lines.join('\n');
}

async function main() {
  if (!TOKEN) throw new Error('CLARITY_API_TOKEN is not set (GitHub Actions secret).');
  fs.mkdirSync(OUT, { recursive: true });
  const calls = parseCalls();
  const report = [`# Clarity read, last ${DAYS} day(s), ${new Date().toISOString()}`, '',
    `Project ywiy9r672t (www.arringtonconsultancy.com). ${calls.length} API call(s) of the 10 Clarity allows per day.`,
    'Scroll % is the average scroll depth; Time is total engagement time and Active the part of it with the visitor doing something; the click columns count sessions with at least one such click.', ''];
  const raw = {};
  for (const dims of calls) {
    const label = dims.join(' x ');
    try {
      const data = await fetchInsights(dims);
      raw[label] = data;
      const rows = table(Array.isArray(data) ? data : [], dims);
      report.push(`## By ${label}`, '', rows.length ? renderTable(rows, dims) : '(no rows returned)', '');
    } catch (err) {
      report.push(`## By ${label}`, '', `FAILED: ${err.message}`, '');
      console.error(err.message);
    }
  }
  fs.writeFileSync(path.join(OUT, 'report.md'), report.join('\n'));
  fs.writeFileSync(path.join(OUT, 'raw.json'), JSON.stringify(raw, null, 2));
  console.log(report.join('\n'));
}

main().catch((err) => { console.error(err.message); process.exit(1); });
