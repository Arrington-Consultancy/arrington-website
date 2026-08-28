// Scott AI Demonstration — worker data integrity tests. Pure structural
// checks against the transcribed worker definitions, not against Drive
// itself (there is no way to verify "matches Drive" in an automated test —
// that verification happened by direct read during transcription, see the
// implementation handoff record). These tests guard against accidental
// regressions to the six-worker structure itself: no seventh worker, no
// duplicate names, every required field present.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { WORKERS, WORKER_IDS, ROUTABLE_WORKER_IDS, getWorker } = require('../../lib/scott/workers');

const EXPECTED_IDS = ['receptionist', 'commercial', 'operations', 'customers_marketing', 'company_brain', 'governance'];
const EXPECTED_CHARACTERS = {
  receptionist: 'Ruth Bailey',
  commercial: 'Gareth Bell',
  operations: 'Maggie Trent',
  customers_marketing: 'Bob Fletcher',
  company_brain: 'Derek Haines',
  governance: 'Patricia Moss'
};

describe('worker set integrity', () => {
  test('exactly six workers, matching the approved canonical set', () => {
    assert.deepEqual(WORKER_IDS.sort(), EXPECTED_IDS.sort());
  });

  test('receptionist is excluded from ROUTABLE_WORKER_IDS (it routes, it is never routed to)', () => {
    assert.ok(!ROUTABLE_WORKER_IDS.includes('receptionist'));
    assert.equal(ROUTABLE_WORKER_IDS.length, 5);
  });

  test('each worker has the correct fictional character name (per Bob Fletcher replacing Leanne Price)', () => {
    for (const [id, name] of Object.entries(EXPECTED_CHARACTERS)) {
      assert.equal(WORKERS[id].characterName, name, `${id} should be ${name}`);
    }
  });

  test('every worker has every required field, non-empty', () => {
    const requiredStringFields = ['canonicalName', 'characterName', 'displayRole', 'purpose', 'boundaries', 'permissionsSummary', 'approvalGates', 'personality', 'accent', 'initials', 'tagline'];
    for (const id of WORKER_IDS) {
      const w = WORKERS[id];
      for (const field of requiredStringFields) {
        assert.ok(typeof w[field] === 'string' && w[field].trim().length > 0, `${id}.${field} must be a non-empty string`);
      }
      assert.ok(Array.isArray(w.scope) && w.scope.length > 0, `${id}.scope must be a non-empty array`);
    }
  });

  test('canonical names all start with "SCOTT\'S" and are unique', () => {
    const names = WORKER_IDS.map((id) => WORKERS[id].canonicalName);
    assert.equal(new Set(names).size, names.length, 'canonical names must be unique');
    for (const name of names) assert.ok(name.startsWith("SCOTT'S"), `${name} should start with SCOTT'S`);
  });

  test('character names are all unique (no two workers share a fictional identity)', () => {
    const characters = WORKER_IDS.map((id) => WORKERS[id].characterName);
    assert.equal(new Set(characters).size, characters.length);
  });

  test('accent colours are all distinct (so the UI never renders two workers identically)', () => {
    const accents = WORKER_IDS.map((id) => WORKERS[id].accent);
    assert.equal(new Set(accents).size, accents.length);
  });

  test('getWorker returns null for an unknown id rather than throwing', () => {
    assert.equal(getWorker('does_not_exist'), null);
  });

  test('getWorker returns the same object as WORKERS[id]', () => {
    for (const id of WORKER_IDS) {
      assert.equal(getWorker(id), WORKERS[id]);
    }
  });

  test('every worker\'s personality text ends with the governance disclaimer that traits never override authority', () => {
    for (const id of WORKER_IDS) {
      const p = WORKERS[id].personality.toLowerCase();
      assert.ok(
        p.includes('never') && (p.includes('override') || p.includes('alter') || p.includes('change')),
        `${id}'s personality text should explicitly state traits never override its authority/evidence`
      );
    }
  });
});
