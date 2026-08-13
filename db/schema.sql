CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'content', 'client')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session (
    sid VARCHAR NOT NULL COLLATE "default",
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

CREATE TABLE IF NOT EXISTS content (
    id SERIAL PRIMARY KEY,
    section_key VARCHAR(100) UNIQUE NOT NULL,
    content TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS images (
    id SERIAL PRIMARY KEY,
    image_key VARCHAR(50) UNIQUE NOT NULL,
    data BYTEA NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS backups (
    id SERIAL PRIMARY KEY,
    label VARCHAR(200) NOT NULL,
    content_snapshot JSONB NOT NULL,
    images_snapshot JSONB NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pages (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(60) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    hidden BOOLEAN NOT NULL DEFAULT false,
    section_order JSONB NOT NULL DEFAULT '[]'::jsonb,
    hidden_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    deleted_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    meta_title VARCHAR(255) NOT NULL DEFAULT '',
    meta_description TEXT NOT NULL DEFAULT '',
    meta_keywords TEXT NOT NULL DEFAULT '',
    og_title VARCHAR(255) NOT NULL DEFAULT '',
    og_description TEXT NOT NULL DEFAULT '',
    og_image TEXT NOT NULL DEFAULT '',
    canonical_url TEXT NOT NULL DEFAULT '',
    noindex BOOLEAN NOT NULL DEFAULT false,
    show_in_nav BOOLEAN NOT NULL DEFAULT true,
    nav_label VARCHAR(200) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(20) NOT NULL,
    capability VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (role, capability)
);

CREATE TABLE IF NOT EXISTS page_access (
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (page_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    section_key VARCHAR(100),
    detail TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Public lead capture: the footer contact/booking form ('contact'), the
-- gated case-study PDF downloads ('pdf_download'), and voluntary "email me
-- my result" requests from the Owner Dependency Review ('quiz_results',
-- message column holds the score/band/RAG breakdown text). No user_id —
-- these come from anonymous visitors.
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    kind VARCHAR(20) NOT NULL DEFAULT 'contact',
    name VARCHAR(200) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    preferred_time VARCHAR(255) NOT NULL DEFAULT '',
    document VARCHAR(100) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);

-- Market Ready Test — standalone, unpublished tool (not part of the
-- pages/content CMS). Holds the business details, the ten multiple-choice
-- answers, the optional free-text context, and the deterministically
-- computed report (see routes/marketReadyTest.js buildReport — scored in
-- plain code, not by an AI model, as of the 26/07/2026 rebuild).
-- result_token is a long random opaque identifier (not derived from any PII)
-- used for the private result URL. 'pending'/'failed' statuses remain valid
-- for schema compatibility with rows from the earlier AI-scored version but
-- are unused going forward, since deterministic scoring cannot fail.
CREATE TABLE IF NOT EXISTS market_ready_submissions (
    id SERIAL PRIMARY KEY,
    result_token VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    first_name VARCHAR(200) NOT NULL DEFAULT '',
    last_name VARCHAR(200) NOT NULL DEFAULT '',
    business_name VARCHAR(255) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL DEFAULT '',
    location VARCHAR(255) NOT NULL DEFAULT '',
    industry VARCHAR(255) NOT NULL DEFAULT '',
    employee_count VARCHAR(100) NOT NULL DEFAULT '',
    turnover_band VARCHAR(100) NOT NULL DEFAULT '',
    sale_timeframe VARCHAR(100) NOT NULL DEFAULT '',
    answers JSONB NOT NULL DEFAULT '[]'::jsonb,
    context TEXT NOT NULL DEFAULT '',
    consent_tom_review BOOLEAN NOT NULL DEFAULT false,
    consent_marketing BOOLEAN NOT NULL DEFAULT false,
    report JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_ready_created_at ON market_ready_submissions (created_at DESC);

-- Commercial Gaps Review (AI) — third Owner Check tool, feature-branch build
-- (see routes/commercialGapsReview.js). Unlike the Owner Dependency Quiz and
-- Market Ready Test, this one is a lead-gated, free-text, dynamically ordered
-- interview: the row is created the instant the intake form is submitted
-- (before a single question is answered), then filled in as the visitor
-- progresses. transcript holds the ordered list of {id, category, text,
-- isClarification, answerText} exchanges. ai_response holds the full
-- structured interpretation once complete, including the tom_briefing object
-- that the visitor never sees (only routes/commercialGapsReview.js and the
-- admin API read that sub-object out). Two separate consent flags because the
-- brief requires them to be independently offered, not bundled.
CREATE TABLE IF NOT EXISTS commercial_gaps_reviews (
    id SERIAL PRIMARY KEY,
    result_token VARCHAR(64) UNIQUE NOT NULL,
    short_reference VARCHAR(12) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'processing', 'completed', 'failed')),
    failure_reason TEXT NOT NULL DEFAULT '',
    name VARCHAR(200) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL DEFAULT '',
    location VARCHAR(255) NOT NULL DEFAULT '',
    consent_save_email BOOLEAN NOT NULL DEFAULT false,
    consent_contact BOOLEAN NOT NULL DEFAULT false,
    transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_response JSONB,
    ai_mode VARCHAR(10) NOT NULL DEFAULT 'mock' CHECK (ai_mode IN ('mock', 'live')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_commercial_gaps_created_at ON commercial_gaps_reviews (created_at DESC);
-- Used by the deployment-independent retention sweep (see server.js) to find
-- stale failed/abandoned rows without a full table scan.
CREATE INDEX IF NOT EXISTS idx_commercial_gaps_status_created ON commercial_gaps_reviews (status, created_at);

-- Where to Start — Stripe-backed purchases of the priced offers (see
-- lib/whereToStartOffers.js for the catalogue, routes/whereToStart.js for
-- the checkout/webhook flow). One row per attempted checkout, created
-- 'pending' the moment a Checkout Session is requested and flipped to
-- 'paid'/'failed' only by the webhook handler (never by the success-page
-- redirect alone, which isn't trustworthy on its own).
--
-- The £500 Commercial Review credit is tracked as an Arrington-owned
-- entitlement in this table, not as a Stripe coupon: credited_toward_id is
-- set on the original £500 row once its credit has been consumed by a
-- later Full Commercial Review purchase (by automatic email match in
-- routes/whereToStart.js, or by Tom's manual override in routes/admin.js
-- when the customer paid under a different email). A row can only ever be
-- the source of one credit — every lookup filters on
-- credited_toward_id IS NULL — and the original £500 row is never mutated
-- beyond that one field, so it stays a fully auditable record of what was
-- actually charged. list_price_pence is the offer's real price (always
-- 250000 for the Full Commercial Review, regardless of any credit) so the
-- service itself always reads as what it is; amount_pence is what Stripe
-- actually charged on this specific session, which is list_price_pence
-- minus credit_applied_pence when a credit was applied.
CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    offer_id VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    list_price_pence INTEGER NOT NULL,
    amount_pence INTEGER NOT NULL,
    credit_applied_pence INTEGER NOT NULL DEFAULT 0,
    credit_applied_manually BOOLEAN NOT NULL DEFAULT false,
    currency VARCHAR(10) NOT NULL DEFAULT 'gbp',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
    stripe_session_id VARCHAR(255) UNIQUE,
    stripe_payment_intent_id VARCHAR(255),
    credited_toward_id INTEGER REFERENCES purchases(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchases_email_offer_status ON purchases (email, offer_id, status);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe_session ON purchases (stripe_session_id);

-- Diagnostic log of every POST to /api/stripe/webhook, success or failure.
-- Added 13/08/2026 after a real test purchase (£2,500 Full Commercial
-- Review, genuinely paid on Stripe's side) left its purchases row stuck on
-- 'pending' with no way to tell why: this sandbox has no outbound access to
-- api.stripe.com or the live site, and the Stripe MCP tool available in
-- that session did not expose an events-list or webhook-delivery-attempts
-- operation, so there was no way to read Stripe's own delivery record for
-- that event. This table makes the outcome of every future webhook attempt
-- readable from inside the app itself (admin panel -> System -> Webhook
-- log), independent of any external tool's availability. outcome is one of
-- 'processed' (signature verified, event handled), 'signature_invalid'
-- (STRIPE_WEBHOOK_SECRET mismatch — the prime suspect for the incident
-- above), 'not_configured' (STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET
-- unset/refused, e.g. a live key on this test-only branch), or
-- 'processing_error' (signature verified but the handler itself threw).
CREATE TABLE IF NOT EXISTS webhook_log (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(20) NOT NULL DEFAULT 'stripe',
    outcome VARCHAR(30) NOT NULL,
    event_type VARCHAR(100),
    stripe_event_id VARCHAR(255),
    detail TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_log_created_at ON webhook_log (created_at DESC);
