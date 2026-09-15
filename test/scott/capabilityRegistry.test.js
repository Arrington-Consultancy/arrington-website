// Scott demonstration: the capability registry is the single source, and
// the two legs never merge.
//
// Tom's instruction (15/09/2026): one controlled registry decides where a
// capability first becomes available, and navigation, level gating and the
// "available in My Business" behaviour all derive from it. The value of
// that is entirely in it being SINGLE, so most of this file is about the
// ways a second copy could creep back in.
//
// The property that matters most is the separation:
//
//   level  says how big the workspace is.
//   domain says what this person may see or do.
//
// They are ANDed in exactly one function. A registry that let a level
// stand in for a clearance would be an access-control bypass wearing a nav
// control's clothes, and it would be invisible from reading the sidebar.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const registry = require('../../lib/scott/capabilityRegistry');
const progression = require('../../lib/scott/progression');
const clearance = require('../../lib/scott/clearance');

const LEVELS = [1, 2, 3, 4];
const PERSONA_IDS = Object.keys(clearance.PERSONAS);
const allowAll = () => true;
const allowNone = () => false;

describe('the registry is well formed', () => {
  test('every capability has the fields the rest of the system reads', () => {
    registry.CAPABILITIES.forEach((c) => {
      assert.equal(typeof c.id, 'string', 'a capability with no id');
      assert.ok(c.id.length, `${c.id}: empty id`);
      assert.equal(typeof c.label, 'string', `${c.id}: no visitor label`);
      assert.ok(c.level === null || LEVELS.includes(c.level), `${c.id}: level ${c.level} is not 1-4 or null`);
      assert.ok(c.surface && typeof c.surface.kind === 'string', `${c.id}: no surface kind`);
      assert.ok(['nav', 'panel', 'action', 'hidden'].includes(c.surface.kind), `${c.id}: unknown surface kind`);
      assert.ok(Array.isArray(c.intent), `${c.id}: intent must be an array`);
      assert.ok(c.requiresDomain === null || typeof c.requiresDomain === 'string', `${c.id}: bad requiresDomain`);
    });
  });

  test('ids are unique, so one id cannot mean two capabilities', () => {
    const ids = registry.CAPABILITIES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate capability id');
  });

  test('every domain a capability requires is one the clearance model knows', () => {
    // A typo here would be silent and permanent: an unknown domain is
    // never held by anybody, so the capability would simply never appear
    // and would look like a deliberate decision.
    registry.CAPABILITIES.filter((c) => c.requiresDomain).forEach((c) => {
      const heldBySomebody = PERSONA_IDS.some((p) => clearance.personaCanSeeDomain(p, c.requiresDomain));
      assert.ok(heldBySomebody,
        `${c.id} requires "${c.requiresDomain}", which no persona holds — probably a typo`);
    });
  });

  test('a nav capability names a group that exists', () => {
    const groupIds = registry.GROUPS.map((g) => g.id);
    registry.CAPABILITIES.filter((c) => c.surface.kind === 'nav').forEach((c) => {
      assert.ok(groupIds.includes(c.surface.group), `${c.id} is in unknown group "${c.surface.group}"`);
    });
  });

  test('a crafted id is not a capability', () => {
    // The prototype trap that produced Scott's personaCanAct defect and
    // workspace finding T3. Cheaper not to have than to test for, but
    // worth pinning since this module is a lookup table by nature.
    ['constructor', 'toString', '__proto__', 'hasOwnProperty'].forEach((id) => {
      assert.equal(registry.get(id), null, `"${id}" resolved to a capability`);
      assert.equal(registry.available(id, 4, allowAll), false, `"${id}" was available`);
    });
  });
});

