// Scott demonstration: the everyday applications reuse the company, and
// they obey the same clearance rule as everything else.
//
// Tom's instruction (15/09/2026) allowed these to be built, and attached
// one condition worth testing rather than trusting: reuse the fictional
// customers, jobs, enquiries and dates that already exist, and do not
// create a disconnected fictional world merely to populate a screen.
//
// So the tests here are mostly about what these modules must NOT contain.
// A mailbox with its own customers would look identical on screen and be
// the exact failure the instruction names, and no behavioural test of the
// rendering would catch it.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const apps = require('../../lib/scott/workspaceApps');
const clearance = require('../../lib/scott/clearance');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'scott', 'workspaceApps.js'), 'utf8');
const CODE = SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

// A fixed date so nothing here depends on when it runs.
const NOW = new Date('2026-09-15T09:00:00Z');

describe('nothing here invents a second fictional world', () => {
  test('the module holds no customer, job reference, price or person', () => {
    [
      /SAKS-\d/,          // a job reference
      /£\s?\d/,           // a price
      /Mercer|Marsh|Reed|Morgan|Evans|Bell|Park|Singh/, // the staff
      /Tolley|Moorland|Teignmouth|Hartwell/             // customers
    ].forEach((re) => {
      assert.ok(!re.test(CODE), `workspaceApps.js has started holding fictional content: ${re}`);
    });
  });

  test('every surface reads through the shared repository', () => {
    // If one of these started querying its own tables of made-up data, it
    // would drift from the job board the first time anything changed.
    assert.match(CODE, /require\('\.\/data\/repository'\)/);
    ['getEnquiries', 'getJobs', 'getRecentActivity'].forEach((fn) => {
      assert.ok(CODE.includes(`repo.${fn}`), `nothing reads ${fn}, so a surface may have its own data`);
    });
  });

  test('the one table it owns holds no business content', () => {
    // Tasks stores a line of text and a flag. The moment a row here starts
    // quoting a record, it needs a clearance gate and this test should go
    // red rather than the omission being discovered on screen.
    const create = CODE.slice(CODE.indexOf('CREATE TABLE IF NOT EXISTS scott_tasks'));
    const columns = create.slice(0, create.indexOf(')'));
    ['price', 'amount', 'customer_id', 'domain', 'clearance', 'persona'].forEach((c) => {
      assert.ok(!columns.includes(c), `scott_tasks has grown a "${c}" column, which needs a clearance rule`);
    });
  });

  test('it creates its table itself rather than in the shared schema', () => {
    // Deliberate. This is unmerged work, and the 29/08/2026 release
    // incident (a column referencing a table created later in schema.sql,
    // invisible on every database with history and fatal on the one
    // without) is reason enough to keep a new table out of the shared file
    // until the feature is going somewhere. No foreign key either.
    const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8');
    assert.ok(!schema.includes('scott_tasks'), 'scott_tasks has been added to the shared schema');
    const create = CODE.slice(CODE.indexOf('CREATE TABLE IF NOT EXISTS scott_tasks'));
    assert.ok(!/REFERENCES/i.test(create.slice(0, 900)), 'scott_tasks has grown a foreign key');
  });
});

