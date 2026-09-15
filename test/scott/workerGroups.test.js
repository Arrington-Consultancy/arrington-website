// Scott demonstration: the specialists, presented as groups (15/09/2026).
//
// Tom asked for nine names to become a smaller number of understandable
// groups, and attached the condition that matters: "Preserve the underlying
// capabilities and permissions. Simplifying the presentation must not widen
// access or break the existing clearance model."
//
// That is the whole risk in this change, and it is a specific one. Putting
// Gareth Bell and Bob Fletcher under one heading called "Winning work" is a
// sentence about the interface. It would become a sentence about ACCESS the
// moment anything started resolving permission through the group — at which
// point the two workers' domains would effectively pool, and the narrower of
// them would silently gain the wider one's reach. Nothing does that today,
// and these tests exist so nothing starts.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workerGroups = require('../../lib/scott/workerGroups');
const workers = require('../../lib/scott/workers');
const clearance = require('../../lib/scott/clearance');

const MODULE_PATH = path.join(__dirname, '..', '..', 'lib', 'scott', 'workerGroups.js');

function activeSpecialistIds() {
  return workers.WORKERS
    ? Object.values(workers.WORKERS)
      .filter((w) => w && w.active !== false && w.id !== 'receptionist')
      .map((w) => w.id)
    : [];
}