describe('THE TWO LEGS ARE ANDed, NEVER ORed', () => {
  test('a level alone never grants a domain-gated capability', () => {
    const gated = registry.CAPABILITIES.filter((c) => c.requiresDomain && c.level !== null);
    assert.ok(gated.length > 0, 'expected something domain-gated to measure');
    gated.forEach((c) => {
      LEVELS.forEach((lv) => {
        assert.equal(registry.available(c.id, lv, allowNone), false,
          `${c.id} was granted at level ${lv} to somebody with no clearance at all`);
      });
    });
  });

  test('clearance alone never grants a capability the level has not reached', () => {
    registry.CAPABILITIES.filter((c) => c.level !== null && c.level > 1).forEach((c) => {
      for (let lv = 1; lv < c.level; lv += 1) {
        assert.equal(registry.available(c.id, lv, allowAll), false,
          `${c.id} (level ${c.level}) appeared at level ${lv} for a fully cleared person`);
      }
    });
  });

  test('both together grant it, or the previous two tests prove nothing', () => {
    // The positive control. Without it, an `available()` that always
    // returned false would pass everything above.
    registry.CAPABILITIES.filter((c) => c.level !== null).forEach((c) => {
      assert.equal(registry.available(c.id, c.level, allowAll), true,
        `${c.id} never becomes available even at its own level with full clearance`);
    });
  });

  test('MIKE EVANS GAINS NOTHING BY REACHING LEVEL 4', () => {
    // Tom's own test, stated in his words. The narrowest clearance in the
    // company must hold exactly the same capability set at Level 4 as the
    // registry's clearance leg allows, which is to say the level adds
    // nothing a domain does not already permit.
    const mike = (d) => clearance.personaCanSeeDomain('mike_evans', d);
    const owner = (d) => clearance.personaCanSeeDomain('scott_mercer', d);
    const ownerOnly = registry.CAPABILITIES
      .filter((c) => c.requiresDomain && c.level !== null)
      .filter((c) => owner(c.requiresDomain) && !mike(c.requiresDomain));
    assert.ok(ownerOnly.length > 0, 'expected at least one owner-only capability, or this measures nothing');
    ownerOnly.forEach((c) => {
      LEVELS.forEach((lv) => {
        assert.equal(registry.available(c.id, lv, mike), false,
          `Mike reached ${c.id} at level ${lv}`);
      });
    });
  });
});

describe('the nav derives from the registry and nowhere else', () => {
  test('the sidebar reads caps.nav rather than listing pages itself', () => {
    // The point of the registry is that it is single. A sidebar that had
    // kept its own list of destinations would pass every behavioural test
    // here and still be a second source.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'scott', 'partials', 'sidebar.ejs'), 'utf8');
    assert.match(src, /_caps\.nav/, 'the sidebar no longer renders from the registry');
    // No hard-coded destination list. One `href="/scott"`-shaped literal
    // in a comment is fine; a list of them is the thing being forbidden.
    const literals = (src.match(/href="\/scott\/[a-z-]+"/g) || []);
    assert.deepEqual(literals, [], `the sidebar hard-codes destinations: ${literals.join(', ')}`);
  });

  test('every nav item at every level is something the registry declared', () => {
    LEVELS.forEach((lv) => {
      registry.navFor(lv, allowAll).forEach((g) => {
        g.items.forEach((it) => {
          const c = registry.get(it.id);
          assert.ok(c, `nav produced an unknown capability ${it.id}`);
          assert.equal(c.surface.kind, 'nav', `${it.id} is not a nav surface`);
          assert.ok(c.level <= lv, `${it.id} (level ${c.level}) appeared at level ${lv}`);
        });
      });
    });
  });

  test('an empty group is dropped rather than rendered as a bare heading', () => {
    LEVELS.forEach((lv) => {
      registry.navFor(lv, allowAll).forEach((g) => {
        assert.ok(g.items.length > 0, `level ${lv} renders an empty "${g.label}" group`);
      });
    });
  });

  test('the team is introduced in the same step the chat starts naming them', () => {
    // A real defect, found by looking at Level 3 rather than by reading
    // the code: the chat switched to naming the specialists at Level 3
    // while the strip saying who they are was tied to a Level 4
    // capability. A visitor met "Gareth Bell, Commercial" in an answer a
    // whole level before anything on screen introduced him.
    LEVELS.forEach((lv) => {
      const c = registry.viewCapabilities(lv, allowAll);
      if (c.chatDetail === 'team') {
        assert.equal(c.showTeamStrip, true,
          `level ${lv} names the workers in chat but does not introduce them`);
      }
    });
  });

  test('the four states are genuinely different sizes', () => {
    const size = (lv) => registry.navFor(lv, allowAll).reduce((t, g) => t + g.items.length, 0);
    const sizes = LEVELS.map(size);
    for (let i = 1; i < sizes.length; i += 1) {
      assert.ok(sizes[i] > sizes[i - 1], `level ${i + 1} is not larger than level ${i} (${sizes.join(', ')})`);
    }
    // And Level 1 really is small. The whole progression exists because
    // the full environment was too much at once; a Level 1 with a dozen
    // links would have solved nothing.
    assert.ok(sizes[0] <= 4, `Level 1 offers ${sizes[0]} destinations, which is not a calm workspace`);
  });
});

