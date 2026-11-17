'use strict';

// The AI check: every made-up email through the real model, at each effort
// asked for, with the reading, the draft, the time taken and the tokens used
// printed to the log. It writes nothing to the database and sends nothing:
// the emails are the invented ones in demoInbox.js, read straight from that
// file. Run it by setting ABACUS_OFFICE_AI_CHECK to a label for one deploy
// (optionally ABACUS_OFFICE_AI_CHECK_EFFORTS, for example "low,high"), then
// unset it. Each run costs a little, so it runs only when asked.

const ai = require('./ai');
const { seedInbox, todayLondon } = require('./demoInbox');

async function timed(fn) {
  const tally = { calls: 0, input: 0, output: 0, stops: [] };
  ai.__observe((res) => {
    tally.calls += 1;
    tally.input += (res.usage && res.usage.input_tokens) || 0;
    tally.output += (res.usage && res.usage.output_tokens) || 0;
    tally.stops.push(res.stop_reason);
  });
  const t0 = Date.now();
  try {
    const value = await fn();
    return { value, tally, ms: Date.now() - t0 };
  } catch (error) {
    return { error, tally, ms: Date.now() - t0 };
  } finally {
    ai.__observe(null);
  }
}

function block(label, text) {
  const body = String(text || '').trim();
  return body ? `  ${label}:\n${body.split('\n').map((l) => `    | ${l}`).join('\n')}` : `  ${label}: (none)`;
}

async function checkOne(email, today) {
  return timed(async () => {
    const reading = await ai.readEmail(email, today);
    let complaint = null; let council = null;
    if (reading.intent === 'complaint') complaint = await ai.draftComplaint({ email, notes: [] }, today);
    if (reading.intent === 'council') council = await ai.draftCouncil({ email, notes: [] }, today);
    return { reading, complaint, council };
  });
}

function report(label, eff, email, r) {
  const head = `AI check ${label} [${eff}] ${email.id}: ${(r.ms / 1000).toFixed(1)}s, ${r.tally.calls} call(s), ${r.tally.input} in / ${r.tally.output} out tokens, stop ${r.tally.stops.join(',') || 'none'}`;
  if (r.error) return `${head}\n  FAILED: ${r.error.code || r.error.status || ''} ${String(r.error.message || r.error).slice(0, 200)}`;
  const { reading, complaint, council } = r.value;
  const lines = [head, `  intent ${reading.intent}${reading.seriousness !== 'none' ? `, ${reading.seriousness}` : ''}; missing: ${reading.missing.join(', ') || 'nothing'}`, `  summary: ${reading.summary}`];
  if (complaint) lines.push(`  complaint: ${complaint.seriousness}, at fault ${complaint.firm_at_fault}, pass to manager ${complaint.pass_to_manager}`, block('reply', complaint.reply));
  else if (council) lines.push(`  council deadline ${council.deadline || 'none'}`, block('reply', council.reply));
  else lines.push(block('reply', reading.reply));
  return lines.join('\n');
}

async function runAiCheck({ label, efforts, log = console.log, env = process.env }) {
  if (!ai.aiEnabled(env)) { log(`AI check ${label}: the AI is off on this server, nothing run`); return; }
  const today = todayLondon();
  const emails = seedInbox(today);
  // The effort is read from process.env on every call (lib/ai.js effort()),
  // so that is where each pass sets it, and it is put back afterwards.
  const before = process.env.ABACUS_OFFICE_AI_EFFORT;
  const totals = {};
  try {
    for (const eff of efforts) {
      process.env.ABACUS_OFFICE_AI_EFFORT = eff;
      totals[eff] = { ms: 0, input: 0, output: 0, failed: 0, slowest: 0 };
      log(`AI check ${label}: effort ${eff}, ${emails.length} made-up email(s), model ${ai.MODEL}, up to ${ai.MAX_TOKENS} tokens a call`);
      for (const email of emails) {
        const r = await checkOne(email, today);
        log(report(label, eff, email, r));
        const t = totals[eff];
        t.ms += r.ms; t.input += r.tally.input; t.output += r.tally.output; t.slowest = Math.max(t.slowest, r.ms);
        if (r.error) t.failed += 1;
      }
    }
  } finally {
    if (before === undefined) delete process.env.ABACUS_OFFICE_AI_EFFORT; else process.env.ABACUS_OFFICE_AI_EFFORT = before;
  }
  for (const [eff, t] of Object.entries(totals)) {
    log(`AI check ${label} TOTAL [${eff}]: ${(t.ms / 1000).toFixed(0)}s in all, slowest email ${(t.slowest / 1000).toFixed(1)}s, ${t.input} in / ${t.output} out tokens, ${t.failed} failed`);
  }
}

function effortsFrom(value) {
  const list = String(value || 'low,high').split(',').map((v) => v.trim().toLowerCase()).filter((v) => ['low', 'medium', 'high', 'xhigh', 'max'].includes(v));
  return list.length ? [...new Set(list)] : ['low', 'high'];
}

module.exports = { runAiCheck, effortsFrom, report };
