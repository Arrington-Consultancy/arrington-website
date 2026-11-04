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
function secs(sec) { return sec === null || sec === undefined ? '' : `${fmt(sec, 0)}s`; }

// Clarity returns [{ metricName, information: [ { <dimension values...>, <metric fields...> } ] }].
// Read from the real response on 04/11/2026: the dimension keys come back in
// Clarity's own casing ('Url'), a Url carries its full query string so every
// ad click (unique fbclid/gclid) is its own row, totalTime and activeTime are
// per-session AVERAGES in seconds for that row, averageScrollDepth is a
// percentage, and the click metrics' subTotal is a count of sessions. Rows
// are therefore grouped by page path, with sessions and click counts summed
// and time and scroll depth averaged weighted by each raw row's sessions.
function dimValue(r, d) {
  const k = Object.keys(r).find((x) => x.toLowerCase() === d.toLowerCase());
  let v = k ? r[k] : '';
  if (d.toLowerCase() === 'url' && typeof v === 'string' && v) {
    try { v = new URL(v).pathname; } catch { /* keep as is */ }
  }
  return v ?? '';
}
function table(metrics, dimensions) {
  const rawKey = (r) => dimensions.map((d) => { const k = Object.keys(r).find((x) => x.toLowerCase() === d.toLowerCase()); return k ? String(r[k] ?? '') : ''; }).join('\u0001');
  const sessionsOf = new Map();
  for (const m of metrics) if (m.metricName === 'Traffic') for (const r of m.information || []) sessionsOf.set(rawKey(r), num(r.totalSessionCount) || 0);
  const weight = (r) => sessionsOf.get(rawKey(r)) || 0;
  const rows = new Map();
  const key = (r) => dimensions.map((d) => dimValue(r, d)).join(' | ');
  const touch = (r) => {
    const k = key(r);
    if (!rows.has(k)) rows.set(k, Object.assign(Object.fromEntries(dimensions.map((d) => [d, dimValue(r, d)])), { sessions: 0, users: 0, bots: 0, dead: 0, rage: 0, quickback: 0, excessiveScroll: 0, scriptErrors: 0, errorClicks: 0, _t: 0, _a: 0, _tw: 0, _s: 0, _sw: 0 }));
    return rows.get(k);
  };
  const add = (row, f, v) => { const n = num(v); if (n !== null) row[f] += n; };
  for (const m of metrics) {
    for (const r of m.information || []) {
      const row = touch(r);
      const w = weight(r);
      switch (m.metricName) {
        case 'Traffic':
          add(row, 'sessions', r.totalSessionCount); add(row, 'users', r.distinctUserCount); add(row, 'bots', r.totalBotSessionCount);
          break;
        case 'ScrollDepth': { const n = num(r.averageScrollDepth); if (n !== null && w) { row._s += n * w; row._sw += w; } break; }
        case 'EngagementTime': { const t = num(r.totalTime); const a = num(r.activeTime); if (t !== null && w) { row._t += t * w; row._a += (a || 0) * w; row._tw += w; } break; }
        case 'DeadClickCount': add(row, 'dead', r.subTotal); break;
        case 'RageClickCount': add(row, 'rage', r.subTotal); break;
        case 'QuickbackClick': add(row, 'quickback', r.subTotal); break;
        case 'ExcessiveScroll': add(row, 'excessiveScroll', r.subTotal); break;
        case 'ScriptErrorCount': add(row, 'scriptErrors', r.subTotal); break;
        case 'ErrorClickCount': add(row, 'errorClicks', r.subTotal); break;
        default: break;
      }
    }
  }
  for (const row of rows.values()) {
    row.scroll = row._sw ? row._s / row._sw : null;
    row.perSession = row._tw ? row._t / row._tw : null;
    row.activePerSession = row._tw ? row._a / row._tw : null;
  }
  return [...rows.values()].sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
}

function renderTable(rows, dimensions) {
  const cols = [...dimensions, 'sessions', 'bots', 'scroll', 'perSession', 'activePerSession', 'dead', 'rage', 'quickback', 'scriptErrors'];
  const head = [...dimensions, 'Sessions', 'Bots', 'Scroll %', 'Time/session', 'Active/session', 'Dead clicks', 'Rage clicks', 'Quick backs', 'Script errors'];
  const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
  for (const r of rows.slice(0, 60)) {
    lines.push(`| ${cols.map((c) => {
      if (dimensions.includes(c)) return String(r[c] ?? '').replace(/\|/g, '/');
      if (c === 'scroll') return r.scroll === null || r.scroll === undefined ? '' : fmt(r.scroll, 0);
      if (c === 'perSession' || c === 'activePerSession') return secs(r[c]);
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
    'Rows are grouped by page path (ad click ids stripped). Scroll % is the average scroll depth; Time/session is engagement time per session and Active/session the part of it with the visitor doing something; the click columns count sessions with at least one such click.', ''];
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