describe('the hidden surfaces stay hidden', () => {
  const hidden = registry.CAPABILITIES.filter((c) => c.surface.kind === 'hidden');

  test('there are some, and they are the ones Tom named', () => {
    const ids = hidden.map((c) => c.id).sort();
    assert.deepEqual(ids, ['brain_candidates', 'clearance_compare', 'invoice_demo', 'lead_capture']);
  });

  test('no level reveals any of them, for anybody', () => {
    hidden.forEach((c) => {
      assert.equal(c.level, null, `${c.id} has been given a level`);
      LEVELS.forEach((lv) => {
        assert.equal(registry.available(c.id, lv, allowAll), false,
          `${c.id} became available at level ${lv}`);
        PERSONA_IDS.forEach((p) => {
          const canSee = (d) => clearance.personaCanSeeDomain(p, d);
          assert.equal(registry.available(c.id, lv, canSee), false,
            `${c.id} became available to ${p} at level ${lv}`);
        });
      });
    });
  });

  test('none of them appears in the nav at any level', () => {
    // A null path means the capability is a region inside another page
    // rather than a route of its own (the proposed-facts queue lives on
    // the gaps page, which is itself a legitimate destination). There is
    // no link for the nav to render, so there is nothing to check here —
    // the "no level reveals any of them" test above is what covers it.
    const paths = hidden.map((c) => c.surface.path).filter(Boolean);
    assert.ok(paths.length > 0, 'expected at least one hidden route to check');
    LEVELS.forEach((lv) => {
      const navPaths = registry.navFor(lv, allowAll).flatMap((g) => g.items.map((i) => i.path));
      paths.forEach((p) => {
        assert.ok(!navPaths.includes(p), `${p} is linked at level ${lv}`);
      });
    });
  });
});

describe('a question is answered; an action without its tool is signposted', () => {
  // Tom's worked pair, and the guard that makes it behave. Both sentences
  // carry the same customer and the same money: only one instructs.

  test("'What does Mrs Jones owe us?' is never diverted, at any level", () => {
    LEVELS.forEach((lv) => {
      assert.equal(registry.detectUnavailable('What does Mrs Jones owe us?', lv, allowAll), null);
    });
  });

  test("'Invoice Mrs Jones for £160.' points at My Business from Level 1", () => {
    const d = registry.detectUnavailable('Invoice Mrs Jones for £160.', 1, allowAll);
    assert.ok(d, 'the request was not recognised');
    assert.equal(d.level, 2);
    assert.equal(d.levelLabel, 'My Business');
    assert.match(d.message, /I can do that in My Business/);
    assert.equal(d.cta, 'Open My Business');
  });

  test('the same sentence is silent once the tool is there', () => {
    [2, 3, 4].forEach((lv) => {
      assert.equal(registry.detectUnavailable('Invoice Mrs Jones for £160.', lv, allowAll), null,
        `still signposting invoicing at level ${lv}, where it is available`);
    });
  });

  test('no knowledge question is diverted, whatever it is about', () => {
    // Every one of these is about something a later level owns the TOOL
    // for. Under "same brain, more tools" every one of them is answered.
    [
      'What is the bank balance?',
      'How much capacity have we got next week?',
      'What did we make last month?',
      'Who is on holiday next week?',
      'What does the VAT position look like?',
      'How many reviews did we get?',
      'Where are we losing money?'
    ].forEach((q) => {
      LEVELS.forEach((lv) => {
        assert.equal(registry.detectUnavailable(q, lv, allowAll), null,
          `"${q}" was diverted at level ${lv} — a level must never withhold knowledge`);
      });
    });
  });

  test('it identifies the FIRST level that has the capability, not just a higher one', () => {
    registry.CAPABILITIES.filter((c) => c.level !== null && c.intent.length).forEach((c) => {
      c.intent.forEach((phrase) => {
        for (let lv = 1; lv < c.level; lv += 1) {
          const d = registry.detectUnavailable(phrase, lv, allowAll);
          // Another capability may legitimately match the same phrase
          // first; what must never happen is being sent past the first
          // level that actually has what was asked for.
          if (d) assert.ok(d.level <= c.level, `"${phrase}" at level ${lv} was sent to ${d.level}, past ${c.level}`);
        }
      });
    });
  });

  test('somebody who will never be allowed it is not sold a level that still refuses them', () => {
    // Pointing Mike Evans at My Whole Company for "find me work" would be
    // selling him a destination that will refuse him when he arrives,
    // because Lead Finder needs a clearance he does not hold. Where the
    // level would not help, this stays silent and the ordinary refusal
    // stands.
    const mike = (d) => clearance.personaCanSeeDomain('mike_evans', d);
    assert.equal(registry.detectUnavailable('find me work', 1, mike), null);
    // Positive control: the owner IS pointed there.
    const owner = (d) => clearance.personaCanSeeDomain('scott_mercer', d);
    const d = registry.detectUnavailable('find me work', 1, owner);
    assert.ok(d && d.level === 4, 'the owner should be pointed at My Whole Company');
  });

  test('the visitor sentence carries no implementation language', () => {
    // Tom's instruction: do not explain this with worker names, capability
    // ids, routing architecture or internal terminology.
    const forbidden = [/lane/i, /clearance/i, /domain/i, /worker/i, /capability/i, /level \d/i, /_/];
    registry.CAPABILITIES.filter((c) => c.level !== null && c.intent.length).forEach((c) => {
      const d = registry.detectUnavailable(c.intent[0], 1, allowAll);
      if (!d) return;
      forbidden.forEach((re) => {
        assert.ok(!re.test(d.message), `${c.id}'s message leaks implementation language: "${d.message}"`);
        assert.ok(!re.test(d.cta), `${c.id}'s CTA leaks implementation language: "${d.cta}"`);
      });
    });
  });

  test('the dashboard never suggests a question its own level would signpost', () => {
    // The owner's suggested questions vary by level (views/scott/dashboard.ejs).
    // A chip that answers with "I can do that in My Whole Company" is a
    // dead end offered by the interface itself, which is worse than no
    // chip: the visitor clicked what they were given and got a signpost.
    //
    // Read out of the view rather than restated here, so the two cannot
    // drift apart. If the extraction ever stops finding them the test
    // says so rather than passing on an empty list.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'scott', 'dashboard.ejs'), 'utf8');
    const block = src.slice(src.indexOf('var OWNER_BY_LEVEL = {'), src.indexOf('var activeSuggestions'));
    assert.ok(block.length > 100, 'could not find the per-level owner suggestions in the dashboard');

    let found = 0;
    [2, 3, 4].forEach((lv) => {
      const part = block.slice(block.indexOf(`${lv}: [`));
      const questions = (part.slice(0, part.indexOf(']')).match(/"([^"]+)"/g) || []).map((q) => q.slice(1, -1));
      assert.ok(questions.length >= 3, `level ${lv} has fewer than three suggestions, or the extraction broke`);
      questions.forEach((q) => {
        found += 1;
        const d = registry.detectUnavailable(q, lv, allowAll);
        assert.equal(d, null,
          `level ${lv} suggests "${q}", which that level would signpost to ${d && d.levelLabel}`);
      });
    });
    assert.ok(found >= 9, `only ${found} suggestions were checked`);
  });

  test('junk in gets null out rather than an exception', () => {
    [null, undefined, '', '   ', 42, {}, [], true].forEach((v) => {
      assert.equal(registry.detectUnavailable(v, 1, allowAll), null, `${JSON.stringify(v)} threw or matched`);
    });
  });
});

