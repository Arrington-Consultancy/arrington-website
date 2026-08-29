// Proves the deep company data (lib/scott/deepBusinessFacts.js) actually
// gets gated by the clearance system end to end, not just that the two
// modules exist separately with matching-looking domain strings.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const facts = require('../../lib/scott/deepBusinessFacts');
const clearance = require('../../lib/scott/clearance');

// Every array of records in the module that carries a `domain` field.
const RECORD_ARRAYS = {
  serviceEconomics: facts.SERVICE_ECONOMICS,
  currentJobs: facts.CURRENT_JOBS,
  wipAgeingAlerts: facts.WIP_AGEING_ALERTS,
  qualityQueue: facts.QUALITY_QUEUE,
  openPurchaseOrders: facts.OPEN_PURCHASE_ORDERS,
  supplierDirectory: facts.SUPPLIER_DIRECTORY,
  stockSnapshot: facts.STOCK_SNAPSHOT,
  staff: facts.STAFF,
  hrCurrentIssues: facts.HR_CURRENT_ISSUES,
  costOpportunities: facts.COST_OPPORTUNITIES
};

// Every single-object record that carries a `domain` field.
const SINGLE_RECORDS = {
  corporateProfile: facts.CORPORATE_PROFILE,
  directorPosition: facts.DIRECTOR_POSITION,
  taxPosition: facts.TAX_POSITION,
  financeSummary: facts.FINANCE_SUMMARY,
  qualityKpis: facts.QUALITY_KPIS,
  capacityNote: facts.CAPACITY_NOTE
};

describe('every record carries a domain that actually exists somewhere in the clearance model', () => {
  const knownDomains = new Set(['*']);
  for (const list of Object.values(clearance.PERSONA_DOMAINS)) for (const d of list) knownDomains.add(d);
  for (const list of Object.values(clearance.WORKER_DOMAINS)) for (const d of list) knownDomains.add(d);

  test('array records', () => {
    for (const [name, list] of Object.entries(RECORD_ARRAYS)) {
      assert.ok(Array.isArray(list) && list.length > 0, `${name} should be a non-empty array`);
      for (const record of list) {
        assert.ok(record.domain, `every record in ${name} must carry a domain field (found one without: ${JSON.stringify(record).slice(0, 80)})`);
        assert.ok(knownDomains.has(record.domain), `${name} record uses domain "${record.domain}" which no persona or worker in clearance.js actually grants — it would be permanently invisible to everyone`);
      }
    }
  });

  test('single-object records', () => {
    for (const [name, record] of Object.entries(SINGLE_RECORDS)) {
      assert.ok(record.domain, `${name} must carry a domain field`);
      assert.ok(knownDomains.has(record.domain), `${name} uses domain "${record.domain}" which no persona or worker grants`);
    }
  });

  for (const list of Object.values(facts.BORROWING_SCHEDULE)) {
    test(`borrowing schedule entries use a granted domain (${list.kind})`, () => {
      assert.ok(knownDomains.has(list.domain));
    });
  }
});

describe('clearance actually filters this real data, not just abstract domain strings', () => {
  test("Mike Evans cannot see the Director's Loan Account through any worker", () => {
    assert.equal(clearance.isDomainVisible('mike_evans', 'finance_accounts', facts.DIRECTOR_POSITION.domain), false);
    assert.equal(clearance.isDomainVisible('mike_evans', 'operations', facts.DIRECTOR_POSITION.domain), false);
    assert.equal(clearance.isDomainVisible('mike_evans', 'company_brain', facts.DIRECTOR_POSITION.domain), false);
  });

  test('Scott Mercer can see the DLA ledger through Finance', () => {
    assert.equal(clearance.isDomainVisible('scott_mercer', 'finance_accounts', facts.DIRECTOR_POSITION.domain), true);
    // and the actual figure is there to be seen, not a placeholder
    assert.equal(facts.DIRECTOR_POSITION.directorsLoanAccount.currentBalanceGbp, 9850);
  });

  test('Jo Bell sees stock she needs (yarn) but not HR cases belonging to other staff', () => {
    const visibleStock = clearance.filterByClearance('jo_bell', 'operations', facts.STOCK_SNAPSHOT);
    assert.ok(visibleStock.length > 0, 'Jo should see at least some stock records');
    assert.equal(clearance.isDomainVisible('jo_bell', 'people_hr', facts.HR_CURRENT_ISSUES[0].domain), false);
  });

  test('Tony Marsh sees job-level margin on real current jobs, Ellie Park does not', () => {
    const jobsForTony = clearance.filterByClearance('tony_marsh', 'operations', facts.CURRENT_JOBS);
    const jobsForEllie = clearance.filterByClearance('ellie_park', 'operations', facts.CURRENT_JOBS);
    assert.equal(jobsForTony.length, facts.CURRENT_JOBS.length, 'Tony should see every current job (jobs_ops)');
    assert.equal(jobsForEllie.length, 0, "jobs_ops is not in Ellie's persona domain list, so she should see none of these records through this exact query");
  });

  test('the SAKS-1047 late-fabric story actually connects job, PO and risk in one place', () => {
    const job = facts.CURRENT_JOBS.find((j) => j.ref === 'SAKS-1047');
    const po = facts.OPEN_PURCHASE_ORDERS.find((p) => p.ref === job.poRef);
    assert.ok(job, 'SAKS-1047 must exist');
    assert.ok(po, "SAKS-1047's linked PO must exist");
    assert.equal(job.risk, 'RED');
    assert.match(po.detail, /Jane Fletcher|SAKS-1047/);
  });

  test('a quality hold actually blocks the linked job from being silently green', () => {
    const heldJob = facts.CURRENT_JOBS.find((j) => j.ref === 'SAKS-1045');
    const heldQuality = facts.QUALITY_QUEUE.find((q) => q.ref === heldJob.qualityRef);
    assert.ok(heldQuality, 'the job must reference a real quality record, not an orphaned ref');
    assert.notEqual(heldJob.risk, 'GREEN', 'a job awaiting mandatory QC must not be presented as risk-free');
  });
});
