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

-- Arrington Product Guide — the guided recommendation experience (see
-- lib/productGuide.js for the routing engine, routes/productGuide.js for the
-- flow). Deliberately anonymous-first: a row is created when the visitor
-- submits their answers and sees their recommendation, with NO contact
-- details, because the approved brief requires the result to be shown before
-- any contact capture ("Do not require somebody to surrender contact details
-- simply to discover the recommendation"). name/email are filled in later,
-- and only if the visitor separately chooses to be contacted or emailed —
-- which is also the only point at which the optional AI summary runs (see
-- lib/productGuideAI.js).
--
-- recommendation_id holds the offer id chosen by computeRecommendation()
-- (matching lib/whereToStartOffers.js OFFERS keys), and recommendation_reason
-- the audit string explaining which branch produced it, so any recommendation
-- shown to any visitor can be reconstructed and checked after the fact
-- without re-running the guide.
CREATE TABLE IF NOT EXISTS product_guide_submissions (
    id SERIAL PRIMARY KEY,
    result_token VARCHAR(64) UNIQUE NOT NULL,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    recommendation_id VARCHAR(60) NOT NULL DEFAULT '',
    recommendation_reason VARCHAR(120) NOT NULL DEFAULT '',
    sensitive_topic VARCHAR(30) NOT NULL DEFAULT '',
    name VARCHAR(200) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    contact_requested BOOLEAN NOT NULL DEFAULT false,
    ai_summary TEXT NOT NULL DEFAULT '',
    ai_mode VARCHAR(10) NOT NULL DEFAULT 'mock' CHECK (ai_mode IN ('mock', 'live')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contacted_at TIMESTAMPTZ
);

-- ============================================================
-- Scott AI Demonstration (private, invited-access only)
--
-- A fully isolated fictional dataset for "Scott's Armchair & Knitting
-- Service" — see lib/scott/config.js for the Drive snapshot this was built
-- from. Nothing in this section is ever read by, or written to, any real
-- Arrington Consultancy table, and no real Arrington business data is ever
-- read into it. Access is gated through the existing page_access mechanism
-- against a synthetic hidden `pages` row (see db/seed.js) — no second auth
-- system, reusing the site's own session/bcrypt/Postgres login as-is.
--
-- Every scott_* table is prefixed so it is trivially greppable as isolated,
-- and every row it inserts is fictional. Structured fields on scott_jobs /
-- scott_enquiries / scott_customers are only ever changed by explicit,
-- code-driven actions a logged-in human takes in the UI (assign, mark
-- resolved, approve) — never directly by free-text JSON coming back from an
-- AI worker call. A worker's proposed material change is instead recorded
-- as an append-only row in scott_writebacks / scott_activity, which is the
-- demonstration's own private audit trail, explicitly never a write to the
-- real Drive brain (see lib/scott/governance.js).
-- ============================================================

CREATE TABLE IF NOT EXISTS scott_customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    kind VARCHAR(20) NOT NULL DEFAULT 'householder' CHECK (kind IN ('householder', 'business')),
    location VARCHAR(200) NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scott_jobs (
    id SERIAL PRIMARY KEY,
    ref VARCHAR(20) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES scott_customers(id) ON DELETE SET NULL,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('repair', 'knitting', 'combined')),
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'enquiry' CHECK (status IN ('enquiry', 'quoted', 'scheduled', 'in_progress', 'awaiting_parts', 'on_hold', 'completed', 'delivered')),
    price_pence INTEGER,
    promised_date DATE,
    collection_date DATE,
    at_risk BOOLEAN NOT NULL DEFAULT false,
    risk_note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scott_jobs_status ON scott_jobs (status);
CREATE INDEX IF NOT EXISTS idx_scott_jobs_customer ON scott_jobs (customer_id);

CREATE TABLE IF NOT EXISTS scott_enquiries (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES scott_customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(200) NOT NULL DEFAULT '',
    customer_email VARCHAR(255) NOT NULL DEFAULT '',
    channel VARCHAR(30) NOT NULL DEFAULT 'phone',
    subject VARCHAR(255) NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'routed', 'responded', 'closed')),
    assigned_worker_id VARCHAR(30),
    related_job_id INTEGER REFERENCES scott_jobs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scott_enquiries_status ON scott_enquiries (status);

-- Append-only. Feeds the "recent activity" feed on the hub — every row here
-- reflects something that actually happened in the demonstration (a real
-- routed request, a real approval, a real draft), never invented filler.
CREATE TABLE IF NOT EXISTS scott_activity (
    id SERIAL PRIMARY KEY,
    actor VARCHAR(30) NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    summary TEXT NOT NULL,
    related_job_id INTEGER REFERENCES scott_jobs(id) ON DELETE SET NULL,
    related_enquiry_id INTEGER REFERENCES scott_enquiries(id) ON DELETE SET NULL,
    conversation_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scott_activity_created ON scott_activity (created_at DESC);

-- A worker's proposed material write-back. Append-only by design (see the
-- header note above) — approving one never rewrites a structured column on
-- scott_jobs/scott_enquiries directly, it only allows the note to stand as
-- part of the record and appear in scott_activity. requires_approval is set
-- whenever the proposing worker's own specification says the underlying
-- decision needs Scott Mercer or Tom Arrington approval (e.g. a discount
-- above 10%); Company Brain & Records is the only worker whose own
-- record-keeping writebacks apply without a further approval step, matching
-- the real Permission Map.
CREATE TABLE IF NOT EXISTS scott_writebacks (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER,
    message_id INTEGER,
    proposing_worker_id VARCHAR(30) NOT NULL,
    intent_type VARCHAR(40) NOT NULL,
    summary TEXT NOT NULL,
    related_job_id INTEGER REFERENCES scott_jobs(id) ON DELETE SET NULL,
    related_enquiry_id INTEGER REFERENCES scott_enquiries(id) ON DELETE SET NULL,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'auto_applied' CHECK (status IN ('auto_applied', 'pending_approval', 'approved', 'rejected', 'superseded')),
    decided_by_user_id INTEGER REFERENCES users(id),
    -- A fictional staff member has no users row, so their approval was
    -- recorded as NULL: indistinguishable from an approval nobody made.
    -- An audit trail whose most important column can be empty is not one.
    decided_by_portal_user_id INTEGER REFERENCES scott_portal_users(id),
    decided_by_name VARCHAR(120) NOT NULL DEFAULT '',
    decided_at TIMESTAMPTZ,
    edited_by_human BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scott_writebacks_status ON scott_writebacks (status);

CREATE TABLE IF NOT EXISTS scott_conversations (
    id SERIAL PRIMARY KEY,
    -- Nullable: a conversation auto-started by a public lead submission has
    -- no logged-in staff member behind it — it's the team's shared record
    -- of handling that enquiry, not any one person's private chat. Only a
    -- general (job/enquiry-unscoped) conversation is ever truly personal.
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    -- A fictional staff member has no users row, so their ownership was
    -- previously represented by user_id being NULL, which is not an
    -- identity: every portal user looked identical to every other and to
    -- the public lead form. Ownership is now explicit on whichever of the
    -- two identity kinds actually started the conversation.
    portal_user_id INTEGER REFERENCES scott_portal_users(id) ON DELETE CASCADE,
    -- The clearance the conversation was conducted under. Replaying its
    -- history to a lower-clearance reader would hand them AI output
    -- generated from evidence they cannot see, so this is recorded at
    -- creation and checked on every read.
    persona_id VARCHAR(40) NOT NULL DEFAULT 'scott_mercer',
    title VARCHAR(255) NOT NULL DEFAULT 'New conversation',
    related_job_id INTEGER REFERENCES scott_jobs(id) ON DELETE SET NULL,
    related_enquiry_id INTEGER REFERENCES scott_enquiries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scott_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES scott_conversations(id) ON DELETE CASCADE,
    sender VARCHAR(20) NOT NULL CHECK (sender IN ('user', 'worker', 'system')),
    worker_id VARCHAR(30),
    content TEXT NOT NULL,
    certainty VARCHAR(10),
    technical_failure BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scott_messages_conversation ON scott_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_product_guide_created_at ON product_guide_submissions (created_at DESC);

-- Scott AI Demonstration: genuine fictional portal staff accounts.
--
-- Added 29/08/2026. These are REAL separately-authenticated logins, not a
-- "view as" selector: each fictional staff member (Scott Mercer, Tony
-- Marsh, Chloe Reed, Leah Morgan, Ellie Park, Ravi Singh, Jo Bell, Mike
-- Evans) gets their own username/password and their clearance is bound to
-- the authenticated row here, server-side. A logged-in fictional user
-- cannot change their own persona_id and cannot impersonate anyone else;
-- 07Q's "individual accounts only, no shared staff login" and "attempting
-- to bypass a restriction through Company Brain, search, another worker or
-- prompt wording does not change clearance" are both enforced by that
-- binding rather than by a UI control.
--
-- Deliberately a SEPARATE table from `users`: these are fictional
-- demonstration personas inside one demo area, not real site accounts with
-- CMS/admin capability. Keeping them out of `users` means a fictional
-- staff login can never accidentally inherit a real site permission, and
-- the real site's own auth/permissions code needs no awareness of them.
CREATE TABLE IF NOT EXISTS scott_portal_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(60) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    persona_id VARCHAR(40) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    job_title VARCHAR(160) NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scott_portal_users_username ON scott_portal_users (username);