describe('the registry holds no business content', () => {
  test('no persona, no worker, no figure, no fictional fact', () => {
    // It is a packaging table. The moment it starts holding a record it
    // becomes something that needs clearance of its own.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'scott', 'capabilityRegistry.js'), 'utf8');
    // Comments explain the rules and necessarily quote a couple of these
    // words, so the scan runs on code only.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ['SAKS-', 'mercer', 'Mercer', 'Tony Marsh', 'Chloe', '£1', '£2', '£3'].forEach((needle) => {
      assert.ok(!code.includes(needle), `the registry has started holding business content: "${needle}"`);
    });
  });

  test('it requires nothing but the level model', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'scott', 'capabilityRegistry.js'), 'utf8');
    const requires = (src.match(/require\(['"][^'"]+['"]\)/g) || []);
    assert.deepEqual(requires, ["require('./progression')"],
      `the registry has grown dependencies: ${requires.join(', ')}`);
  });

  test('it never resolves clearance itself', () => {
    // It takes a predicate. If it ever imported the clearance module it
    // would be a second place that answers the access question.
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'scott', 'capabilityRegistry.js'), 'utf8');
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/clearance\./.test(code), 'the registry calls into the clearance module directly');
  });
});

describe('the level model and the registry agree', () => {
  test('every level the registry uses is a real level', () => {
    registry.CAPABILITIES.filter((c) => c.level !== null).forEach((c) => {
      assert.equal(progression.normaliseLevel(c.level), c.level, `${c.id} names level ${c.level}, which is not real`);
    });
  });

  test('every level has at least one capability arriving at it', () => {
    // A level nothing arrives at is a step that makes the workspace look
    // identical, which is worse than not having the step.
    LEVELS.forEach((lv) => {
      const arriving = registry.CAPABILITIES.filter((c) => c.level === lv);
      assert.ok(arriving.length > 0, `nothing arrives at level ${lv}`);
    });
  });

  test('the level labels the signpost uses are the ones on the rail', () => {
    registry.CAPABILITIES.filter((c) => c.level !== null && c.intent.length).forEach((c) => {
      const d = registry.detectUnavailable(c.intent[0], 1, allowAll);
      if (!d) return;
      assert.equal(d.levelLabel, progression.getLevel(d.level).label,
        'the signpost names a level differently from the rail');
    });
  });
});
