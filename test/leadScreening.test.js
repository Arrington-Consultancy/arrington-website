// Contact-form sales pitches (Tom, 30/09/2026: "people or bots are hitting my
// Google Ads and completing the lead form to try and sell me something, this
// has to stop").
//
// Two halves. The route refuses anything but the form's own script (JSON), so
// the spam tools that call form.submit() store nothing, exactly as before the
// 27/09 fallback. And an enquiry that reads as a pitch is stored and emailed
// but never given the Ads conversion token, so it cannot teach bidding to find
// more people selling things. The real messages below are the four pitches
// received through the form in August and September 2026, verbatim.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { screenEnquiry, THRESHOLD, SIGNAL_IDS } = require('../lib/leadScreening');

const PITCHES = [
  {
    who: 'Jack, 30/09',
    name: 'Jack', preferredTime: 'Jack',
    message: 'Hi\n\nSearch is changing. People are now asking Siri, Google Assistant, ChatGPT, Gemini and other AI tools for recommendations instead of simply searching Google.\n\nWith AEO (Answer Engine Optimization), we help optimize your website so AI and voice-search platforms can better understand your business and potentially recommend it when users ask relevant questions.\n\nWould you be open to a quick conversation about how this could benefit?\n\nBest regards,\n\nJack'
  },
  {
    who: 'Jenna Murray, 30/09',
    name: 'Jenna Murray', preferredTime: 'Jenna',
    message: 'Hello,\n\nAfter reviewing your website, I identified several opportunities that could help improve your Google rankings and attract more potential customers.\n\nWith the right SEO strategy, your website could generate significantly more organic traffic and leads from people actively searching for your services.\n\nI can provide a brief analysis outlining the opportunities, expected results, and estimated investment.\n\nWould you be interested in seeing it?\n\nRegards,\n\nMurray'
  },
  {
    who: 'Emma Dillion, 28/09',
    name: 'Emma Dillion', preferredTime: 'Emma Dillion',
    message: 'Hi https://www.arringtonconsultancy.com/,\n\nI was checking out your website and had a few ideas that could potentially improve its organic search visibility.\n\nRather than send you a long sales pitch, I can share the SEO opportunities directly.\n\nWould you like me to send them?\n\nBest,\nEmma'
  },
  {
    who: 'Alec, 11/08 (sent through the script, no form-filler mark)',
    name: 'Alec', preferredTime: '',
    message: "Hello,\n\nGrowing a business takes a steady flow of new clients, and finding them can eat up so much of your time. That's exactly where we can help.\n\nMy name is Alec Schellinx, International Marketing Lead at murmur, a French start-up that outsources your prospecting. On your behalf, we send out personalised messages to target companies that are likely to need your services. We contact them directly through the contact forms on their websites, making sure your message reaches the right person. In fact, this is the very tool I'm using to contact you today.\n\nThe result: qualified leads generated quickly and with virtually no effort on your part!\n\nWould you have a few minutes this week to discuss this further?\n\nKind regards,\n\nAlec Schellinx"
  }
];

// Genuine enquiries, including the real 4 September one, and the shapes a
// real owner could plausibly write that brush against a single signal.
const GENUINE = [
  { who: 'Reece, 04/09 (real)', name: 'Reece William Todd', preferredTime: 'Monday 11am', message: 'Everything relies on me and staffing issues' },
  { who: 'owner worried about SEO', name: 'Sam Hill', preferredTime: 'Any weekday morning', message: "Our website isn't bringing in any leads and I think our SEO is poor. Could you help with that as part of a website build?" },
  { who: 'owner asking if we would be interested', name: 'Priya Shah', preferredTime: '', message: "I'm thinking of selling the business in the next two years. Would you be interested in looking at our numbers first?" },
  { who: 'owner who outsources', name: 'Dave Cole', preferredTime: 'Tuesday', message: 'We outsource our bookkeeping and I have no idea what our margins are. Would you be open to a call?' },
  { who: 'owner who found the site', name: 'Kate Lowe', preferredTime: 'After 4pm', message: 'I came across your website on Google and I was looking at your website build offer. Would you be open to a chat about my business?' },
  { who: 'blank message', name: 'Ann Owner', preferredTime: '', message: '' }
];

