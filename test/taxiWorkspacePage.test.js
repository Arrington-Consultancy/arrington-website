// The taxi office AI workspace page, /taxi-and-private-hire-operators/
// office-workspace (19/10/2026). Built from the Google Ads worker's brief
// (approved for build by Tom), this worker's pushback and Tom's answers. It
// stays hidden until Tom has seen it. What is pinned: hidden in every sense,
// the two prices and nothing else, the checker claiming only what the demo
// does, Tom's story in the third person with the approved facts, the
// existing enquiry form, and the house rules.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const emitted = (p) => read(p).replace(/<%#[\s\S]*?%>/g, '');

const PATH = '/taxi-and-private-hire-operators/office-workspace';
const VIEW = 'views/taxi-workspace.ejs';
const ROUTE = 'routes/taxiWorkspace.js';
const { TAXI_WORKSPACE_PATH, TAXI_WORKSPACE_CONTACT, VIDEO_URL } = require('../routes/taxiWorkspace');
const { WORKSPACE_PRICE_PENCE, TAXI_WEBSITES_PATH } = require('../routes/taxiWebsites');
const { OFFERS } = require('../lib/whereToStartOffers');

function renderBody({ videoUrl = '' } = {}) {
  const src = emitted(VIEW).replace(/<%-\s*include\([^)]*\)\s*%>/g, '');
  const html = ejs.render(src, {
    theme: { vars: {} }, nonce: 'n', csrfToken: 't', navPages: [], content: {},
    websiteOffer: OFFERS.website_build, workspacePricePence: WORKSPACE_PRICE_PENCE, websitesPath: TAXI_WEBSITES_PATH,
    videoUrl, pageContact: TAXI_WORKSPACE_CONTACT
  });
  return html.slice(html.indexOf('<body>'));
}
const visibleText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const section = (body, attr) => {
  const start = body.indexOf(attr);
  assert.ok(start > 0, `${attr} is missing`);
  return visibleText(body.slice(start, body.indexOf('</div>', start)));
};

test('it is hidden until Tom has seen it: noindex twice, not in the menu, the footer or the sitemap, linked from nowhere', () => {
  assert.strictEqual(TAXI_WORKSPACE_PATH, PATH);
  const server = read('server.js');
  assert.ok(/taxiWorkspace\.mountPageRoute\(app, generateCsrfToken\)/.test(server), 'the route is not mounted');
  assert.ok(server.indexOf('taxiWorkspace.mountPageRoute') < server.indexOf("app.get('/:slug'"), 'mounted after the CMS catch-all');
  assert.ok(/res\.set\('X-Robots-Tag', 'noindex'\)/.test(read(ROUTE)), 'the X-Robots-Tag header is gone');
  assert.ok(/<meta name="robots" content="noindex">/.test(emitted(VIEW)), 'the robots meta tag is gone');
  const sitemapAt = server.indexOf("app.get('/sitemap.xml'");
  const sitemapEnd = server.indexOf('</urlset>', sitemapAt);
  assert.ok(sitemapAt > -1 && sitemapEnd > sitemapAt, 'the sitemap handler has moved; this test needs updating');
  assert.ok(!server.slice(sitemapAt, sitemapEnd).includes('office-workspace'), 'the page is in sitemap.xml');
  const robotsSrc = server.slice(server.indexOf("app.get('/robots.txt'"), sitemapAt);
  assert.ok(!robotsSrc.includes('office-workspace'), 'robots-disallowed, so no crawler would see the noindex');
  for (const f of ['views/partials/site-header.ejs', 'views/partials/site-footer.ejs', 'lib/navShell.js']) {
    assert.ok(!read(f).includes('office-workspace'), `${f} links to or names the page`);
  }
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel);
    return /\.(ejs|js|sql)$/.test(e.name) ? [rel] : [];
  });
  const offenders = ['views', 'lib', 'db', 'public/js', 'routes', 'taxi-demo/lib'].flatMap(walk)
    .filter((f) => f !== VIEW && f !== ROUTE)
    .filter((f) => read(f).includes('office-workspace'));
  assert.deepStrictEqual(offenders, [], `the page is linked or named from: ${offenders.join(', ')}`);
});

