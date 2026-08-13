// "Where to Start" — priced Arrington offers with Stripe-hosted Checkout.
// Built 09/08/2026 per the design/implementation brief following the
// commercial-thinking review earlier in this session. Same standalone-tool
// pattern as routes/commercialGapsReview.js and routes/marketReadyTest.js:
// bespoke EJS views (not a CMS page — no section template exists for "priced
// offer with a purchase button"), GET pages registered directly via
// mountPageRoute ahead of the global CSRF middleware, own rate limiter, own
// DB table (see db/schema.sql: purchases).
//
// TEST MODE ONLY. See lib/stripeClient.js — it refuses to initialise
// against anything that looks like a live secret key. Nothing here has been
// through a real Stripe test-mode round trip: this sandbox has no outbound
// access to api.stripe.com (confirmed via curl, same restriction as the
// live site and Stripe's own docs), so the Checkout Session creation and
// webhook handling below are written against stable, long-standing Stripe
// Checkout Sessions API conventions rather than a live docs check today.
// Flagged in full in the branch's decision report and commit message.
//
// Payment confirmation is never trusted from the success-page redirect
// alone — a purchase only becomes 'paid' when the webhook independently
// verifies the event, exactly as routes/whereToStart.js's mountWebhook is
// registered before body-parsing/CSRF so Stripe's own signed POST reaches
// it untouched (see server.js).
const crypto = require('crypto');
const express = require('express');
const sanitizeHtml = require('sanitize-html');
const nodemailer = require('nodemailer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const db = require('../db/pool');
const themes = require('../db/themes');
const { getStripeClient, getStripeKeyStatus } = require('../lib/stripeClient');
const { OFFERS, FULL_REVIEW_PURCHASE_MODE, getOffer, buildCheckoutSessionParams } = require('../lib/whereToStartOffers');
const { getSiteShellData } = require('../lib/navShell');

const router = express.Router();

const NOTIFY_FROM = 'tom@arringtonconsultancy.com';
const transporter = process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: NOTIFY_FROM, pass: process.env.GMAIL_APP_PASSWORD }
    })
  : null;

async function getNotifyEmail() {
  try {
    const { rows } = await db.query(`SELECT content FROM content WHERE section_key = 'contact.email'`);
    return (rows[0]?.content || '').trim() || NOTIFY_FROM;
  } catch (err) {
    return NOTIFY_FROM;
  }
}

async function notify({ subject, text, replyTo }) {
  if (!transporter) {
    console.warn('GMAIL_APP_PASSWORD not set — skipping Where to Start notification email.');
    return;
  }
  try {
    const to = await getNotifyEmail();
    await transporter.sendMail({ from: NOTIFY_FROM, to, subject, text, replyTo });
  } catch (err) {
    console.error('Where to Start notification email failed:', err.message);
  }
}

const plainText = (s, max) => sanitizeHtml(String(s || ''), { allowedTags: [], allowedAttributes: {} }).trim().slice(0, max || 255);
const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 255;

// A visitor legitimately hits this once per purchase attempt; generous
// enough for a retry after a typo'd email, tight enough to make repeated
// Checkout Session creation (each one a real, if harmless, Stripe API call)
// impractical to abuse.
const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many requests. Please try again later.' }
});

async function loadThemeAndShell() {
  const { rows: themeRows } = await db.query("SELECT content FROM content WHERE section_key = 'site.theme'");
  const activeTheme = (themeRows[0] && themeRows[0].content) || 'dark';
  const theme = themes[activeTheme] || themes.dark;
  const shell = await getSiteShellData();
  return { theme, ...shell };
}

