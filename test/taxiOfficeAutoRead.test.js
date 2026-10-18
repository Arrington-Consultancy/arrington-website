'use strict';

// The workers read the inbox as soon as someone opens the office (Tom,
// 18/10/2026: "Ai worker disappeared", after opening Complaints on a fresh
// session and finding it empty until the inbox was read by hand, and the
// first read of the day taking long enough to look stuck).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');

const data = require('../lib/taxiOffice/data');
const ai = require('../lib/taxiOffice/ai');
const office = require('../lib/taxiOffice/office');
const { mountPageRoute, BASE } = require('../routes/taxiOffice');

function start(sessionId) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => { req.session = { id: req.get('x-test-session') || sessionId, user: { id: 1, username: 'tom', role: 'admin' } }; res.locals.csrfToken = 'test'; next(); });
  mountPageRoute(app);
  return new Promise((resolve) => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
}

const answer = (body) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(body) }] });
const isReading = (req) => Boolean(req.output_config.format.schema.properties.intent);

// A slow stand-in for the model: a reading takes `ms`; anything else fails,
// so the office falls back to what it prepared.
function withSlowAi(ms, fn) {
  const saved = { flag: process.env.ENABLE_TAXI_OFFICE_AI, key: process.env.ANTHROPIC_API_KEY };
  process.env.ENABLE_TAXI_OFFICE_AI = 'true';
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  const inbox = data.seedInbox(data.todayLondon());
  const readings = [];
  ai.__setClientFactoryForTests(() => ({
    messages: {
      create: async (req) => {
        if (!isReading(req)) throw new Error('not in this test');
        const e = inbox.find((x) => req.messages[0].content.includes(x.from));
        readings.push(e ? e.id : '?');
        await new Promise((r) => setTimeout(r, ms));
        return answer(e.prepared);
      }
    }
  }));
  office.__shared.clear();
  return Promise.resolve(fn(readings)).finally(() => {
    if (saved.flag === undefined) delete process.env.ENABLE_TAXI_OFFICE_AI; else process.env.ENABLE_TAXI_OFFICE_AI = saved.flag;
    if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved.key;
    office.__shared.clear();
  });
}

test('opening Complaints on a fresh session finds the complaints, not an empty page', async () => {
  const before = process.env.ENABLE_TAXI_OFFICE_AI;
  delete process.env.ENABLE_TAXI_OFFICE_AI;
  office.reset('auto-read-plain');
  const srv = await start('auto-read-plain');
  try {
    const html = await (await fetch(`http://127.0.0.1:${srv.address().port}${BASE}/complaints`)).text();
    assert.ok((html.match(/class="to-complaint to-panel"/g) || []).length > 0, 'the complaints are there on arrival');
    assert.doesNotMatch(html, /Not read yet|data-reading-url/);
    const today = await (await fetch(`http://127.0.0.1:${srv.address().port}${BASE}/`)).text();
    assert.doesNotMatch(today, /Read the inbox \(/, 'no button to read what is already read');
  } finally {
    srv.close();
    office.reset('auto-read-plain');
    if (before === undefined) delete process.env.ENABLE_TAXI_OFFICE_AI; else process.env.ENABLE_TAXI_OFFICE_AI = before;
  }
});

test('the day\'s first reading: the page opens at once saying the workers are reading, then they finish; nothing is read twice', async () => {
  await withSlowAi(2600, async (readings) => {
    office.reset('auto-read-a');
    office.reset('auto-read-b');
    const srv = await start('auto-read-a');
    const base = `http://127.0.0.1:${srv.address().port}${BASE}`;
    const as = (id) => ({ headers: { 'x-test-session': id } });
    try {
      const t0 = Date.now();
      const first = await (await fetch(base + '/complaints', as('auto-read-a'))).text();
      assert.ok(Date.now() - t0 < 2500, 'the page does not wait for the whole reading');
      assert.match(first, /data-reading-url="\/taxi-demo\/office\/inbox\/reading\.json"/, 'it says the workers are reading, and checks back');
      assert.match(first, /Reading the inbox now/);
      assert.doesNotMatch(first, /Read the inbox<\/button>/, 'no button to start what has started');
      assert.equal((await (await fetch(base + '/inbox/reading.json', as('auto-read-a'))).json()).reading, true);

      // A second visitor arriving now, and the first pressing Read as well,
      // wait on the same readings rather than paying for them again.
      const second = fetch(base + '/', as('auto-read-b')).then((r) => r.text());
      const pressed = await fetch(base + '/inbox/check-all', { method: 'POST', redirect: 'manual', headers: { 'x-test-session': 'auto-read-a', 'content-type': 'application/x-www-form-urlencoded' }, body: '_csrf=test' });
      assert.equal(pressed.status, 303);
      await second;
      const status = await (await fetch(base + '/inbox/reading.json', as('auto-read-a'))).json();
      assert.deepEqual(status, { reading: false, unread: 0 });

      const n = data.seedInbox(data.todayLondon()).length;
      assert.equal(readings.length, n, `each of the ${n} emails read once, for both visitors (${readings.join(', ')})`);
      const done = await (await fetch(base + '/complaints', as('auto-read-a'))).text();
      assert.ok((done.match(/class="to-complaint to-panel"/g) || []).length > 0);
      assert.doesNotMatch(done, /data-reading-url/);
    } finally {
      srv.close();
      office.reset('auto-read-a');
      office.reset('auto-read-b');
    }
  });
});

test('the page reloads itself when the workers finish, and gives up after three minutes', () => {
  const js = require('fs').readFileSync(path.join(__dirname, '..', 'public', 'js', 'taxi-office.js'), 'utf8');
  assert.match(js, /querySelector\('\[data-reading-url\]'\)/);
  assert.match(js, /if \(j && !j\.reading\) \{ window\.location\.reload\(\);/);
  assert.match(js, /3 \* 60 \* 1000/);
});