describe('the grouping is presentation only', () => {
  test('the module names no domain, no clearance and no permission', () => {
    // The strongest form of the guarantee: it cannot widen access because
    // it has no vocabulary for access at all. Read from source, because a
    // module that merely does not USE a domain today is one edit away from
    // using one, and that edit should have to go red here.
    const src = fs.readFileSync(MODULE_PATH, 'utf8');
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ['domain', 'clearance', 'persona', 'canSee', 'permission', 'sourceClass', 'PERSONA_DOMAINS', 'WORKER_DOMAINS']
      .forEach((word) => {
        assert.ok(!code.includes(word),
          `workerGroups.js mentions "${word}" in code — a grouping that reasons about access is not a grouping`);
      });
  });

  test('it requires nothing from the clearance model', () => {
    const src = fs.readFileSync(MODULE_PATH, 'utf8');
    assert.ok(!/require\(/.test(src),
      'workerGroups.js requires another module — it is a mapping and should need nothing');
  });

  test('THE PERMISSION MODEL IS UNCHANGED: grouped workers keep separate domains', () => {
    // The specific failure this guards. Commercial and Customers & Marketing
    // are shown under one heading; if grouping ever pooled reach, these two
    // sets would become equal.
    const a = clearance.WORKER_DOMAINS.commercial;
    const b = clearance.WORKER_DOMAINS.customers_marketing;
    assert.ok(Array.isArray(a) && Array.isArray(b));
    assert.notDeepEqual([...a].sort(), [...b].sort(),
      'the two workers under "Winning work" now hold identical domains — the grouping has leaked into the permission model');

    // And the same for the pair under "Getting it done".
    const ops = clearance.WORKER_DOMAINS.operations;
    const qc = clearance.WORKER_DOMAINS.quality_control;
    if (Array.isArray(ops) && Array.isArray(qc)) {
      assert.notDeepEqual([...ops].sort(), [...qc].sort(),
        'operations and quality_control now hold identical domains');
    }
  });

  test('a group grants nothing: no persona or worker gains a domain from it', () => {
    // Belt and braces on the two above. For every group, the union of its
    // workers' domains must not be what any single member can read.
    workerGroups.GROUPS.forEach((g) => {
      if (g.workerIds.length < 2) return;
      const union = new Set();
      g.workerIds.forEach((id) => (clearance.WORKER_DOMAINS[id] || []).forEach((d) => union.add(d)));
      g.workerIds.forEach((id) => {
        const own = clearance.WORKER_DOMAINS[id] || [];
        if (own.includes('*')) return;
        assert.notEqual(own.length, union.size,
          `${id} can read everything its group can — grouping appears to have pooled clearance in "${g.label}"`);
      });
    });
  });
});

describe('the grouping is complete and smaller', () => {
  test('there are fewer groups than specialists, or it has not simplified anything', () => {
    const specialists = activeSpecialistIds();
    assert.ok(specialists.length > 0, 'expected a real worker register to measure against');
    assert.ok(workerGroups.GROUPS.length < specialists.length,
      `${workerGroups.GROUPS.length} groups for ${specialists.length} specialists is not a simplification`);
    // A business owner should not meet more than a handful of choices.
    assert.ok(workerGroups.GROUPS.length <= 5,
      `${workerGroups.GROUPS.length} groups is heading back towards an org chart`);
  });

  test('EVERY active specialist is placed in exactly one group', () => {
    // The failure this catches is a worker silently disappearing from the
    // interface when it is added to the register and not to a group: its
    // answers would still arrive, from a part of the business the screen
    // never mentions.
    const specialists = activeSpecialistIds();
    const placements = new Map();
    workerGroups.GROUPS.forEach((g) => {
      g.workerIds.forEach((id) => placements.set(id, (placements.get(id) || 0) + 1));
    });

    const unplaced = specialists.filter((id) => !placements.has(id));
    assert.deepEqual(unplaced, [],
      `these active specialists appear in no group and would vanish from the interface: ${unplaced.join(', ')}`);

    const doubled = [...placements.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    assert.deepEqual(doubled, [],
      `these workers are in more than one group, so the routing glow is ambiguous: ${doubled.join(', ')}`);
  });

  test('no group names a worker that does not exist', () => {
    const known = new Set(Object.keys(clearance.WORKER_DOMAINS));
    workerGroups.GROUPS.forEach((g) => {
      g.workerIds.forEach((id) => {
        assert.ok(known.has(id), `group "${g.label}" names unknown worker "${id}"`);
      });
    });
  });

  test('Ruth is in no group: she is who you talk to, not a department', () => {
    assert.equal(workerGroups.groupForWorker('receptionist'), null);
    workerGroups.GROUPS.forEach((g) => {
      assert.ok(!g.workerIds.includes('receptionist'), `Ruth is inside "${g.label}"`);
    });
  });

  test('every group has a label and a blurb a business owner would recognise', () => {
    workerGroups.GROUPS.forEach((g) => {
      assert.ok(g.label && g.label.length > 3, `${g.id} has no label`);
      assert.ok(g.blurb && g.blurb.length > 8, `${g.id} has no blurb`);
      // The point of the rename. A heading that still reads as a department
      // name has not done the job Tom asked for.
      assert.doesNotMatch(g.label, /_/, `${g.id}: label is a slug, not a name`);
    });
  });
});

describe('lookups behave', () => {
  test('a crafted id does not resolve a group through Object.prototype', () => {
    ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']
      .forEach((k) => assert.equal(workerGroups.groupForWorker(k), null, `${k} resolved to a group`));
  });

  test('a non-string id is refused rather than throwing', () => {
    [undefined, null, 0, {}, [], true, Symbol('x')].forEach((v) => {
      assert.equal(workerGroups.groupForWorker(v), null);
    });
  });

  test('labelForWorker falls back to the worker own role rather than an empty cell', () => {
    assert.equal(workerGroups.labelForWorker('commercial'), 'Winning work');
    assert.equal(workerGroups.labelForWorker('receptionist', 'Receptionist'), 'Receptionist');
    assert.ok(workerGroups.labelForWorker('nonexistent').length > 3);
  });

  test('activeGroups drops a group with no active worker behind it', () => {
    // A heading with nothing behind it is a promise the demonstration
    // cannot keep.
    const onlyMoney = workerGroups.activeGroups(['finance_accounts']);
    assert.equal(onlyMoney.length, 1);
    assert.equal(onlyMoney[0].id, 'the_money');

    assert.deepEqual(workerGroups.activeGroups([]), []);
    assert.deepEqual(workerGroups.activeGroups(null), []);
  });

  test('activeGroups does not mutate the register', () => {
    const before = JSON.stringify(workerGroups.GROUPS);
    workerGroups.activeGroups(['commercial']);
    assert.equal(JSON.stringify(workerGroups.GROUPS), before);
  });
});