// ------------------------------------------------------------
// GET pages — registered directly (same pattern as the other standalone
// tools) so each page's CSRF token is generated here rather than relied on
// from the global res.locals middleware.
// ------------------------------------------------------------
function mountPageRoute(app, generateCsrfToken) {
  app.get('/where-to-start', async (req, res, next) => {
    try {
      const { theme, navPages, content, pageContact } = await loadThemeAndShell();
      res.render('where-to-start', {
        theme,
        ga4Id: process.env.GA4_MEASUREMENT_ID || '',
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        pageContact,
        offers: OFFERS
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/where-to-start/commercial-review', async (req, res, next) => {
    try {
      const { theme, navPages, content, pageContact } = await loadThemeAndShell();
      res.render('where-to-start-commercial-review', {
        theme,
        ga4Id: process.env.GA4_MEASUREMENT_ID || '',
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        pageContact,
        offer: OFFERS.commercial_review
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/where-to-start/full-commercial-review', async (req, res, next) => {
    try {
      const { theme, navPages, content, pageContact } = await loadThemeAndShell();
      res.render('where-to-start-full-commercial-review', {
        theme,
        ga4Id: process.env.GA4_MEASUREMENT_ID || '',
        csrfToken: generateCsrfToken(req, res),
        navPages,
        content,
        pageContact,
        offer: OFFERS.full_commercial_review,
        purchaseMode: FULL_REVIEW_PURCHASE_MODE
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/where-to-start/confirmation', async (req, res, next) => {
    try {
      const sessionId = plainText(req.query.session_id, 255);
      let purchase = null;
      if (sessionId) {
        const { rows } = await db.query(
          'SELECT offer_id, status, amount_pence, currency FROM purchases WHERE stripe_session_id = $1',
          [sessionId]
        );
        purchase = rows[0] || null;
      }
      const { theme, navPages, content, pageContact } = await loadThemeAndShell();
      res.render('where-to-start-confirmation', {
        theme,
        ga4Id: process.env.GA4_MEASUREMENT_ID || '',
        navPages,
        content,
        pageContact,
        purchase,
        offer: purchase ? getOffer(purchase.offer_id) : null
      });
    } catch (err) {
      next(err);
    }
  });
}

// ------------------------------------------------------------
// POST /api/checkout/:offerId — creates a Stripe Checkout Session and hands
// back its URL for the client to redirect to. Mounted via the router (like
// routes/leads.js), so it sits behind the global CSRF middleware same as
// every other public form on the site.
// ------------------------------------------------------------
router.post('/api/checkout/:offerId', checkoutLimiter, async (req, res) => {
  try {
    const offer = getOffer(plainText(req.params.offerId, 50));
    if (!offer || !offer.purchasable) {
      return res.status(400).json({ error: 'This offer is not currently purchasable.' });
    }

    const body = req.body || {};
    if (plainText(body.website)) {
      // Honeypot — pretend success without creating a real session.
      return res.json({ ok: true, url: '/where-to-start' });
    }

    const email = plainText(body.email, 255);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(503).json({ error: 'Payments are not yet configured. Please use the conversation link instead.' });
    }

    // £500 credit: tracked as an Arrington-owned entitlement in our own
    // purchases table, not a Stripe coupon (see buildCheckoutSessionParams
    // for why). If this checkout is for the offer that offer.creditFrom
    // points at, and this email has a paid, not-yet-credited purchase of
    // that earlier offer, the Checkout Session's line item is simply built
    // at the already-discounted amount. Email match is a convenience, not
    // the sole authority — if a customer paid under a different email, Tom
    // can apply the credit manually afterwards via
    // PUT /api/admin/purchases/:id/apply-credit (routes/admin.js).
    let creditAppliedPence = 0;
    if (offer.creditFrom) {
      const { rows: creditRows } = await db.query(
        `SELECT id FROM purchases
         WHERE email = $1 AND offer_id = $2 AND status = 'paid' AND credited_toward_id IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [email, offer.creditFrom]
      );
      if (creditRows.length > 0) {
        creditAppliedPence = offer.creditAmountPence;
      }
    }
    const chargeAmountPence = offer.pricePence - creditAppliedPence;

    const origin = `${req.protocol}://${req.get('host')}`;
    const params = buildCheckoutSessionParams({
      offer,
      email,
      successUrl: `${origin}/where-to-start/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/where-to-start/${offer.id === 'commercial_review' ? 'commercial-review' : 'full-commercial-review'}`,
      chargeAmountPence,
      creditAppliedPence
    });

    const session = await stripe.checkout.sessions.create(params);

    await db.query(
      `INSERT INTO purchases (offer_id, email, list_price_pence, amount_pence, credit_applied_pence, currency, status, stripe_session_id, credited_toward_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NULL)`,
      [offer.id, email, offer.pricePence, chargeAmountPence, creditAppliedPence, offer.currency, session.id]
    );

    // The £500 credit is only ever marked consumed (credited_toward_id set
    // on the original £500 purchase) once the webhook below confirms this
    // new session actually completed — never here at session-creation
    // time, since the customer hasn't paid yet and may abandon checkout.
    // The original £500 row itself is never touched beyond that one field,
    // so it stays exactly as charged: a fully auditable £500 payment.

    res.json({ ok: true, url: session.url });
  } catch (err) {
    console.error('Checkout session creation failed:', err.message);
    res.status(500).json({ error: 'Something went wrong starting checkout. Please try again or use the conversation link instead.' });
  }
});

// ------------------------------------------------------------
// Webhook — must see the RAW request body to verify Stripe's signature, so
// server.js registers this on `app` directly with express.raw(), before the
// global express.json() and before the CSRF middleware (Stripe's servers
// don't send our CSRF token, so it must be exempt, same reasoning as any
// third-party webhook).
// ------------------------------------------------------------
// Records the outcome of every /api/stripe/webhook POST — success or
// failure — so it can be read from the admin panel (System -> Webhook log)
// without needing Stripe Dashboard or MCP access. Never throws: a logging
// failure must not turn a real webhook problem into a second, unrelated
// one, or (worse) stop the actual response Stripe is waiting on.
async function logWebhookAttempt({ outcome, eventType, stripeEventId, detail }) {
  try {
    await db.query(
      `INSERT INTO webhook_log (provider, outcome, event_type, stripe_event_id, detail)
       VALUES ('stripe', $1, $2, $3, $4)`,
      [outcome, eventType || null, stripeEventId || null, detail || '']
    );
  } catch (err) {
    console.error('Webhook log write failed:', err.message);
  }
}

function mountWebhook(app) {
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !webhookSecret) {
      const reason = !stripe
        ? (getStripeKeyStatus() === 'live_key_refused'
            ? 'STRIPE_SECRET_KEY is a live key (sk_live_...) — this branch refuses to initialise Stripe against it (see lib/stripeClient.js)'
            : 'STRIPE_SECRET_KEY is unset')
        : 'STRIPE_WEBHOOK_SECRET is unset';
      console.warn(`Stripe webhook received but not configured (${reason}) — ignoring.`);
      await logWebhookAttempt({ outcome: 'not_configured', detail: reason });
      return res.status(503).send('Not configured.');
    }

    let event;
    try {
      const signature = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', err.message);
      // The single most likely cause: STRIPE_WEBHOOK_SECRET on Railway
      // doesn't match the signing secret shown for this endpoint in the
      // Stripe Dashboard. err.message from Stripe's SDK says so directly.
      await logWebhookAttempt({ outcome: 'signature_invalid', detail: err.message });
      return res.status(400).send('Invalid signature.');
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { rows } = await db.query(
          `UPDATE purchases
           SET status = 'paid', stripe_payment_intent_id = $1, updated_at = NOW()
           WHERE stripe_session_id = $2
           RETURNING id, offer_id, email, list_price_pence, amount_pence, credit_applied_pence, currency`,
          [session.payment_intent || '', session.id]
        );
        const purchase = rows[0];

        if (!purchase) {
          // Signature verified fine, but no purchases row matched this
          // session — a different failure mode from a secret mismatch
          // (e.g. the session was created outside the app's own checkout
          // route, or the row was somehow lost). Worth its own outcome so
          // it isn't confused with a secret problem in the log.
          await logWebhookAttempt({
            outcome: 'processed',
            eventType: event.type,
            stripeEventId: event.id,
            detail: `No purchases row found for stripe_session_id=${session.id}`
          });
        }

        if (purchase) {
          const offer = getOffer(purchase.offer_id);
          // Apply the £500 credit permanently: find the earlier paid,
          // uncredited source purchase for this email and mark it credited
          // now that the Full Review payment has actually gone through.
          if (offer && offer.creditFrom) {
            await db.query(
              `UPDATE purchases SET credited_toward_id = $1
               WHERE id = (
                 SELECT id FROM purchases
                 WHERE email = $2 AND offer_id = $3 AND status = 'paid' AND credited_toward_id IS NULL
                 ORDER BY created_at DESC LIMIT 1
               )`,
              [purchase.id, purchase.email, offer.creditFrom]
            );
          }

          notify({
            subject: `Where to Start: paid — ${offer ? offer.name : purchase.offer_id} (${purchase.email})`,
            text: [
              `Offer: ${offer ? offer.name : purchase.offer_id} (list price £${(purchase.list_price_pence / 100).toFixed(2)})`,
              `Email: ${purchase.email}`,
              `Amount charged: £${(purchase.amount_pence / 100).toFixed(2)} ${String(purchase.currency).toUpperCase()}`,
              purchase.credit_applied_pence > 0
                ? `£${(purchase.credit_applied_pence / 100).toFixed(2)} Commercial Review credit applied automatically (matched by email).`
                : '',
              `Stripe session: ${session.id}`,
              '',
              'Next step: send the intake questionnaire and confirm the working timeline.'
            ].filter(Boolean).join('\n'),
            replyTo: purchase.email
          });

          // Customer-facing confirmation — separate from the owner
          // notification above. Without this, the only things a paying
          // customer gets are the confirmation page and whatever Stripe's
          // own account-level receipt/invoice email settings happen to be
          // (both outside this codebase's control, see
          // buildCheckoutSessionParams). The confirmation page copy
          // already promises "you will receive a short intake
          // questionnaire by email" — this is what actually sends that,
          // rather than leaving it as a promise nothing fulfils.
          if (transporter) {
            const isCommercialReview = purchase.offer_id === 'commercial_review';
            transporter.sendMail({
              from: NOTIFY_FROM,
              to: purchase.email,
              subject: `Arrington Consultancy: payment received — ${offer ? offer.name : purchase.offer_id}`,
              text: [
                `Thank you — your payment for the ${offer ? offer.name : purchase.offer_id} has gone through.`,
                '',
                isCommercialReview
                  ? "Next, you'll receive a short questionnaire by email so Tom has enough context before you talk. The written report follows within 4 business days of that conversation."
                  : "Next, you'll receive a short questionnaire by email to get started. Tom will be in touch to confirm the working plan and timeline.",
                '',
                'If anything about this is unclear, just reply to this email.'
              ].join('\n')
            }).catch((err) => console.error('Customer confirmation email failed:', err.message));
          } else {
            console.warn('GMAIL_APP_PASSWORD not set — skipping customer confirmation email.');
          }

          await logWebhookAttempt({
            outcome: 'processed',
            eventType: event.type,
            stripeEventId: event.id,
            detail: `purchases.id=${purchase.id} offer_id=${purchase.offer_id} marked paid`
          });
        }
      } else if (event.type === 'checkout.session.expired') {
        await db.query(
          `UPDATE purchases SET status = 'expired', updated_at = NOW() WHERE stripe_session_id = $1`,
          [event.data.object.id]
        );
        await logWebhookAttempt({
          outcome: 'processed',
          eventType: event.type,
          stripeEventId: event.id,
          detail: `stripe_session_id=${event.data.object.id} marked expired`
        });
      } else {
        // Signature verified, but an event type we don't act on (the
        // endpoint is only registered for checkout.session.completed and
        // .expired in the Stripe Dashboard — this branch is a safety net,
        // not the expected path).
        await logWebhookAttempt({
          outcome: 'processed',
          eventType: event.type,
          stripeEventId: event.id,
          detail: 'Event type not handled by this endpoint.'
        });
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook handling failed:', err.message);
      await logWebhookAttempt({
        outcome: 'processing_error',
        eventType: event.type,
        stripeEventId: event.id,
        detail: err.message
      });
      // Non-2xx so Stripe retries delivery rather than silently dropping a
      // payment confirmation we failed to record.
      res.status(500).send('Webhook handling failed.');
    }
  });
}

module.exports = { router, mountPageRoute, mountWebhook };
