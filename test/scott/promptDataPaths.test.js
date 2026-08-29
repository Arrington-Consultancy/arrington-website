// Clearance on every data path entering an AI prompt.
//
// formatDeepFactsBlock has been gated since the clearance model was
// built, and that gave a misleading sense of coverage: everything ELSE
// buildContext assembles comes out of SQL and went into the prompt
// ungated. The job row with its price, the customer history with its
// notes, open enquiry text, the dashboard counts, the activity feed, the
// pending approvals, and the results of a free-text search.
//
// These tests inspect the actual assembled context string for a given
// persona and worker, which is the thing that reaches the model.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const clearance = require('../../lib/scott/clearance');
const contextBuilders = require('../../lib/scott/data/contextBuilders');

const DB = !!process.env.DATABASE_URL;

describe('clearance on SQL-derived prompt context', { skip: DB ? false : 'set DATABASE_URL to run' }, () => {
  const MESSAGE = 'What is happening with SAKS-1041 and what needs attention?';

  async function contextFor(personaId, workerId) {
    const entities = await contextBuilders.extractEntities(MESSAGE);
    return contextBuilders.buildContext(workerId, { message: MESSAGE, entities, personaId });
  }

  test('the domain map covers every SQL shape buildContext assembles', () => {
    // A new block added to buildContext without a domain would be the
    // exact regression this whole change is about.
    const d = contextBuilders.CONTEXT_DOMAINS;
    ['job', 'jobPrice', 'customer', 'enquiry', 'activity', 'summary', 'approvals']
      .forEach((k) => assert.ok(d[k], `CONTEXT_DOMAINS is missing ${k}`));
  });

  test('a job price reaches only a login with job_margin', async () => {
    for (const persona of Object.keys(clearance.PERSONAS)) {
      const ctx = await contextFor(persona, 'company_brain');
      const hasPrice = /- Kind: .*Price: £/.test(ctx);
      const mayHave = clearance.isDomainVisible(persona, 'company_brain', 'job_margin');
      assert.equal(hasPrice, hasPrice && mayHave,
        `${persona} received a job price in the prompt without job_margin clearance`);
      if (hasPrice) assert.ok(mayHave, `${persona} must hold job_margin to see a price`);
    }
  });

  test('the activity feed reaches only a login cleared for it', async () => {
    for (const persona of Object.keys(clearance.PERSONAS)) {
      const ctx = await contextFor(persona, 'company_brain');
      if (/source: scott_activity/.test(ctx)) {
        assert.ok(clearance.isDomainVisible(persona, 'company_brain', contextBuilders.CONTEXT_DOMAINS.activity),
          `${persona} received the activity feed without clearance for it`);
      }
    }
  });

  test('the dashboard snapshot reaches only a login cleared for it', async () => {
    for (const persona of Object.keys(clearance.PERSONAS)) {
      const ctx = await contextFor(persona, 'company_brain');
      if (/Business snapshot \(source:/.test(ctx)) {
        assert.ok(clearance.isDomainVisible(persona, 'company_brain', contextBuilders.CONTEXT_DOMAINS.summary),
          `${persona} received the dashboard snapshot without clearance for it`);
      }
    }
  });

  test('enquiry text reaches only a login with leads clearance', async () => {
    for (const persona of Object.keys(clearance.PERSONAS)) {
      const ctx = await contextFor(persona, 'company_brain');
      if (/source: scott_enquiries/.test(ctx)) {
        assert.ok(clearance.isDomainVisible(persona, 'company_brain', contextBuilders.CONTEXT_DOMAINS.enquiry),
          `${persona} received enquiry text without leads clearance`);
      }
    }
  });

  test('Company Brain is not a bypass, which is 07Q\'s own wording', async () => {
    // Company Brain has the widest worker permission of the six. That is
    // exactly why the human's clearance has to bind here.
    const narrow = await contextFor('mike_evans', 'company_brain');
    const owner = await contextFor('scott_mercer', 'company_brain');
    assert.ok(owner.length > narrow.length * 5,
      `the widest worker must still narrow to the human: owner ${owner.length} vs driver ${narrow.length}`);
    assert.ok(!/source: scott_activity/.test(narrow));
    assert.ok(!/Business snapshot/.test(narrow));
  });

  test('context size graduates by clearance rather than by worker alone', async () => {
    const sizes = {};
    for (const persona of ['scott_mercer', 'tony_marsh', 'chloe_reed', 'jo_bell']) {
      sizes[persona] = (await contextFor(persona, 'company_brain')).length;
    }
    assert.ok(sizes.scott_mercer > sizes.tony_marsh, 'owner must see more than senior management');
    assert.ok(sizes.tony_marsh > sizes.chloe_reed, 'senior management must see more than office admin');
    assert.ok(sizes.chloe_reed > sizes.jo_bell, 'office admin must see more than a knitting operative');
  });
});

describe('server-side action authority', () => {
  test('every mutating action names a domain', () => {
    Object.entries(clearance.ACTION_DOMAINS).forEach(([action, domain]) => {
      assert.ok(typeof domain === 'string' && domain.length, `${action} has no domain`);
    });
  });

  test('acting requires the clearance to see the record acted on', () => {
    // The rule the model is derived from, asserted directly so a future
    // edit cannot quietly grant an action to someone who cannot read what
    // they are acting on.
    Object.entries(clearance.ACTION_DOMAINS).forEach(([action, domain]) => {
      Object.keys(clearance.PERSONAS).forEach((persona) => {
        assert.equal(
          clearance.personaCanAct(persona, action),
          clearance.personaCanSeeDomain(persona, domain),
          `${persona}'s authority for ${action} must match their clearance for ${domain}`);
      });
    });
  });

  test('workshop and logistics staff hold no mutating authority at all', () => {
    ['ellie_park', 'ravi_singh', 'jo_bell', 'mike_evans', 'leah_morgan'].forEach((persona) => {
      Object.keys(clearance.ACTION_DOMAINS).forEach((action) => {
        assert.equal(clearance.personaCanAct(persona, action), false,
          `${persona} must not be able to perform ${action}`);
      });
    });
  });

  test('an unknown action is refused rather than allowed', () => {
    // Fail closed: a typo in a route's action name must deny, not permit.
    assert.equal(clearance.personaCanAct('scott_mercer', 'not_a_real_action'), false);
    assert.equal(clearance.personaCanAct('scott_mercer', ''), false);
    assert.equal(clearance.personaCanAct('scott_mercer', undefined), false);
  });
});