describe('clearance applies to a new surface exactly as it does to an old one', () => {
  test('each surface declares the domain it reads', () => {
    assert.equal(apps.DOMAINS.messages, 'leads');
    assert.equal(apps.DOMAINS.email, 'leads');
    assert.equal(apps.DOMAINS.calendar, 'jobs_ops');
    assert.equal(apps.DOMAINS.price, 'job_margin');
  });

  test('a mailbox for somebody without the domain is empty and says so', async () => {
    const r = await apps.loadMailbox({ canSee: () => false });
    assert.deepEqual(r.threads, []);
    assert.equal(r.withheld, true, 'an empty inbox and a withheld one must be distinguishable');
  });

  test('a calendar for somebody without the domain is empty and says so', async () => {
    const r = await apps.loadCalendar({ canSee: () => false });
    assert.deepEqual(r.week, []);
    assert.equal(r.withheld, true);
  });

  test('a missing predicate withholds rather than opens', async () => {
    // Fails closed. A caller that forgets to pass clearance must not get
    // everything; that is the direction this whole demonstration cares
    // about.
    assert.equal((await apps.loadMailbox({})).withheld, true);
    assert.equal((await apps.loadCalendar({})).withheld, true);
    assert.equal((await apps.loadMessageSummary({})).withheld, true);
  });

  test('THE PRICE IS A SEPARATE DOMAIN FROM THE JOB, in the diary too', () => {
    // The clearest thing these surfaces could have quietly broken. A
    // person who may see the diary must not learn what the work earns by
    // looking at it sideways: job_margin, not jobs_ops, exactly as on the
    // job card and in the worker's context.
    const jobs = [{
      ref: 'TEST-1', customer_name: 'A Customer', status: 'scheduled',
      price_pence: 14500, promised_date: '2026-09-16', collection_date: null, at_risk: false
    }];
    const from = new Date('2026-09-14');
    const to = new Date('2026-09-20');

    const withMargin = apps.buildEntries(jobs, { canSee: () => true, from, to });
    assert.equal(withMargin[0].price, '£145.00', 'the positive control failed: nobody sees the price');

    const withoutMargin = apps.buildEntries(jobs, { canSee: (d) => d !== 'job_margin', from, to });
    assert.equal(withoutMargin[0].price, null, 'the price reached somebody without job_margin');
    assert.equal(withoutMargin[0].ref, 'TEST-1', 'the job itself should still be in the diary');
  });

  test('a real persona without job_margin gets the diary and not the price', () => {
    // The same property, through the actual clearance model rather than a
    // stub, so a change to the model shows up here.
    const jobs = [{
      ref: 'TEST-2', customer_name: 'A Customer', status: 'scheduled',
      price_pence: 9900, promised_date: '2026-09-16', collection_date: null, at_risk: false
    }];
    const opts = { from: new Date('2026-09-14'), to: new Date('2026-09-20') };
    const mike = (d) => clearance.personaCanSeeDomain('mike_evans', d);
    assert.equal(clearance.personaCanSeeDomain('mike_evans', 'job_margin'), false,
      'the fixture assumes Mike lacks job_margin; the clearance model has changed');
    assert.equal(apps.buildEntries(jobs, { canSee: mike, ...opts })[0].price, null);
  });
});

describe('the calendar is built from dates the jobs already carry', () => {
  const jobs = [
    { ref: 'A-1', customer_name: 'One', status: 'scheduled', price_pence: null, promised_date: '2026-09-16', collection_date: '2026-09-18', at_risk: false },
    { ref: 'A-2', customer_name: 'Two', status: 'in_progress', price_pence: null, promised_date: '2026-09-16', collection_date: null, at_risk: true, risk_note: 'waiting on fabric' },
    { ref: 'A-3', customer_name: 'Three', status: 'completed', price_pence: null, promised_date: '2026-10-30', collection_date: null, at_risk: false }
  ];
  const from = new Date('2026-09-14');
  const to = new Date('2026-09-20');

  test('a promised date and a collection date are two entries, not one', () => {
    const e = apps.buildEntries(jobs, { canSee: () => true, from, to });
    const forA1 = e.filter((x) => x.ref === 'A-1');
    assert.equal(forA1.length, 2);
    assert.deepEqual(forA1.map((x) => x.kind).sort(), ['collection', 'promised']);
  });

  test('a job outside the week is not in the week', () => {
    const e = apps.buildEntries(jobs, { canSee: () => true, from, to });
    assert.ok(!e.some((x) => x.ref === 'A-3'), 'a job due in October appeared in a September week');
  });

  test('a job with no dates produces no entries rather than an invented one', () => {
    const e = apps.buildEntries([{ ref: 'B-1', customer_name: 'X', status: 'enquiry', promised_date: null, collection_date: null }], { canSee: () => true, from, to });
    assert.deepEqual(e, []);
  });

  test('risk travels with the entry, because that is the point of seeing it', () => {
    const e = apps.buildEntries(jobs, { canSee: () => true, from, to });
    const risky = e.find((x) => x.ref === 'A-2');
    assert.equal(risky.atRisk, true);
    assert.equal(risky.riskNote, 'waiting on fabric');
  });

  test('the week is always seven days, so an empty Wednesday stays empty', () => {
    // Collapsing empty days would make a quiet week look busy, which is
    // the one thing a diary must not do.
    const week = apps.buildWeek(apps.buildEntries(jobs, { canSee: () => true, from, to }), apps.startOfWeek(new Date('2026-09-15')));
    assert.equal(week.length, 7);
    assert.ok(week.some((d) => d.entries.length === 0), 'expected at least one empty day in the fixture');
  });

  test('the week starts on Monday, because a workshop week does', () => {
    // 2026-09-15 is a Tuesday.
    assert.equal(apps.isoDay(apps.startOfWeek(new Date('2026-09-15T12:00:00'))), '2026-09-14');
  });
});