test('every pitch received through the form is screened', () => {
  for (const p of PITCHES) {
    const r = screenEnquiry(p);
    assert.ok(r.suspect, `${p.who} was not screened (signals: ${r.reasons.join(', ') || 'none'})`);
  }
});

test('no genuine enquiry is screened, including ones that trip a single signal', () => {
  for (const g of GENUINE) {
    const r = screenEnquiry(g);
    assert.ok(!r.suspect, `${g.who} was screened as a pitch (signals: ${r.reasons.join(', ')})`);
    assert.ok(r.reasons.length < THRESHOLD);
  }
  // The single-signal cases really do trip one, so they are testing the threshold.
  assert.deepStrictEqual(screenEnquiry(GENUINE[1]).reasons, ['search_marketing']);
  assert.deepStrictEqual(screenEnquiry(GENUINE[3]).reasons, ['cold_close'], 'outsourcing your OWN work is not selling outsourcing');
});

test('putting your own name in the preferred time box is the form-filler mark, a real time is not', () => {
  assert.deepStrictEqual(screenEnquiry({ name: 'Jenna Murray', preferredTime: 'jenna', message: '' }).reasons, ['form_filler']);
  assert.deepStrictEqual(screenEnquiry({ name: 'Jenna Murray', preferredTime: 'Jenna Murray', message: '' }).reasons, ['form_filler']);
  assert.deepStrictEqual(screenEnquiry({ name: 'Jo', preferredTime: 'Monday 11am', message: '' }).reasons, []);
  assert.deepStrictEqual(screenEnquiry({ name: 'J', preferredTime: 'J', message: '' }).reasons, ['form_filler'], 'a whole-name match still counts');
  assert.ok(SIGNAL_IDS.includes('form_filler'));
});

test('a form-filler mark alone is not enough to screen: it takes two signals', () => {
  assert.strictEqual(THRESHOLD, 2);
  assert.ok(!screenEnquiry({ name: 'Emma', preferredTime: 'Emma', message: 'Please call me about selling my company.' }).suspect);
});

// ---- the route --------------------------------------------------------------

function loadLeadsRouter(inserts) {
  const poolPath = require.resolve('../db/pool');
  const leadsPath = require.resolve('../routes/leads');
  const savedPool = require.cache[poolPath];
  const savedLeads = require.cache[leadsPath];
  require.cache[poolPath] = {
    id: poolPath, filename: poolPath, loaded: true,
    exports: { query: async (sql, params) => { if (/INSERT INTO leads/.test(sql)) inserts.push({ sql, params }); return { rows: [] }; } }
  };
  delete require.cache[leadsPath];
  const router = require('../routes/leads');
  if (savedPool) require.cache[poolPath] = savedPool; else delete require.cache[poolPath];
  if (savedLeads) require.cache[leadsPath] = savedLeads; else delete require.cache[leadsPath];
  return router;
}

