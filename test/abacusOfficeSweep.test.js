'use strict';

// The sweep of 11 November 2026 (Tom: "sweep the site and look for where we
// can make it better and for any faults"), kept as a test. Every line is
// something an operator, a manager or a second tab tried against a running
// office: who can open what, what happens when a button is pressed twice or
// from a page opened before a colleague changed the reply, and what the
// pages say with no mailbox connected. It needs
// ABACUS_OFFICE_TEST_DATABASE_URL and works in a schema of its own.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ai = require('../abacus-office/lib/ai');

const DB = process.env.ABACUS_OFFICE_TEST_DATABASE_URL;

test('the list pages have one checker, and none that says it stopped while it is still checking', () => {
  const js = fs.readFileSync(path.join(__dirname, '../abacus-office/public/office.js'), 'utf8');
  assert.doesNotMatch(js, /Stopped checking after 15 minutes/);
  assert.equal((js.match(/querySelector\('\[data-live-url\]'\)/g) || []).length, 1);
});

test('the sweep, over HTTP: access, double presses, old tabs, and wording with no mailbox', { skip: DB ? false : 'set ABACUS_OFFICE_TEST_DATABASE_URL to a throwaway database' }, async (t) => {
  const { Pool } = require('pg');
  const out = [];
  const say = (ok, what, detail = '') => out.push(`${ok ? 'CLEAN ' : 'FAULT '} ${what}${detail ? ` :: ${detail}` : ''}`);
  const admin = new Pool({ connectionString: DB });
  await admin.query('DROP SCHEMA IF EXISTS office_sweep CASCADE; CREATE SCHEMA office_sweep');
  await admin.end();
  const pool = new Pool({ connectionString: DB, options: '-c search_path=office_sweep' });
  const { Store } = require('../abacus-office/lib/store');
  const { createApp } = require('../abacus-office/app');
  const { createMailbox } = require('../abacus-office/lib/mailbox');
  const store = new Store(pool); await store.ensureSchema();
  const mk = (u, d, r, b) => store.createUser({ username: u, displayName: d, password: `${u}-pass-1234567`, role: r, brand: b || '' });
  await mk('owner', 'Olive', 'owner'); await mk('mgr', 'Mo', 'manager'); await mk('sam', 'Sam', 'operator', 'abacus'); await mk('cat', 'Cat', 'operator', 'coastline');
  const gone = await mk('gone', 'Gone', 'operator', 'abacus');
  const users = await store.users(); const uid = (n) => users.find((u) => u.username === n).id;
  await store.setUserActive(uid('gone'), false);
  let aiN = 0;
  ai.__setClientFactoryForTests(() => ({ messages: { create: async ({ system }) => {
    aiN += 1;
    const isComplaint = /JUDGING IT/.test(system);
    const o = isComplaint ? { seriousness: 'minor', summary: 's', firm_at_fault: 'unclear', for_licensing: false, pass_to_manager: false, pass_to_manager_why: '', staff_steps: ['x'], reply: `Hi,\n\nComplaint reply v${aiN}.\n\nThanks,\nCornwall Taxis` }
      : { intent: 'new_booking', customer_name: 'Jenna', phone: '07700 900123', reference: '', journey: { date: '2026-11-13', time: '06:00', pickup: 'A', destination: 'B', passengers: '2', flight: '' }, missing: [], seriousness: 'none', summary: 'A taxi.', reply: `Hi Jenna,\n\nAI reply v${aiN}.\n\nThanks,\nCornwall Taxis`, held_back: '', subject: 'Account work for your guests', body: 'Hello,\n\nWe run account work for hotels in Falmouth and would like to help.\n\nThanks,\nSam' };
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(o) }] };
  } } }));
  const firm = { name: 'Cornwall Taxis', short: 'Cornwall', town: 'Falmouth', county: 'Cornwall', phone: '', signature: 'Cornwall Taxis', facts: [], fixedPrices: [], demo: false, logo: '', mailboxBrand: 'abacus', brands: [{ id: 'abacus', name: 'Abacus & Falmouth Taxis' }, { id: 'coastline', name: 'Coastline Travel' }] };
  const saved = [];
  const gmail = { name: 'gmail', label: 'Gmail', demo: false, none: false, configured: () => true, missing: () => [], listInbox: async () => [], account: async () => null,
    saveReplyDraft: async (e, text) => { saved.push(text); return { draftId: `d${saved.length}` }; }, saveNewDraft: async (to, s, text) => { saved.push(text); return { draftId: `n${saved.length}` }; } };
  let seq = 0;
  const seed = async (subject, brand, fields) => {
    seq += 1;
    const row = await store.insertCase({ id: `m${seq}`, messageId: `<m${seq}@x.invalid>`, from: 'Jenna <jenna@example.invalid>', subject, body: 'Body of the email, long enough.', receivedAt: new Date() }, brand);
    await store.updateCase(row.id, { kind: 'bookings', status: 'new', reading_source: 'ai', draft: `Hi Jenna,\n\nOriginal ${subject}.\n\nThanks,\nCornwall Taxis`, reading: { intent: 'new_booking', customer_name: 'Jenna', phone: '07700 900123', journey: { date: '2026-11-13', time: '06:00', pickup: '12 Arwenack Street', destination: 'Newquay Airport', passengers: '2', flight: '' }, missing: [], summary: 'A taxi.' }, ...fields });
    return row.id;
  };
  const start = async (mailbox, aiOn) => {
    const { app } = createApp({ pool, mailbox, firm, sessionSecret: 'sweep-secret-sweep-secret-sweep', production: false, aiOn: () => aiOn, alertsEnv: {}, mailEnv: { ABACUS_OFFICE_MAIL_DRIVER: mailbox.name } });
    const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const client = async (name) => {
      const jar = new Map();
      const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } };
      const get = async (p) => { const res = await fetch(base + p, { headers: { cookie: cookie() }, redirect: 'manual' }); absorb(res); return { status: res.status, text: await res.text(), location: res.headers.get('location') }; };
      const token = async (from) => ((await get(from)).text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      const send = async (p, fields, tok) => { const res = await fetch(base + p, { method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: tok, ...fields }), redirect: 'manual' }); absorb(res); return { status: res.status, location: res.headers.get('location'), text: await res.text() }; };
      const post = async (p, fields, from = '/') => send(p, fields, await token(from));
      const flash = async () => { const t = (await get('/account')).text; const m = t.match(/class="to-flash[^"]*"[^>]*>([\s\S]*?)<\//); return m ? m[1].trim() : ''; };
      if (name) await post('/login', { username: name, password: `${name}-pass-1234567`, next: '/' }, '/login');
      return { get, post, send, token, flash };
    };
    return { server, base, client };
  };
  const live = await start(gmail, true);
  const [owner, mgr, sam, cat, anon] = await Promise.all([live.client('owner'), live.client('mgr'), live.client('sam'), live.client('cat'), live.client(null)]);

  // ---------- A. ACCESS ----------
  const b1 = await seed('abacus-booking', 'abacus', {});
  const b2 = await seed('coastline-booking-SECRET', 'coastline', {});
  const c2 = await seed('safety-complaint', 'abacus', { kind: 'complaints', seriousness: 'safety', reading: { intent: 'complaint', customer_name: 'Jenna' }, complaint: { seriousness: 'safety' } });
  const l1 = await seed('council-letter-SECRET', 'abacus', { kind: 'licensing', council: { asks: ['x'], deadline: '2026-11-20' } });
  for (const p of ['/council', '/activity', '/users', '/settings', '/settings/icabbi-vehicles', '/settings/mailbox/connect']) { const r = await sam.get(p); say(r.status === 404, `operator GET ${p}`, `status ${r.status}`); }
  for (const p of ['/users']) { const r = await mgr.get(p); say(r.status === 404, `manager GET ${p}`, `status ${r.status}`); }
  for (const [p, f] of [['/users', { username: 'x1', display_name: 'X', password: 'xxxxxxxxxxxx', role: 'owner' }], [`/users/${uid('owner')}`, { action: 'deactivate' }], ['/settings', { escalation_hours: '1', complaint_nudge_hours: '1' }], ['/settings/mailbox/client', { client_id: 'a', client_secret: 'b' }], ['/settings/mailbox/disconnect', {}]]) {
    const r1 = await sam.post(p, f, '/'); const r2 = await mgr.post(p, f, '/');
    say(r1.status === 404 && r2.status === 404, `operator and manager POST ${p}`, `operator ${r1.status}, manager ${r2.status}`);
  }
  let r = await sam.post('/settings/prices', { from_place: 'A', to_place: 'B', vehicle: 'Car', price: '10', brand: 'abacus' }, '/');
  say(r.status === 404, 'operator POST /settings/prices', `status ${r.status}`);
  for (const [id, what] of [[b2, "another company's case"], [l1, 'a council email']]) {
    r = await sam.get(`/case/${id}`); say(r.status === 404, `operator opens ${what} by address`, `status ${r.status}`);
    for (const a of ['approve', 'status', 'note', 'take', 'draft', 'sent', 'read', 'book', 'guide']) {
      const rr = await sam.post(`/case/${id}/${a}`, { status: 'done', note: 'x', draft: 'hacked', guidance: 'x' }, '/');
      if (rr.status !== 404) say(false, `operator POST /case/${what}/${a}`, `status ${rr.status}`);
    }
    const k = await store.caseById(id);
    say(!/hacked/.test(k.draft) && k.status === 'new' && !k.approved_at, `operator cannot change ${what}`, `status ${k.status}`);
  }
  for (const p of ['/', '/inbox', '/inbox?show=all', '/complaints?show=all']) { const t = (await sam.get(p)).text; say(!/SECRET/.test(t), `operator's ${p} shows no other company or council email`); }
  r = await anon.get(`/case/${b1}`); say(r.status === 302 && /\/login/.test(r.location || ''), 'signed out: a case address goes to sign in', `status ${r.status}`);
  r = await sam.send(`/case/${b1}/note`, { note: 'no token' }, 'bad-token'); say(r.status === 403, 'a form without a valid token is refused', `status ${r.status}`);
  await sam.post(`/case/${c2}/approve`, {}, `/case/${c2}`);
  say(!(await store.caseById(c2)).approved_at, 'operator cannot approve a safety complaint');
  // operator closes a safety complaint without a reply
  await sam.post(`/case/${c2}/status`, { status: 'done' }, `/case/${c2}`);
  let k = await store.caseById(c2);
  say(k.status !== 'done', 'operator cannot mark a safety complaint done with no approved reply', `status now ${k.status}, approved ${Boolean(k.approved_at)}`);
  await store.updateCase(c2, { status: 'new' });
  await mgr.post(`/case/${c2}/status`, { status: 'done' }, `/case/${c2}`);
  say((await store.caseById(c2)).status === 'done', 'a manager can close a safety complaint');
  await store.updateCase(c2, { status: 'new' });
  // assign to someone who cannot see it / inactive
  await sam.post(`/case/${b1}/assign`, { owner: String(uid('cat')) }, `/case/${b1}`);
  k = await store.caseById(b1); say(k.owner_id !== uid('cat'), 'a case cannot be assigned to someone in another company (who cannot open it)', `owner now ${k.owner_username}`);
  await store.updateCase(b1, { owner_id: null, status: 'new' });
  await sam.post(`/case/${b1}/assign`, { owner: String(uid('gone')) }, `/case/${b1}`);
  k = await store.caseById(b1); say(k.owner_id !== uid('gone'), 'a case cannot be assigned to a switched-off login', `owner now ${k.owner_username}`);
  await store.updateCase(b1, { owner_id: null, status: 'new' });
  await sam.post(`/case/${b1}/company`, { brand: 'coastline' }, `/case/${b1}`); say((await store.caseById(b1)).brand === 'abacus', 'operator cannot move an email to another company');
  r = await sam.post('/write', { kind: 'council_new', prompt: 'tell the council something', to_name: '' }, '/write'); say(r.status === 404, 'operator cannot write to the council', `status ${r.status}`);
  await mgr.post('/write', { kind: 'new', relationship: 'new', prompt: 'manager private draft about pay', brand: 'abacus' }, '/write');
  await cat.post('/write', { kind: 'new', relationship: 'new', prompt: 'cat coastline draft here' }, '/write');
  const comps = (await pool.query('SELECT id, created_by, brand FROM compositions ORDER BY id')).rows;
  const mgrDraft = comps.find((c) => c.created_by === uid('mgr')); const catDraft = comps.find((c) => c.created_by === uid('cat'));
  r = await sam.get(`/write/${mgrDraft.id}`); say(r.status === 404, "operator cannot open a manager's Write draft", `status ${r.status}`);
  r = await sam.get(`/write/${catDraft.id}`); say(r.status === 404, "operator cannot open another operator's Write draft", `status ${r.status}`);
  r = await sam.post(`/write/${catDraft.id}/approve`, {}, '/write'); say(r.status === 404, "operator cannot approve another operator's Write draft", `status ${r.status}`);
  await sam.post('/complaints/log', { channel: 'phone', text: 'A complaint about coastline typed by sam', brand: 'coastline', date: '' }, '/complaints');
  const lg = (await pool.query("SELECT brand FROM cases WHERE message_id LIKE '<logged-%' ORDER BY id DESC LIMIT 1")).rows[0];
  say(lg && lg.brand === 'abacus', 'an operator logging a complaint cannot file it under another company', `brand ${lg && lg.brand}`);

  // ---------- B. DOUBLE PRESSES AND STALE PAGES ----------
  // book twice at once
  const bk = await seed('book-twice', 'abacus', {});
  const job = { date: '2026-11-13', time: '06:00', pickup: '12 Arwenack Street', destination: 'Newquay Airport', name: 'Jenna', phone: '07700 900123', passengers: '2', vehicle: 'Car (up to 4)', signed_off: 'yes' };
  let tok = await sam.token(`/case/${bk}`);
  await Promise.all([sam.send(`/case/${bk}/book`, job, tok), sam.send(`/case/${bk}/book`, job, tok), sam.send(`/case/${bk}/book`, job, tok)]);
  let n = (await pool.query('SELECT count(*)::int AS n FROM dispatch_bookings WHERE case_id = $1', [bk])).rows[0].n;
  say(n === 1, 'Book pressed three times at once records one booking', `${n} bookings recorded for one email`);
  const bx = await seed('book-same-moment-1', 'abacus', {}); const by = await seed('book-same-moment-2', 'abacus', {});
  const [tx, ty] = [await sam.token(`/case/${bx}`), await mgr.token(`/case/${by}`)];
  const two = await Promise.all([sam.send(`/case/${bx}/book`, job, tx), mgr.send(`/case/${by}/book`, job, ty)]);
  const refs = [(await store.caseById(bx)).dispatch_ref, (await store.caseById(by)).dispatch_ref];
  say(two.every((x) => x.status === 302) && refs[0] && refs[1] && refs[0] !== refs[1], 'two different jobs booked at the same moment both go in, with their own references', `statuses ${two.map((x) => x.status).join(', ')}; references ${refs.join(', ')}`);
  // book from a stale tab after it was already booked: sequential
  const bk2 = await seed('book-stale', 'abacus', {});
  tok = await sam.token(`/case/${bk2}`);
  await sam.send(`/case/${bk2}/book`, job, tok); await sam.send(`/case/${bk2}/book`, job, tok);
  n = (await pool.query('SELECT count(*)::int AS n FROM dispatch_bookings WHERE case_id = $1', [bk2])).rows[0].n;
  say(n === 1, 'Book pressed again from an old tab is refused', `${n} bookings`);
  // cancel twice
  tok = await sam.token(`/case/${bk2}`);
  await Promise.all([sam.send(`/case/${bk2}/cancel-booking`, { signed_off: 'yes', reason: 'customer cancelled' }, tok), sam.send(`/case/${bk2}/cancel-booking`, { signed_off: 'yes', reason: 'customer cancelled' }, tok)]);
  n = (await store.eventsFor(bk2)).filter((e) => e.kind === 'dispatch_cancelled').length;
  say(n === 1, 'Cancel pressed twice at once is recorded once', `${n} cancellations recorded`);
  // pass up twice
  const pu = await seed('passup-twice', 'abacus', { kind: 'complaints', seriousness: 'serious', reading: { intent: 'complaint', customer_name: 'Jenna' } });
  tok = await sam.token(`/case/${pu}`);
  await Promise.all([sam.send(`/case/${pu}/pass-up`, { reason: 'refund' }, tok), sam.send(`/case/${pu}/pass-up`, { reason: 'refund' }, tok)]);
  n = (await store.eventsFor(pu)).filter((e) => e.kind === 'passed_up').length;
  say(n === 1, 'Pass up pressed twice at once is recorded once', `${n} pass-ups recorded`);
  // log complaint twice
  const before = (await pool.query("SELECT count(*)::int AS n FROM cases WHERE message_id LIKE '<logged-%'")).rows[0].n;
  const cpage = (await sam.get('/complaints')).text;
  tok = (cpage.match(/name="_csrf" value="([^"]+)"/) || [])[1];
  const logId = (cpage.match(/name="log_id" value="([^"]+)"/) || [])[1];
  const f = { channel: 'google_review', text: 'Driver was rude and late on Friday night.', name: 'Sarah P', date: '', ...(logId ? { log_id: logId } : {}) };
  await Promise.all([sam.send('/complaints/log', f, tok), sam.send('/complaints/log', f, tok)]);
  n = (await pool.query("SELECT count(*)::int AS n FROM cases WHERE message_id LIKE '<logged-%'")).rows[0].n - before;
  say(n === 1, 'Log a complaint sent twice at once makes one complaint', `${n} complaints made`);
  // stale approve overwrites a newer draft and makes a second mailbox draft
  const st = await seed('stale-approve', 'abacus', {});
  const stalePage = await mgr.get(`/case/${st}`);
  const staleTok = (stalePage.text.match(/name="_csrf" value="([^"]+)"/) || [])[1];
  const oldText = (await store.caseById(st)).draft;
  const s0 = saved.length;
  const samV = async (id) => { const t = (await sam.get(`/case/${id}`)).text; const v = (t.match(/name="draft_version" value="(\d+)"/) || [])[1]; return v !== undefined ? { draft_version: v } : {}; };
  await sam.post(`/case/${st}/approve`, { draft: 'Hi Jenna,\n\nSam corrected the time to 7am.\n\nThanks,\nCornwall Taxis', ...(await samV(st)) }, `/case/${st}`);
  const afterSam = saved.length - s0;
  const staleV = (stalePage.text.match(/name="draft_version" value="(\d+)"/) || [])[1];
  await mgr.send(`/case/${st}/approve`, { draft: oldText, ...(staleV !== undefined ? { draft_version: staleV } : {}) }, staleTok);
  k = await store.caseById(st);
  say(saved.length - s0 === 1 && /7am/.test(k.draft), 'Approve from an old tab cannot replace a newer approved reply', `${saved.length - s0} drafts in the mailbox (Sam's approval made ${afterSam}); the case now reads: ${JSON.stringify(k.draft.split('\n')[2])}`);
  // stale save silently overwrites
  const sv = await seed('stale-save', 'abacus', {});
  const svPage = (await mgr.get(`/case/${sv}`)).text; const svTok = (svPage.match(/name="_csrf" value="([^"]+)"/) || [])[1]; const svV = (svPage.match(/name="draft_version" value="(\d+)"/) || [])[1]; const svOld = (await store.caseById(sv)).draft;
  await sam.post(`/case/${sv}/draft`, { draft: 'Hi Jenna,\n\nSam rewrote this carefully.\n\nThanks', ...(await samV(sv)) }, `/case/${sv}`);
  await mgr.send(`/case/${sv}/draft`, { draft: `${svOld}\nPS from Mo.`, ...(svV !== undefined ? { draft_version: svV } : {}) }, svTok);
  k = await store.caseById(sv);
  say(/Sam rewrote/.test(k.draft), "Saving from an old tab cannot silently wipe a colleague's newer edit", `the case now reads: ${JSON.stringify(k.draft.slice(0, 60))}`);
  // read again on an approved case
  const ra = await seed('read-again', 'abacus', {});
  await sam.post(`/case/${ra}/approve`, {}, `/case/${ra}`);
  const approvedText = (await store.caseById(ra)).draft;
  const pg = (await sam.get(`/case/${ra}`)).text;
  const hasButton = /\/read"/.test(pg);
  await sam.post(`/case/${ra}/read`, {}, `/case/${ra}`);
  k = await store.caseById(ra);
  say(!(k.approved_at && k.draft !== approvedText), '"Ask the AI to read it again" on an approved reply does not swap the text while leaving it marked approved', `button shown on the approved case: ${hasButton}; still approved: ${Boolean(k.approved_at)}; text changed: ${k.draft !== approvedText}`);
  // status waiting set by hand without approval
  const wt = await seed('manual-waiting', 'abacus', {});
  await sam.post(`/case/${wt}/status`, { status: 'waiting' }, `/case/${wt}`);
  k = await store.caseById(wt);
  const row = (await sam.get('/inbox?show=waiting')).text;
  say(!(k.status === 'waiting' && !k.approved_at), 'a case cannot be shown as "sent, waiting on the customer" when nothing was approved or sent', `status ${k.status}, approved ${Boolean(k.approved_at)}, sent ${Boolean(k.sent_at)}; listed under Sent: ${/manual-waiting/.test(row)}`);
  // Write: approve twice at once, approve again
  await sam.post('/write', { kind: 'new', relationship: 'new', prompt: 'write to the hotel about account work', to_address: 'hotel@example.invalid' }, '/write');
  const wd = (await pool.query('SELECT id FROM compositions WHERE created_by = $1 ORDER BY id DESC LIMIT 1', [uid('sam')])).rows[0].id;
  const w0 = saved.length; tok = await sam.token(`/write/${wd}`);
  await Promise.all([sam.send(`/write/${wd}/approve`, {}, tok), sam.send(`/write/${wd}/approve`, {}, tok)]);
  say(saved.length - w0 === 1, 'Write: Approve pressed twice at once makes one draft', `${saved.length - w0} drafts`);
  const wpage = (await sam.get(`/write/${wd}`)).text;
  await sam.post(`/write/${wd}/approve`, {}, `/write/${wd}`);
  say(!/Approve again/.test(wpage), 'Write: an approved email does not offer an "Approve again" button that is refused', `button shown: ${/Approve again/.test(wpage)}; drafts after pressing it: ${saved.length - w0}`);
  // holding twice (regression)
  const hd = await seed('holding', 'abacus', { kind: 'complaints', seriousness: 'minor', reading: { intent: 'complaint', customer_name: 'Jenna' } });
  const hb = saved.length;
  await sam.post(`/case/${hd}/holding`, {}, `/case/${hd}`);
  say(saved.length === hb, 'no holding reply before the complaint is passed up', `${saved.length - hb} saved`);
  await sam.post(`/case/${hd}/pass-up`, { reason: 'refund' }, `/case/${hd}`);
  const h0 = saved.length; tok = await sam.token(`/case/${hd}`);
  await Promise.all([sam.send(`/case/${hd}/holding`, {}, tok), sam.send(`/case/${hd}/holding`, {}, tok)]);
  say(saved.length - h0 === 1, 'Holding reply pressed twice at once makes one draft', `${saved.length - h0}`);
  // sent twice
  await Promise.all([sam.post(`/case/${ra}/sent`, {}, `/case/${ra}`), sam.post(`/case/${ra}/sent`, {}, `/case/${ra}`)]);
  n = (await store.eventsFor(ra)).filter((e) => e.kind === 'sent').length;
  say(n <= 1, '"I have sent it" pressed twice is recorded once', `${n}`);
  live.server.close();

  // ---------- C. WORDING WITH NO MAILBOX (as production is now) ----------
  const none = await start(createMailbox({ ABACUS_OFFICE_MAIL_DRIVER: 'none' }), true);
  const o2 = await none.client('owner');
  const pages = { '/': 'Today', '/inbox': 'Inbox', '/complaints': 'Complaints', '/council': 'Council', '/write': 'Write', '/settings': 'Settings', '/activity': 'Activity', [`/case/${l1}`]: 'a council email', [`/case/${b1}`]: 'a booking email', [`/case/${hd}`]: 'a complaint', [`/write/${wd}`]: 'a Write draft' };
  const bad = [[/checks the mailbox itself/, 'says the page checks the mailbox'], [/saves it as a draft in the (firm's |company )?mailbox/i, 'says approving saves a draft in the mailbox'], [/draft in No mailbox connected/i, 'names "No mailbox connected" as a place'], [/Approve again/, 'offers "Approve again"'], [/has been emailed|was emailed|is emailed once/, 'says someone is emailed']];
  for (const [p, name] of Object.entries(pages)) {
    const t = (await o2.get(p)).text.replace(/<script[\s\S]*?<\/script>/g, '');
    const hits = bad.filter(([re]) => re.test(t)).map(([, w]) => w);
    say(!hits.length, `no mailbox connected: ${name} (${p}) says nothing untrue`, hits.join('; '));
  }
  none.server.close();
  await pool.query('DROP SCHEMA IF EXISTS office_sweep CASCADE');
  await pool.end();
  ai.__setClientFactoryForTests(null);
  const faults = out.filter((l) => l.startsWith('FAULT'));
  assert.deepEqual(faults, [], `${faults.length} of ${out.length} checks failed`);
  assert.ok(out.length >= 55, `only ${out.length} checks ran`);
});