describe('an email thread is a reading of records, not a store', () => {
  const enquiry = {
    id: 7,
    customer_name: 'A Customer',
    customer_email: 'someone@example.invalid',
    channel: 'website',
    subject: 'Two dining chairs',
    message: 'Could you look at two dining chairs please.',
    status: 'new',
    created_at: '2026-09-14T10:00:00Z'
  };

  test('the customer message is the first mail in the thread', () => {
    const t = apps.buildThread(enquiry, [], NOW);
    assert.equal(t.mails[0].direction, 'in');
    assert.equal(t.mails[0].body, enquiry.message);
    assert.equal(t.subject, 'Two dining chairs');
  });

  test('activity against that enquiry becomes the rest of the thread, in order', () => {
    const activity = [
      { related_enquiry_id: 7, actor: 'system', summary: 'Routed to the workshop.', created_at: '2026-09-14T11:00:00Z' },
      { related_enquiry_id: 99, actor: 'system', summary: 'Nothing to do with this thread.', created_at: '2026-09-14T11:30:00Z' }
    ];
    const t = apps.buildThread(enquiry, activity, NOW);
    assert.equal(t.mails.length, 2, 'another enquiry\'s activity leaked into this thread');
    assert.match(t.mails[1].body, /Routed to the workshop/);
  });

  test('an address is derived, never invented as a real domain', () => {
    // example.invalid is reserved and can never route anywhere, so a
    // demonstration address can always be told from a real one.
    assert.match(apps.addressFor('Mrs A Name', ''), /@example\.invalid$/);
    // A real one on the record is used as it stands.
    assert.equal(apps.addressFor('X', 'real@thing.test'), 'real@thing.test');
  });

  test('THERE IS NO SEND', () => {
    // Scott refuses external actions by construction everywhere else
    // (banking, social), and a mailbox that actually sent would be the
    // demonstration performing a real-world act on a fictional company's
    // behalf. The view must offer a draft and a route to approvals.
    const view = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'scott', 'email.ejs'), 'utf8');
    assert.ok(!/mailto:/i.test(view), 'the mailbox offers a real mailto');
    assert.ok(!/<form/i.test(view), 'the mailbox has grown a form of its own');
    assert.match(view, /Approvals before anything leaves/i, 'the mailbox does not say what happens to a reply');
  });
});

describe('the views stay inside the strict CSP', () => {
  // Nonces cover <style> and <script> elements only, never the style
  // attribute. This has bitten the Arrington Workspace finance page twice;
  // a grep is the only thing that catches it, and curl never does.
  ['email.ejs', 'calendar.ejs', 'tasks.ejs'].forEach((f) => {
    test(`${f} carries no inline style attribute`, () => {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'scott', f), 'utf8');
      assert.ok(!/\sstyle\s*=\s*"/.test(src), `${f} has an inline style attribute, which the CSP will block`);
    });

    test(`${f} compiles`, () => {
      const file = path.join(__dirname, '..', '..', 'views', 'scott', f);
      assert.doesNotThrow(() => ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file }));
    });
  });

  test('every write from these pages carries a CSRF token', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'scott', 'tasks.ejs'), 'utf8');
    const forms = (src.match(/<form[\s\S]*?<\/form>/g) || []);
    assert.ok(forms.length >= 2, 'expected the add and the tick forms');
    forms.forEach((f) => assert.ok(f.includes('_csrf'), `a form on tasks.ejs has no CSRF token: ${f.slice(0, 60)}`));
  });
});
