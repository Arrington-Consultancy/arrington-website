// Scott's replies sound human, with no stack of separate paragraphs
// (Tom, 12/10/2026: "I just want it to sound human and no silly
// paragraphs"). Three layers, each pinned here: the cleanup that runs on
// every reply (lib/scott/humanise.js), the prompt that asks for the same
// thing (lib/scott/governance.js), and the chat bubble that shows a
// paragraph break as a plain line break with no gap.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { humaniseReply } = require('../../lib/scott/humanise');

const ROOT = path.join(__dirname, '..', '..');

describe('humaniseReply: the mechanical tells', () => {
  test('blank lines between paragraphs go; the paragraph break stays', () => {
    const out = humaniseReply('We have 12 jobs booked.\n\nThe Teignmouth job is due Friday.\n\n\nTony has it.');
    assert.equal(out, 'We have 12 jobs booked.\nThe Teignmouth job is due Friday.\nTony has it.');
  });

  test('em and en dashes become commas, and a numeric range reads "to"', () => {
    assert.equal(humaniseReply('Two more \u2014 both re-upholstery.'), 'Two more, both re-upholstery.');
    assert.equal(humaniseReply('Open 9\u20135 on weekdays.'), 'Open 9 to 5 on weekdays.');
    assert.doesNotMatch(humaniseReply('A \u2013 B \u2014 C'), /[\u2013\u2014]/);
  });

  test('markdown emphasis and headings are removed rather than shown as symbols', () => {
    assert.equal(humaniseReply('## Prices\n**Note:** closed bank holidays.'), 'Prices\nNote: closed bank holidays.');
  });

  test('a stock opener and a stock closer go, only at the ends', () => {
    const out = humaniseReply('Great question! That chair is \u00a3450 to re-cover.\n\nI hope this helps!');
    assert.equal(out, 'That chair is \u00a3450 to re-cover.');
    assert.equal(humaniseReply('Certainly. It is due Friday. Let me know if you have any other questions.'), 'It is due Friday.');
  });

  test('a closer that carries an offer or a next step stays', () => {
    const s = 'We could knit that by Friday. Let me know if you want it and I will book it in.';
    assert.equal(humaniseReply(s), s);
  });

  test('a reply that is nothing but a stock phrase is left alone rather than emptied', () => {
    assert.equal(humaniseReply('Certainly.'), 'Certainly.');
    assert.equal(humaniseReply('Hope that helps'), 'Hope that helps');
  });

  test('figures, names, dates and job references pass through untouched', () => {
    const s = 'SAKS-1038 for Helen Price, Teignmouth: \u00a31,250, half paid on 28/08/2026, 12 of 14 slots booked, 37.5% margin.';
    assert.equal(humaniseReply(s), s);
  });

  test('anything that is not a string is returned as it came', () => {
    assert.equal(humaniseReply(null), null);
    assert.equal(humaniseReply(undefined), undefined);
  });
});

describe('the cleanup runs on every reply a visitor sees', () => {
  const { callWorker, callReceptionist, __setClientFactoryForTests, __resetClientFactoryForTests } = require('../../lib/scott/orchestrator');

  function stub(payload) {
    __setClientFactoryForTests(() => ({
      messages: { create: async () => ({ content: [{ type: 'text', text: JSON.stringify(payload) }] }) }
    }));
  }

  test("a worker's reply is cleaned before it is returned", () => {
    // callWorker reads the company records from the database, so the
    // worker path is pinned by its return statement; Ruth's path below is
    // exercised for real with a stubbed model.
    const src = fs.readFileSync(path.join(ROOT, 'lib/scott/orchestrator.js'), 'utf8');
    assert.match(src, /return \{ workerId, worker, \.\.\.result\.data, reply: humaniseReply\(result\.data\.reply\), technicalFailure: false \};/);
  });

  test("Ruth's note is cleaned before it is returned", async () => {
    stub({ note: 'Certainly! Maggie looks after scheduling.\n\nI hope this helps.', route: [], refused: false });
    try {
      const result = await callReceptionist({ userMessage: 'Who does scheduling?', history: [] });
      assert.equal(result.note, 'Maggie looks after scheduling.');
    } finally {
      __resetClientFactoryForTests();
    }
  });

  test('the drafted write-back is not rewritten: an email keeps its own layout', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/scott/orchestrator.js'), 'utf8');
    assert.doesNotMatch(src, /humaniseReply\([^)]*writeback/);
  });
});

describe('the prompt asks for the same thing', () => {
  const { GOVERNANCE_PREAMBLE } = require('../../lib/scott/governance');

  test('fewer, fuller paragraphs, no stack of one-liners, no lists unless needed', () => {
    assert.match(GOVERNANCE_PREAMBLE, /fewer, fuller paragraphs/i);
    assert.match(GOVERNANCE_PREAMBLE, /Never a stack of one-line paragraphs/);
    assert.match(GOVERNANCE_PREAMBLE, /No headings, bold or bullet points unless the reader has to act/);
  });

  test('no stock opener or closer', () => {
    assert.match(GOVERNANCE_PREAMBLE, /Do not open with praise or a stock acknowledgement/);
    assert.match(GOVERNANCE_PREAMBLE, /do not close by offering more help/);
  });
});

describe('the chat shows a paragraph break as a line break, never a gap', () => {
  const widget = fs.readFileSync(path.join(ROOT, 'views/scott/partials/chat-widget.ejs'), 'utf8');
  const styles = fs.readFileSync(path.join(ROOT, 'views/scott/partials/styles.ejs'), 'utf8');

  test('both live render paths and the stored history use the reply text wrapper', () => {
    assert.equal((widget.match(/replyText\(opts\.text\)/g) || []).length, 2);
    assert.match(widget, /<span class="sc-msg-text"><%= String\(m\.content \|\| ''\)\.replace\(\/\\n\\s\*\\n\+\/g, '\\n'\)\.trim\(\) %><\/span>/);
  });

  test('the wrapper keeps line breaks', () => {
    assert.match(styles, /\.sc-msg-text \{ white-space: pre-line; \}/);
  });
});
