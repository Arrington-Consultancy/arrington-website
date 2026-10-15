'use strict';

// Tidewell Cars: the taxi demo site Arrington Consultancy shows operators.
// A plain Node server with no dependencies, run as its own Railway service
// from this folder (root directory /taxi-demo). It shows the £999 product
// and nothing more: the customer-facing site and the booking form that puts
// a job into the dispatch system. No controller screens, no office tools.
//
// Routes
//   GET  /  /book  /airports  /accounts  /about  /contact     pages
//   POST /book                       booking (form post or JSON)
//   GET  /booking/:token             confirmation, polls for the driver
//   POST /booking/:token/cancel      cancel
//   POST /accounts  /about  /contact enquiry forms (stub: logged, not sent)
//   POST /api/quote                  live price while the form is filled in
//   GET  /api/bookings/:token        status for the confirmation page
//   GET  /health                     for Railway's deploy healthcheck
//
// Every response carries X-Robots-Tag: noindex: this is a fictional firm and
// must never sit in search results beside real ones.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL, URLSearchParams } = require('url');
const zlib = require('zlib');

const { FIRM } = require('./lib/firm');
const { layout } = require('./lib/html');
const images = require('./lib/images');
const pages = require('./lib/pages');
const { readBooking, toDispatch, clean, ukPhone } = require('./lib/booking');
const { estimate, describe, londonToInstant } = require('./lib/fares');
const { createDispatch } = require('./lib/dispatch');
const { createStore } = require('./lib/store');
const { createLimiter } = require('./lib/limit');
const notify = require('./lib/notify');

const PUBLIC = path.join(__dirname, 'public');
const MAX_BODY = 16 * 1024;

const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.txt': 'text/plain; charset=utf-8' };

// Static files are read once at start and served with a content hash in the
// address, so they can be cached for a year and still change on deploy.
function loadAssets() {
  const files = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const rel = path.relative(PUBLIC, full).split(path.sep).join('/');
        let body = fs.readFileSync(full);
        // The stylesheet is written for people to read; strip comments and
        // spare whitespace before it is served.
        if (rel.endsWith('.css')) body = Buffer.from(body.toString('utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').replace(/\s{2,}/g, ' '));
        files.set(rel, asset(rel, body));
      }
    }
  };
  walk(PUBLIC);
  files.set('places.json', asset('places.json', Buffer.from(pages.placesJson())));
  return files;
}

const COMPRESSIBLE = /^(text\/|application\/json|image\/svg)/;
function asset(rel, body) {
  const type = TYPES[path.extname(rel)] || 'application/octet-stream';
  return {
    body,
    type,
    gzip: COMPRESSIBLE.test(type) ? zlib.gzipSync(body, { level: 9 }) : null,
    hash: crypto.createHash('sha256').update(body).digest('hex').slice(0, 10),
    // Font files never change under the same name, so they cache for a year
    // whatever the address; the stylesheet refers to them without a hash.
    immutable: rel.startsWith('fonts/')
  };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  'frame-src https://www.google.com https://maps.google.com',
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'"
].join('; ');

