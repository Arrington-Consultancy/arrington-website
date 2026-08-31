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
    status VARCHAR(20) NOT NULL DEFAULT 'enquiry' CHECK (status IN ('enquiry', 'quoted', 'scheduled', 'in_progress', 'awaiting_parts', 'quality_check', 'rework', 'ready_for_return', 'on_hold', 'completed', 'delivered')),
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


-- Scott AI Demonstration: the Needs Human Input / Brain Gap register.
--
-- Added 29/08/2026. An AI worker blocked by MISSING, STALE or CONFLICTING
-- evidence is in a different situation from one blocked by an approval it
-- does not have, and only the second had a workflow (scott_writebacks).
-- Collapsing the two is how an approvals queue fills with items nobody can
-- approve because the underlying number is wrong, and how a model ends up
-- filling a gap by inference to clear the queue.
--
-- Three properties of this table are the point of it:
--
-- 1. responsible_persona_id is a PERSONA, meaning Scott or one of his
--    staff with a real login. An AI worker is not a person and is never
--    the responsible party for correcting a controlled record. The
--    raising worker is recorded separately in raised_by_worker_id, which
--    is a different question.
-- 2. The delivery result is recorded, not the intention. email_status
--    only reads 'sent' after a genuine successful send, so the interface
--    can say "[name] has been emailed" without that ever being a claim
--    the code merely hoped was true. A failure records its actual error.
-- 3. Closing requires a human. resolved_by_* is never written by any AI
--    path, and source_corrected is an explicit statement by that human
--    that the underlying controlled record has been corrected or
--    confirmed. A gap cannot be cleared by deciding it does not matter
--    any more.
CREATE TABLE IF NOT EXISTS scott_brain_gaps (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER,
    raised_by_worker_id VARCHAR(30) NOT NULL DEFAULT '',
    -- The clearance domain of the evidence itself, so an open gap is
    -- filtered on the dashboard by exactly the same rule as the record it
    -- concerns. A gap description quotes the evidence, so an unfiltered
    -- gap list would be a way round every other control.
    domain VARCHAR(60) NOT NULL DEFAULT '',
    gap_type VARCHAR(20) NOT NULL DEFAULT 'missing' CHECK (gap_type IN ('missing', 'stale', 'conflicting')),
    missing_evidence TEXT NOT NULL,
    why_it_matters TEXT NOT NULL,
    expected_source TEXT NOT NULL DEFAULT '',
    responsible_persona_id VARCHAR(40),
    responsible_name VARCHAR(120) NOT NULL DEFAULT '',
    work_can_continue BOOLEAN NOT NULL DEFAULT false,
    material BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'notified', 'awaiting_source', 'resolved', 'dismissed')),
    notify_decision VARCHAR(40) NOT NULL DEFAULT 'not_material',
    email_status VARCHAR(20) NOT NULL DEFAULT 'not_required' CHECK (email_status IN ('not_required', 'pending', 'sent', 'failed')),
    email_to VARCHAR(255) NOT NULL DEFAULT '',
    email_attempts SMALLINT NOT NULL DEFAULT 0,
    email_error TEXT NOT NULL DEFAULT '',
    emailed_at TIMESTAMPTZ,
    related_job_id INTEGER REFERENCES scott_jobs(id) ON DELETE SET NULL,
    related_enquiry_id INTEGER REFERENCES scott_enquiries(id) ON DELETE SET NULL,
    resolved_by_user_id INTEGER REFERENCES users(id),
    resolved_by_portal_user_id INTEGER REFERENCES scott_portal_users(id),
    resolved_by_name VARCHAR(120) NOT NULL DEFAULT '',
    -- Explicitly asserted by the human closing it: the controlled source
    -- has been corrected or confirmed. Closing without this is a dismissal,
    -- which is a different status and reads differently on the register.
    source_corrected BOOLEAN NOT NULL DEFAULT false,
    resolution_note TEXT NOT NULL DEFAULT '',
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scott_brain_gaps_status ON scott_brain_gaps (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scott_brain_gaps_responsible ON scott_brain_gaps (responsible_persona_id, status);

-- Where a fictional staff member's Brain Gap notification is actually
-- delivered. They are fictional and have no mailbox, so inventing an
-- address for them would make every send bounce and the "delivery result"
-- meaningless. The send is real, over the same authorised Gmail path the
-- rest of the site uses; it goes to a real demonstration inbox and says
-- plainly in the body which fictional person it is addressed to.
ALTER TABLE scott_portal_users ADD COLUMN IF NOT EXISTS notify_email VARCHAR(255) NOT NULL DEFAULT '';


-- ============================================================
-- Arrington AI Workspace v0.1 (added 30/08/2026)
--
-- Entirely separate from the Scott demonstration tables above: no
-- Scott table is referenced, no Scott identity is reused, and no
-- workspace table is readable through any Scott route. The workspace
-- holds REAL Arrington operating knowledge, so every read surface is
-- filtered by lib/workspace/clearance.js (human leg) intersected with
-- lib/workspace/lanes.js (lane leg). Real human access is Tom only.
-- ============================================================

-- The indexed brain. One row per controlled record extracted from the
-- approved source set (controlled Drive records, verified website /
-- GitHub / Railway state). Provenance is carried on the row itself:
-- source_ref names where the fact came from, as_of dates the fact,
-- synced_at dates the extraction, stale_after_days drives the freshness
-- display, sync_outcome records honestly whether the last sync worked.
CREATE TABLE IF NOT EXISTS workspace_records (
    id SERIAL PRIMARY KEY,
    record_key VARCHAR(120) UNIQUE NOT NULL,
    source_class VARCHAR(40) NOT NULL,
    authority_class VARCHAR(40) NOT NULL DEFAULT 'supporting' CHECK (authority_class IN ('master_authority', 'live_authority', 'handoff', 'evidence', 'supporting')),
    doc_status VARCHAR(20) NOT NULL DEFAULT 'current' CHECK (doc_status IN ('current', 'historic', 'superseded', 'proposed', 'unverified')),
    sensitivity VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (sensitivity IN ('standard', 'commercial', 'confidential')),
    title VARCHAR(300) NOT NULL,
    source_ref VARCHAR(500) NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    as_of DATE,
    synced_at TIMESTAMPTZ,
    stale_after_days INTEGER,
    sync_outcome VARCHAR(20) NOT NULL DEFAULT 'ok' CHECK (sync_outcome IN ('ok', 'partial', 'failed')),
    meta JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_records_class ON workspace_records (source_class, doc_status);

-- Conversations are owned by the authenticated human who started them,
-- with the clearance they held at the time snapshotted onto the row, so
-- history replay can never show more than the owner could see live.
CREATE TABLE IF NOT EXISTS workspace_conversations (
    id SERIAL PRIMARY KEY,
    owner_username VARCHAR(100) NOT NULL,
    clearance VARCHAR(40) NOT NULL,
    lane_id VARCHAR(60) NOT NULL DEFAULT '',
    title VARCHAR(300) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_conversations_owner ON workspace_conversations (owner_username, updated_at DESC);

-- provenance holds the record_keys the server actually supplied to the
-- model for this turn: server-known fact, never a model claim.
CREATE TABLE IF NOT EXISTS workspace_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES workspace_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    lane_id VARCHAR(60) NOT NULL DEFAULT '',
    provenance JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_messages_conv ON workspace_messages (conversation_id, id);

-- Brain gaps, per ARRINGTON AI WORKSPACE V0.1 - BRAIN GAP & HUMAN
-- NOTIFICATION STANDARD. Same honesty rules as scott_brain_gaps, which
-- proved them: a gap carries the sensitivity of the evidence it quotes
-- and is filtered like the record it concerns; resolving requires a
-- human and a written statement; resolve and dismiss stay different.
CREATE TABLE IF NOT EXISTS workspace_gaps (
    id SERIAL PRIMARY KEY,
    gap_type VARCHAR(20) NOT NULL DEFAULT 'missing' CHECK (gap_type IN ('missing', 'stale', 'conflicting', 'provenance', 'source_failure')),
    description TEXT NOT NULL,
    record_key VARCHAR(120) NOT NULL DEFAULT '',
    sensitivity VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (sensitivity IN ('standard', 'commercial', 'confidential')),
    material BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    raised_by VARCHAR(100) NOT NULL,
    resolved_by VARCHAR(100) NOT NULL DEFAULT '',
    source_corrected BOOLEAN NOT NULL DEFAULT false,
    resolution_note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workspace_gaps_status ON workspace_gaps (status, created_at DESC);

-- Human approval gates: a record-only queue. Approving a row records a
-- decision; it executes nothing. Action classes follow the control
-- pack; the workspace itself only ever performs class 3 (workspace
-- record writes). Class 4+ actions are out of scope for v0.1.
CREATE TABLE IF NOT EXISTS workspace_approvals (
    id SERIAL PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    action_class SMALLINT NOT NULL DEFAULT 3,
    sensitivity VARCHAR(20) NOT NULL DEFAULT 'commercial' CHECK (sensitivity IN ('standard', 'commercial', 'confidential')),
    requested_by VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'declined')),
    decided_by VARCHAR(100) NOT NULL DEFAULT '',
    decision_note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workspace_approvals_status ON workspace_approvals (status, created_at DESC);

-- Append-only. No route updates or deletes rows here, and no AI path
-- writes anything except through the server's own audited helpers.
CREATE TABLE IF NOT EXISTS workspace_activity (
    id SERIAL PRIMARY KEY,
    actor VARCHAR(100) NOT NULL,
    event_type VARCHAR(60) NOT NULL,
    summary TEXT NOT NULL,
    -- Governance finding J2 (31/08/2026): the failed-unlock alert's
    -- per-account cooldown was keyed by substring-matching the account
    -- name inside `summary`, which is human-readable prose. Rewording
    -- the message would silently remove the cooldown, and a username
    -- containing a LIKE wildcard would match another account's rows.
    -- The account a row is ABOUT now has its own column and is matched
    -- exactly. Empty for rows that are not about a particular account.
    subject VARCHAR(200) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_time ON workspace_activity (created_at DESC);
-- The (event_type, subject) index is created in db/seed.js AFTER the
-- ALTER that adds `subject`, deliberately, NOT here. On an existing
-- database CREATE TABLE IF NOT EXISTS is skipped while the index
-- statements still run, so an index naming a column that the ALTER has
-- not yet added fails the whole seed. That is the same ordering trap
-- that crashed production during the Scott v0.2 release: it is
-- invisible in every environment whose schema already carries history.

-- One row per ingest attempt, successful or not, so freshness claims on
-- the Today page rest on recorded runs rather than assumption.
CREATE TABLE IF NOT EXISTS workspace_sync_runs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    outcome VARCHAR(20) NOT NULL DEFAULT 'failed' CHECK (outcome IN ('ok', 'partial', 'failed')),
    records_written INTEGER NOT NULL DEFAULT 0,
    detail TEXT NOT NULL DEFAULT ''
);

-- ------------------------------------------------------------
-- Arrington AI Workspace: social media control area (30/08/2026)
--
-- Four platforms (Facebook, Instagram, LinkedIn, X) presented as ONE
-- control area rather than four unrelated integrations, so every table
-- here is keyed by platform rather than duplicated per network.
--
-- The load-bearing distinction is between a credential and a
-- retrieval. workspace_social_accounts records both separately:
-- whether a connector is configured, and when it last actually
-- returned data. An interface may only claim the second on the
-- strength of last_sync_outcome, never on the strength of a token
-- existing.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workspace_social_accounts (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(20) UNIQUE NOT NULL CHECK (platform IN ('facebook', 'instagram', 'linkedin', 'x')),
    -- 'not_configured' is the honest default: no credential has ever
    -- been supplied. 'configured' means a credential exists and nothing
    -- more. Only a real retrieval moves last_sync_outcome to 'ok'.
    status VARCHAR(20) NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured', 'configured', 'revoked', 'error')),
    account_ref VARCHAR(200) NOT NULL DEFAULT '',
    display_name VARCHAR(200) NOT NULL DEFAULT '',
    granted_scopes TEXT NOT NULL DEFAULT '',
    connected_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    last_sync_outcome VARCHAR(20) NOT NULL DEFAULT 'never' CHECK (last_sync_outcome IN ('never', 'ok', 'partial', 'failed')),
    last_error TEXT NOT NULL DEFAULT '',
    stale_after_hours INTEGER NOT NULL DEFAULT 24,
    followers INTEGER,
    followers_change INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Retrieved content. kind separates what was published from what is
-- only proposed, so a draft can never be mistaken for something that
-- actually went out. 'proposed' rows are written by the drafting lane
-- and are inert until a human publishes them by hand.
CREATE TABLE IF NOT EXISTS workspace_social_posts (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL,
    external_id VARCHAR(200) NOT NULL DEFAULT '',
    kind VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (kind IN ('published', 'scheduled', 'draft', 'proposed')),
    body TEXT NOT NULL DEFAULT '',
    permalink TEXT NOT NULL DEFAULT '',
    posted_at TIMESTAMPTZ,
    impressions INTEGER,
    engagements INTEGER,
    comments_count INTEGER,
    drafted_by VARCHAR(60) NOT NULL DEFAULT '',
    retrieved_at TIMESTAMPTZ,
    UNIQUE (platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_social_posts_platform ON workspace_social_posts (platform, posted_at DESC);

-- Comments, mentions and messages needing a human reply. needs_reply
-- plus replied_at is the outstanding-replies list; nothing here is ever
-- answered by the workspace itself.
CREATE TABLE IF NOT EXISTS workspace_social_engagement (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL,
    external_id VARCHAR(200) NOT NULL DEFAULT '',
    kind VARCHAR(20) NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'mention', 'message', 'review')),
    author VARCHAR(200) NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    permalink TEXT NOT NULL DEFAULT '',
    occurred_at TIMESTAMPTZ,
    needs_reply BOOLEAN NOT NULL DEFAULT false,
    -- Set by a human recording that they replied on the platform. The
    -- workspace cannot reply, so it cannot set this on its own.
    replied_at TIMESTAMPTZ,
    replied_by VARCHAR(100) NOT NULL DEFAULT '',
    suggested_reply TEXT NOT NULL DEFAULT '',
    retrieved_at TIMESTAMPTZ,
    UNIQUE (platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_social_engagement_open ON workspace_social_engagement (needs_reply, occurred_at DESC);

-- One row per retrieval attempt per platform, successful or not, so the
-- control area can show what actually happened rather than what was
-- intended.
CREATE TABLE IF NOT EXISTS workspace_social_sync_runs (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    outcome VARCHAR(20) NOT NULL DEFAULT 'failed' CHECK (outcome IN ('ok', 'partial', 'failed', 'skipped_not_configured')),
    items_written INTEGER NOT NULL DEFAULT 0,
    detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_workspace_social_sync_runs_platform ON workspace_social_sync_runs (platform, id DESC);
-- ------------------------------------------------------------
-- Contacts (CRM), added 30/08/2026
--
-- Every public interaction on this site already funnels through the
-- `leads` table: the four checks, the footer contact form, gated PDF
-- requests and quiz results. That makes one contact record per person
-- a projection over history rather than something that has to start
-- empty on the day it is switched on.
--
-- Two rules the shape enforces:
--
-- 1. A person is identified by their email, normalised (trimmed and
--    lowercased), so the same person arriving through three different
--    checks is one contact rather than three.
-- 2. Every interaction keeps its own row with its own source, so
--    "signed up with Google" is a recorded fact about a specific
--    submission and not an assumption applied to the whole contact.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_contacts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL DEFAULT '',
    phone VARCHAR(60) NOT NULL DEFAULT '',
    company VARCHAR(200) NOT NULL DEFAULT '',
    first_seen_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    interaction_count INTEGER NOT NULL DEFAULT 0,
    -- How this person first arrived, and whether they have ever used the
    -- Google prefill. Both are facts about recorded submissions.
    first_source VARCHAR(40) NOT NULL DEFAULT '',
    used_google_prefill BOOLEAN NOT NULL DEFAULT false,
    -- Set by a human in the workspace, never by any automated path.
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_last_seen ON crm_contacts (last_seen_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS crm_contact_events (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
    kind VARCHAR(40) NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    signup_source VARCHAR(20) NOT NULL DEFAULT '',
    occurred_at TIMESTAMPTZ NOT NULL,
    -- The row this event was derived from, so a rebuild is idempotent
    -- rather than duplicating every event each time it runs.
    source_table VARCHAR(40) NOT NULL DEFAULT 'leads',
    source_id INTEGER,
    UNIQUE (source_table, source_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_contact_events_contact ON crm_contact_events (contact_id, occurred_at DESC);

-- Where the visitor's details came from on a given submission: '' for
-- typed, 'google' for the Continue with Google prefill. Recorded so
-- "signed up using Google" is a fact rather than a guess.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS signup_source VARCHAR(20) NOT NULL DEFAULT '';

-- The Commercial Gaps Review writes its lead row after the interview
-- finishes, in a code path with no request in scope, so the source of
-- the visitor's details is carried on the review row from the start.
ALTER TABLE commercial_gaps_reviews ADD COLUMN IF NOT EXISTS signup_source VARCHAR(20) NOT NULL DEFAULT '';

-- Erasure register (30/08/2026).
--
-- Evidence that a specific erasure request was carried out, designed so
-- the register does not itself defeat the erasure: it stores a one-way
-- hash of the address plus a redacted form for a human to recognise,
-- never the address itself. That is enough to answer "did you action my
-- request" when someone quotes their own email, and not enough to
-- rebuild a contact list from the register.
--
-- removed/retained record what actually happened per table. Retention
-- is stated rather than hidden: a purchase is a financial record with
-- its own statutory retention period, so it is NOT deleted with the
-- contact, and the register says so.
CREATE TABLE IF NOT EXISTS crm_erasures (
    id SERIAL PRIMARY KEY,
    email_hash CHAR(64) NOT NULL,
    email_redacted VARCHAR(120) NOT NULL DEFAULT '',
    requested_by VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    removed JSONB NOT NULL DEFAULT '{}',
    retained JSONB NOT NULL DEFAULT '{}',
    erased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_erasures_hash ON crm_erasures (email_hash);
