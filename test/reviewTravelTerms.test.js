'use strict';

// Tom, 23/10/2026: "Not covering travel, UK wide taxi we can offer the
// virtual or travel expenses covered". Outside Devon and Cornwall the
// Commercial Review is by video call or in person with the client paying
// travel, and the taxi page (operators anywhere in the UK) says the same.
// No page may say travel is included or that we cover it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the review page offers a video call or a visit the client pays travel for', () => {
  const src = read('views/where-to-start-commercial-review.ejs');
  assert.ok(src.includes('We spend a day in the business with you, not just on a call,'));
  assert.ok(src.includes('Outside Devon and Cornwall, we can do it by video call, or come to you and you cover the travel costs, agreed before the day is booked.'));
});

test('the taxi page offers the same choice to operators anywhere in the UK', () => {
  const src = read('views/taxi-operators.ejs');
  assert.ok(src.includes('We work with operators anywhere in the UK, by video call, or Tom comes to you in person and you cover the travel costs, agreed before he sets off.'));
  assert.ok(!src.includes('on request, with travel costs agreed'), 'the old taxi line is back');
});

test('no offer page says travel is included or paid by us', () => {
  for (const f of ['views/where-to-start-commercial-review.ejs', 'views/taxi-operators.ejs', 'lib/whereToStartOffers.js', 'lib/mainNav.js']) {
    assert.ok(!/travel (is )?included|including travel|we cover (the )?travel|travel (costs|expenses) (are )?covered by us/i.test(read(f)), f);
  }
});