function createApp(options = {}) {
  const assets = loadAssets();
  const assetUrl = (rel) => {
    const a = assets.get(rel);
    return a ? `/assets/${rel}?v=${a.hash}` : `/assets/${rel}`;
  };
  // Photograph slots: which sized files exist, and their hashed addresses.
  images.register(assets, assetUrl);
  const store = options.store || createStore();
  const dispatch = options.dispatch || createDispatch(process.env.DISPATCH_DRIVER || 'mock', {
    onEvent: (type, view) => { if (type === 'allocated') notify.driverAllocated(store.byRef(view.ref)?.booking, view); }
  });
  const limits = {
    booking: createLimiter({ windowMs: 60 * 60 * 1000, max: options.bookingLimit || 20 }),
    quote: createLimiter({ windowMs: 10 * 60 * 1000, max: 300 }),
    enquiry: createLimiter({ windowMs: 60 * 60 * 1000, max: 10 }),
    poll: createLimiter({ windowMs: 10 * 60 * 1000, max: 600 })
  };
  const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

  function baseUrl(req) {
    if (publicUrl) return publicUrl;
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    return `${proto}://${req.headers.host || 'localhost'}`;
  }
  const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  function send(res, status, body, type = 'text/html; charset=utf-8', extra = {}, req = null, pre = null) {
    let out = body;
    const enc = {};
    if (req && /\bgzip\b/.test(String(req.headers['accept-encoding'] || '')) && COMPRESSIBLE.test(type)) {
      out = pre || zlib.gzipSync(Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
      enc['Content-Encoding'] = 'gzip';
      enc.Vary = 'Accept-Encoding';
    }
    res.writeHead(status, {
      ...enc,
      'Content-Type': type,
      'Content-Security-Policy': CSP,
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), interest-cohort=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      ...(type.startsWith('text/html') ? { 'Cache-Control': 'no-store' } : {}),
      ...extra
    });
    res.end(req && req.method === 'HEAD' ? undefined : out);
  }
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
  const redirect = (res, to) => { res.writeHead(303, { Location: to, 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }); res.end(); };

  function page(req, res, status, p) {
    send(res, status, layout({ base: baseUrl(req), assets: assetUrl, ...p }), 'text/html; charset=utf-8', {}, req);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const type = String(req.headers['content-type'] || '');
        try {
          if (type.includes('application/json')) resolve(text ? JSON.parse(text) : {});
          else resolve(Object.fromEntries(new URLSearchParams(text)));
        } catch (e) {
          reject(Object.assign(new Error('bad body'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  // A form on another site must not be able to post bookings here.
  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin || origin === 'null') return !origin;
    try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
  }

  const wantsJson = (req) => String(req.headers.accept || '').includes('application/json') || String(req.headers['content-type'] || '').includes('application/json');

  async function createBooking(req, res) {
    if (!limits.booking(clientIp(req))) {
      return wantsJson(req) ? json(res, 429, { error: 'Too many bookings from here. Call us instead.' })
        : page(req, res, 429, { path: '/book', title: 'Too many bookings', description: '', body: pages.notFoundPage(), bookPage: true });
    }
    const input = await readBody(req);
    const result = readBooking(input);
    if (!result.ok) {
      if (wantsJson(req)) return json(res, 422, { errors: result.errors });
      return page(req, res, 422, {
        path: '/book', title: `Book a taxi | ${FIRM.name}, ${FIRM.town}`, description: 'Book a taxi online.', bookPage: true, extraScripts: ['book.js'], barPrice: pages.bookBarPrice(result.values),
        body: pages.bookPage({ values: { ...result.values, phoneRaw: clean(input.phone, 30) }, errors: result.errors })
      });
    }
    const b = result.booking;
    let job;
    try {
      job = await dispatch.createBooking(toDispatch(b));
    } catch (e) {
      console.error('Dispatch refused the booking:', e.message);
      const msg = `We couldn't reach our dispatch system just now. Please call ${FIRM.phone}.`;
      return wantsJson(req) ? json(res, 503, { error: msg })
        : page(req, res, 503, { path: '/book', title: `Book a taxi | ${FIRM.name}`, description: '', bookPage: true, extraScripts: ['book.js'], barPrice: pages.bookBarPrice(b), body: pages.bookPage({ values: b, errors: { form: msg } }) });
    }
    const sent = notify.bookingReceived(b, job.ref);
    const record = store.add({ ref: job.ref, booking: b, sms: sent.sms });
    console.log(`Booking ${job.ref} into ${dispatch.name} dispatch: ${b.when === 'now' ? 'asap' : 'pre-booked'}, ${b.vehicle}, ${describe(b.quote)}`);
    const to = `/booking/${record.token}`;
    return wantsJson(req) ? json(res, 201, { ref: job.ref, url: to }) : redirect(res, to);
  }

  async function statusView(record) {
    const view = await dispatch.getBooking(record.ref);
    return view || { ref: record.ref, status: 'received' };
  }

  async function enquiry(req, res, { path: p, kind, fields, render, title }) {
    if (!limits.enquiry(clientIp(req))) return page(req, res, 429, { path: p, title, description: '', body: pages.notFoundPage() });
    const input = await readBody(req);
    if (clean(input.website, 200)) return redirect(res, `${p}?sent=1`);
    const values = {};
    const errors = {};
    for (const f of fields) {
      values[f.name] = clean(input[f.name], f.type === 'textarea' ? 600 : 120);
      if (!f.optional && !values[f.name]) errors[f.name] = `Fill in ${f.label.toLowerCase()}.`;
    }
    if (values.phone && fields.find((f) => f.name === 'phone' && f.type === 'tel') && !ukPhone(values.phone)) errors.phone = 'A UK phone number, please.';
    if (Object.keys(errors).length) return page(req, res, 422, { path: p, title, description: '', body: render({ errors, values }) });
    notify.enquiry(kind, values);
    return redirect(res, `${p}?sent=1#${kind === 'account' ? 'open-account' : kind === 'driver' ? 'drive' : 'main'}`);
  }

  const PAGES = {
    '/': () => ({ hero: 'hero-exmouth', title: `${FIRM.name} | Taxis in ${FIRM.town}, 24 hours | ${FIRM.phone}`, description: `Taxis and private hire in ${FIRM.town} and East Devon, day and night. Book online with the price up front, or call ${FIRM.phone}. Fixed prices to Exeter Airport and beyond.`, body: pages.home() }),
    '/airports': () => ({ hero: 'airport-night', title: `Airport taxis from ${FIRM.town}, fixed prices | ${FIRM.name}`, description: `Fixed price taxis from ${FIRM.town} to Exeter Airport, Bristol Airport, Heathrow, Gatwick and the main stations. Same price day or night.`, body: pages.airportsPage() }),
    '/accounts': (q) => ({ hero: 'accounts', title: `Business taxi accounts in ${FIRM.town} | ${FIRM.name}`, description: `Taxi accounts for hotels, schools, NHS and care services and local businesses in ${FIRM.town}. One invoice a month.`, body: pages.accountsPage({ sent: q.get('sent') === '1' }) }),
    '/about': (q) => ({ hero: 'fleet-dawn', title: `About us and driving jobs | ${FIRM.name}, ${FIRM.town}`, description: `${FIRM.name} has run taxis in ${FIRM.town} since ${FIRM.founded}. ${FIRM.fleet} cars, licensed drivers, and driving jobs for licence holders.`, body: pages.aboutPage({ sent: q.get('sent') === '1' }) }),
    '/contact': (q) => ({ hero: 'huts-evening', title: `Contact ${FIRM.name}, ${FIRM.town} | ${FIRM.phone}`, description: `Call ${FIRM.name} on ${FIRM.phone}, 24 hours. Text, lost property and messages for the office.`, body: pages.contactPage({ sent: q.get('sent') === '1' }) })
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    const method = req.method;

    if (p === '/health') return json(res, 200, { ok: true, dispatch: dispatch.name });

    if (method === 'GET' || method === 'HEAD') {
      if (p.startsWith('/assets/')) {
        const a = assets.get(p.slice('/assets/'.length));
        if (!a) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
        const cache = a.immutable || url.searchParams.get('v') === a.hash ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
        return send(res, 200, a.body, a.type, { 'Cache-Control': cache }, a.gzip ? req : null, a.gzip);
      }
      if (p === '/robots.txt') return send(res, 200, 'User-agent: *\nAllow: /\n', 'text/plain; charset=utf-8');
      if (p === '/favicon.ico') return redirect(res, assetUrl('favicon.svg'));
      if (PAGES[p]) return page(req, res, 200, { path: p, ...PAGES[p](url.searchParams) });
      if (p === '/book') {
        const v = {};
        for (const k of ['pickup', 'destination']) v[k] = clean(url.searchParams.get(k), 160);
        return page(req, res, 200, {
          path: '/book', title: `Book a taxi online | ${FIRM.name}, ${FIRM.town}`, bookPage: true, extraScripts: ['book.js'], barPrice: pages.bookBarPrice(v),
          description: `Book a taxi in ${FIRM.town} online. See the price before you confirm, and get your driver's details by text.`,
          body: pages.bookPage({ values: v })
        });
      }
      const m = /^\/booking\/([a-f0-9]{32})$/.exec(p);
      if (m) {
        const record = store.get(m[1]);
        if (!record) return page(req, res, 404, { path: p, title: 'Booking not found', description: '', body: pages.notFoundPage() });
        const view = await statusView(record);
        return page(req, res, 200, { path: '/booking', title: `Booking ${record.ref} | ${FIRM.name}`, description: 'Your booking.', body: pages.confirmationPage({ record, view }), extraScripts: ['status.js'] });
      }
      const api = /^\/api\/bookings\/([a-f0-9]{32})$/.exec(p);
      if (api) {
        if (!limits.poll(clientIp(req))) return json(res, 429, { error: 'slow down' });
        const record = store.get(api[1]);
        if (!record) return json(res, 404, { error: 'not found' });
        const view = await statusView(record);
        return json(res, 200, { ...view, asap: record.booking.when === 'now', html: pages.statusSteps({ ...view, asap: record.booking.when === 'now' }).s });
      }
      return page(req, res, 404, { path: p, title: `Page not found | ${FIRM.name}`, description: '', body: pages.notFoundPage() });
    }

    if (method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
      if (p === '/book') return createBooking(req, res);
      if (p === '/api/quote') {
        if (!limits.quote(clientIp(req))) return json(res, 429, { error: 'slow down' });
        const q = await readBody(req);
        const when = q.when === 'later' ? londonToInstant(`${clean(q.date, 10)}T${clean(q.time, 5)}`) : null;
        const est = estimate({ pickup: clean(q.pickup, 160), destination: clean(q.destination, 160), vehicle: clean(q.vehicle, 20), when: when || new Date() });
        return json(res, 200, { kind: est.kind, text: describe(est), label: est.label || est.message || '' });
      }
      const c = /^\/booking\/([a-f0-9]{32})\/cancel$/.exec(p);
      if (c) {
        const record = store.get(c[1]);
        if (!record) return page(req, res, 404, { path: p, title: 'Booking not found', description: '', body: pages.notFoundPage() });
        await dispatch.cancelBooking(record.ref);
        console.log(`Booking ${record.ref} cancelled by the customer`);
        return redirect(res, `/booking/${record.token}`);
      }
      if (p === '/accounts') return enquiry(req, res, { path: '/accounts', kind: 'account', fields: pages.ACCOUNT_FIELDS, title: PAGES['/accounts'](new URLSearchParams()).title, render: (s) => pages.accountsPage(s) });
      if (p === '/about') return enquiry(req, res, { path: '/about', kind: 'driver', fields: pages.DRIVER_FIELDS, title: PAGES['/about'](new URLSearchParams()).title, render: (s) => pages.aboutPage(s) });
      if (p === '/contact') return enquiry(req, res, { path: '/contact', kind: 'contact', fields: pages.CONTACT_FIELDS, title: PAGES['/contact'](new URLSearchParams()).title, render: (s) => pages.contactPage(s) });
      return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    }

    return send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8', { Allow: 'GET, HEAD, POST' });
  }

  const server = http.createServer((req, res) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.url !== '/health' && !req.url.startsWith('/assets/') && process.env.NODE_ENV !== 'test') {
        console.log(`${req.method} ${req.url.split('?')[0]} ${res.statusCode} ${Date.now() - started}ms`);
      }
    });
    handle(req, res).catch((e) => {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, status === 413 ? 'Too large' : status === 400 ? 'Bad request' : 'Something went wrong', 'text/plain; charset=utf-8');
      else res.end();
    });
  });
  server.dispatch = dispatch;
  server.store = store;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3100);
  const server = createApp();
  server.listen(port, () => console.log(`${FIRM.name} demo on port ${port}, dispatch driver: ${server.dispatch.name}`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { createApp };