test('two products at £999 each, £1,998 for both, support optional with no monthly figure', () => {
  assert.strictEqual(WORKSPACE_PRICE_PENCE, 99900);
  assert.strictEqual(OFFERS.website_build.pricePence, 99900);
  const body = renderBody();
  const price = visibleText(body.slice(body.indexOf('data-price>'), body.indexOf('data-questions')));
  assert.ok(price.includes('Buy one or both'));
  assert.ok(/The office workspace £999/.test(price) && /A website for your firm £999/.test(price));
  assert.ok(price.includes('Both together are £1,998.'));
  assert.ok(price.includes('Support after setup is optional.') && price.includes("It's your choice."));
  assert.ok(body.includes(`href="${TAXI_WEBSITES_PATH}"`), 'the website card no longer links to the websites page');
  const text = visibleText(body);
  assert.ok(!/£(?!(?:999|1,998)\b)[0-9][0-9,]*/.test(text), 'a price other than £999 or £1,998 appeared');
  assert.ok(!/per month|\ba month\b|monthly fee of|\/month|save £|discount|introductory|bundle saving/i.test(text), 'a monthly figure or a reduction appeared');
});

test('the booking checker claims what the demo does, and nothing it does not', () => {
  const body = renderBody();
  const checker = section(body, 'data-checker');
  assert.ok(checker.includes('The AI booking checker'));
  const items = body.slice(body.indexOf('<ul class="ow-list">'), body.indexOf('</ul>', body.indexOf('<ul class="ow-list">')))
    .split('<li>').slice(1).map((li) => li.replace(/<\/li>[\s\S]*$/, '').trim().replace(/&#39;/g, "'"));
  assert.deepStrictEqual(items, [
    'A date or pickup time that does not match the email',
    'A pickup address or destination entered differently',
    'A flight number missing from the job or entered differently',
    "The customer's name spelt differently on the job",
    'A phone number on the email that differs from the one on the job',
    'The wrong number of passengers, or a wheelchair accessible car or larger vehicle asked for and not booked',
    'The same job booked twice, which usually happens when a customer rings and emails',
    'An emailed booking with no job in dispatch, or a return asked for and not booked',
    'A change or cancellation the customer asked for that has not been made in dispatch'
  ]);
  assert.ok(checker.includes('It flags and prepares the correction. A controller approves every change.'));
  const text = visibleText(body);
  for (const banned of [/checks every detail/i, /\bPO number/i, /booking history/i, /flight tracking|tracks? (?:the )?flights?/i, /capacity|more work than cars/i, /\beliminat/i, /\d+\s?%/, /saves? (?:you )?£/i, /only (?:one|firm|company) (?:to|that)|the first to/i]) {
    assert.ok(!banned.test(text), `the page claims something the demo does not do: ${banned}`);
  }
});

test('every claim in the checker list is something the demo matcher really flags', () => {
  // The statuses and diff fields behind each line, from lib/taxiOffice/match.js.
  const match = require('../lib/taxiOffice/match');
  const job = { ref: 'TW-1', status: 'booked', date: '2026-10-22', time: '16:40', name: 'Neil Ashworth', phone: '07700 900651', pickup: 'Exeter Airport', destination: 'Exmouth', passengers: 2, vehicle: 'saloon', flight: 'XR 2241' };
  const ext = { intent: 'new_booking', customer_name: 'Neil Ashworth', phone: '07700 900615', journeys: [{ ...job, flight: 'XR 2214', vehicle: 'wav', passengers: 3, time: '16:50' }], missing: [] };
  const fields = match.compare(ext, [job]).legs[0].diffs.map((d) => d.field).sort();
  assert.deepStrictEqual(fields, ['flight', 'passengers', 'phone', 'time', 'vehicle']);
  assert.equal(match.compare({ ...ext, customer_name: 'Neil Ashford', phone: job.phone, journeys: [{ ...job }] }, [job]).legs[0].diffs[0].field, 'name');
  assert.equal(match.compare({ ...ext, phone: job.phone, journeys: [{ ...job }] }, [job, { ...job, ref: 'TW-2' }]).status, 'duplicate');
  assert.equal(match.compare({ ...ext, journeys: [{ ...job, date: '2026-10-23' }] }, []).status, 'missing');
  assert.equal(match.compare({ ...ext, intent: 'cancel', phone: job.phone, journeys: [{ ...job }] }, [job]).status, 'to_cancel');
});

test("Tom's story is in the third person, with the approved facts only", () => {
  const tom = section(renderBody(), 'data-tom');
  assert.ok(tom.includes('Tom Arrington owned and ran Abacus and Falmouth Taxis in Cornwall for nearly twenty years, the last eight or so on iCabbi.'));
  assert.ok(tom.includes('around 3,500 jobs a week'), 'the peak is 3,500 jobs a week (Tom, 19/10/2026)');
  assert.ok(!/\bI\b|\bmy\b|\bwe\b/i.test(tom.replace(/Read the Abacus and Falmouth Taxis story/, '')), 'the story slipped into the first person');
  assert.ok(!/\b50\b|fifty|10,000 bookings/i.test(visibleText(renderBody())), 'an unbacked figure from the first brief is on the page');
});

test('the hero, the systems named, and the existing enquiry form with page wording', () => {
  const body = renderBody();
  const hero = visibleText(body.slice(body.indexOf('<header class="ow-hero"'), body.indexOf('</header>')));
  assert.ok(hero.includes('An AI workspace that cuts office errors'));
  assert.ok(hero.includes('Take the emails and admin off your controllers. Catch booking mistakes before they cost you a job.'));
  assert.ok(hero.includes('Book a 15 minute walk through') && hero.includes('See how the booking check works'));
  assert.ok(body.includes('href="#booking-check"') && body.includes('id="booking-check"'), 'the secondary link goes nowhere');
  assert.ok(/class="ow-hero-actions">\s*<a href="#conversation"/.test(body), 'the hero button no longer goes to the enquiry form');
  assert.ok(section(body, 'data-systems').includes('iCabbi, Autocab, Cordic'));
  assert.strictEqual(TAXI_WORKSPACE_CONTACT.heading, 'Book a 15 minute walk through');
  assert.ok(/ask for a login/.test(TAXI_WORKSPACE_CONTACT.body), 'the login route is gone from the form');
  // The shared form's time box asks about a "30 min call" unless the page says otherwise.
  assert.match(TAXI_WORKSPACE_CONTACT.timePlaceholder, /walk through.*\(optional\)$/);
  assert.ok(read('views/partials/site-footer.ejs').includes("pageContact.timePlaceholder || 'Best day/time for a 30 min call (optional)'"), 'the form no longer takes the page wording, or lost its default');
  const route = read(ROUTE).replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\/api\/checkout|stripe|AW-18129914078|UPDATE content|INSERT INTO/i.test(route + emitted(VIEW)), 'a checkout, a conversion call or a CMS write appeared');
});

test('screenshots are captioned as the demo, exist on disk, and the video shows only once recorded', () => {
  const body = renderBody();
  const figs = body.split('<figure').slice(1);
  assert.equal(figs.length, 3);
  for (const f of figs) assert.match(f, /<figcaption>From our working demo/);
  for (const src of body.match(/\/img\/taxi-office\/[a-z-]+\.(?:webp|jpg)/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'public', src)), `${src} is missing`);
  }
  assert.ok(!body.includes('<video'), 'a video slot shows with no recording');
  assert.ok(renderBody({ videoUrl: VIDEO_URL }).includes(`<video controls preload="none" src="${VIDEO_URL}">`));
});

test('house rules: no dashes, no hyphenated words, sans serif only, "AI" kept to this product', () => {
  const text = visibleText(renderBody());
  assert.ok(!/[–—]/.test(text), 'a dash in the visible text');
  assert.ok(!/[A-Za-z]-[A-Za-z]/.test(text), `a hyphenated word: ${(text.match(/\S*[A-Za-z]-[A-Za-z]\S*/) || [''])[0]}`);
  assert.ok(!/serif['"]?\s*[;,}]/.test(emitted(VIEW).replace(/sans-serif/g, '')), 'a serif font');
  assert.ok(!/\bsolutions?\b|\bseamless|\bleverage|\bempower|\bjourney\b(?! in dispatch)|\bholistic|\btailored|\bbespoke|world class/i.test(text), 'a banned word');
});