function post(port, body, type) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path: '/api/leads', method: 'POST', headers: { 'Content-Type': type } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('the route: a form post stores nothing, a pitch gets no conversion token, a real enquiry does', async () => {
  const saved = process.env.GMAIL_APP_PASSWORD;
  delete process.env.GMAIL_APP_PASSWORD;
  const inserts = [];
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(loadLeadsRouter(inserts));
  const server = app.listen(0);
  const { port } = server.address();
  const json = 'application/json';
  try {
    // What the spam tools sent from 28/09 to 30/09: a native form post.
    const form = await post(port, 'name=Jack&email=jack%40example.invalid&preferred_time=Jack&message=Hi', 'application/x-www-form-urlencoded');
    assert.strictEqual(form.status, 400, 'a form post is refused');
    assert.ok(!form.headers.location, 'with no redirect to /thank-you');
    assert.ok(!/@|\d{5}/.test(form.body), 'and the refusal does not print the email or phone for a harvester');
    assert.strictEqual(inserts.length, 0, 'and nothing is stored');

    // A pitch sent through the script: stored, flagged, no token.
    const jenna = PITCHES[1];
    const pitch = await post(port, JSON.stringify({ name: jenna.name, email: 'jenna@example.invalid', preferred_time: jenna.preferredTime, message: jenna.message }), json);
    assert.strictEqual(pitch.status, 200, 'the sender sees an ordinary success');
    assert.deepStrictEqual(JSON.parse(pitch.body), { ok: true, thankYou: '/thank-you' }, 'the bare thank-you page: no conversion token');
    assert.strictEqual(inserts.length, 1, 'it is still stored, so nothing genuine can be lost');
    assert.match(inserts[0].sql, /screened_reason/);
    assert.match(inserts[0].params[9], /^sales_pitch: /);

    // A genuine enquiry: stored, not flagged, with the token.
    const real = await post(port, JSON.stringify({ name: 'Reece William Todd', email: 'reece@example.invalid', preferred_time: 'Monday 11am', message: 'Everything relies on me and staffing issues' }), json);
    const parsed = JSON.parse(real.body);
    assert.strictEqual(parsed.ok, true);
    assert.match(parsed.thankYou, /^\/thank-you\?c=[A-Za-z0-9._-]+$/, 'a real enquiry still gets the conversion token');
    assert.strictEqual(inserts[1].params[9], '', 'and is not flagged');

    // Honeypot and validation, unchanged on the script path.
    const trap = await post(port, JSON.stringify({ website: 'x', name: 'Bot', email: 'bot@example.invalid' }), json);
    assert.deepStrictEqual(JSON.parse(trap.body), { ok: true });
    assert.strictEqual(inserts.length, 2, 'the honeypot stores nothing');
    const bad = await post(port, JSON.stringify({ name: 'Ann' }), json);
    assert.strictEqual(bad.status, 400);
    assert.deepStrictEqual(JSON.parse(bad.body), { error: 'Name and email are required.' });
  } finally {
    server.close();
    if (saved !== undefined) process.env.GMAIL_APP_PASSWORD = saved;
  }
});

test('a screened enquiry is emailed with a marked subject, and the column exists on an existing database', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'routes', 'leads.js'), 'utf8');
  assert.match(route, /`Filtered as a sales pitch: \$\{name\}`/);
  assert.match(route, /NOT counted as a Google Ads conversion/);
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  assert.match(schema, /ALTER TABLE leads ADD COLUMN IF NOT EXISTS screened_reason VARCHAR\(255\) NOT NULL DEFAULT '';/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8'), /screened_reason, created_at/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8'), /lead\.screened_reason/);
});

// ---- the contact record -------------------------------------------------------

test('a screened pitch never becomes a contact, and one an earlier sync built is removed', { skip: !process.env.DATABASE_URL && 'set DATABASE_URL' }, async () => {
  const db = require('../db/pool');
  const { syncFromLeads } = require('../lib/crm/contacts');
  const tag = `screen-${Date.now()}`;
  const pitchEmail = `${tag}-pitch@example.invalid`;
  const realEmail = `${tag}-real@example.invalid`;
  try {
    const { rows: [pitch] } = await db.query(
      `INSERT INTO leads (kind, name, email, message) VALUES ('contact', 'Pitch', $1, 'SEO') RETURNING id`, [pitchEmail]);
    await db.query(`INSERT INTO leads (kind, name, email, message) VALUES ('contact', 'Owner', $1, 'Help')`, [realEmail]);
    await syncFromLeads();
    const count = async (e) => (await db.query('SELECT COUNT(*)::int AS n FROM crm_contacts WHERE email = $1', [e])).rows[0].n;
    assert.strictEqual(await count(pitchEmail), 1, 'before screening, the earlier sync built a contact');

    await db.query(`UPDATE leads SET screened_reason = 'sales_pitch: test' WHERE id = $1`, [pitch.id]);
    const result = await syncFromLeads();
    assert.ok(result.prunedPitchContacts >= 1);
    assert.strictEqual(await count(pitchEmail), 0, 'the pitch contact is removed');
    assert.strictEqual(await count(realEmail), 1, 'a real contact is untouched');
    await syncFromLeads();
    assert.strictEqual(await count(pitchEmail), 0, 'and it does not come back');
  } finally {
    await db.query('DELETE FROM crm_contacts WHERE email IN ($1, $2)', [pitchEmail, realEmail]);
    await db.query('DELETE FROM leads WHERE email IN ($1, $2)', [pitchEmail, realEmail]);
  }
});
