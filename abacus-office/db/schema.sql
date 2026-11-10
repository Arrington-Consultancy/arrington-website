-- The Abacus office's own database. Nothing here is shared with the
-- Arrington site: this service has its own Postgres (Railway Postgres-bYAT).
-- Every statement is idempotent so the app can run it at every boot.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(60) UNIQUE NOT NULL,
  display_name VARCHAR(120) NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('operator', 'manager', 'owner')),
  active BOOLEAN NOT NULL DEFAULT true,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- One case per email the office has seen. message_id is the mailbox's own
-- id for the email, so a second read of the inbox never makes a second case.
CREATE TABLE IF NOT EXISTS cases (
  id SERIAL PRIMARY KEY,
  message_id TEXT UNIQUE NOT NULL,
  mailbox_email_id TEXT NOT NULL DEFAULT '',
  thread_id TEXT NOT NULL DEFAULT '',
  from_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  received_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'waiting', 'done')),
  kind VARCHAR(20) NOT NULL DEFAULT 'unread' CHECK (kind IN ('unread', 'bookings', 'customer', 'complaints', 'licensing', 'other')),
  seriousness VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (seriousness IN ('none', 'minor', 'serious', 'safety')),
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reading JSONB,
  reading_source VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (reading_source IN ('none', 'ai', 'prepared')),
  reading_note TEXT NOT NULL DEFAULT '',
  complaint JSONB,
  draft TEXT NOT NULL DEFAULT '',
  guidance JSONB NOT NULL DEFAULT '[]',
  held_back TEXT NOT NULL DEFAULT '',
  approved_at TIMESTAMPTZ,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  saved_draft_id TEXT,
  escalated_at TIMESTAMPTZ,
  escalation_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cases_status_idx ON cases (status, received_at);
CREATE INDEX IF NOT EXISTS cases_kind_idx ON cases (kind, status);

-- Who did what, to which case, when. The accountability Dan asked for: each
-- member of staff has their own login, and every action carries their name.
CREATE TABLE IF NOT EXISTS case_events (
  id SERIAL PRIMARY KEY,
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(120) NOT NULL DEFAULT '',
  kind VARCHAR(40) NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS case_events_case_idx ON case_events (case_id, at);
CREATE INDEX IF NOT EXISTS case_events_at_idx ON case_events (at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(60) PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Release two (Tom's email to Dan, 9 November 2026). Every statement below
-- is idempotent, so an existing database gains the columns at boot.

-- Visibility by brand: a case belongs to the brand whose mailbox it came in
-- on; a user with a brand sees that brand only, a user with none (Dan's own
-- office) sees everything, split by brand.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS brand VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS brand VARCHAR(40) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS cases_brand_idx ON cases (brand, status);

-- A complaint passed up to a manager by an operator (or by the nudge), and
-- the holding reply the operator sent on the way.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS passed_up_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS passed_up_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS passed_up_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS passed_up_notified_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS holding_sent_at TIMESTAMPTZ;

-- The council worker (10 November 2026): what a council email asks for, by
-- when, and the drafted reply, for managers and owners only.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS council JSONB;

-- A booking put into dispatch by a member of staff who signed it off.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS dispatch_ref VARCHAR(60) NOT NULL DEFAULT '';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS booked_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- What the stand-in dispatch holds. The live connection (iCabbi, on Dan's
-- own account) replaces this table with the vendor's API; nothing here is
-- ever sent to a vendor.
CREATE TABLE IF NOT EXISTS dispatch_bookings (
  id SERIAL PRIMARY KEY,
  ref VARCHAR(60) UNIQUE NOT NULL,
  case_id INTEGER REFERENCES cases(id) ON DELETE SET NULL,
  brand VARCHAR(40) NOT NULL DEFAULT '',
  job JSONB NOT NULL,
  booked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  booked_by_name VARCHAR(120) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The firm's fixed prices (airports and the like), typed in by the owner or
-- a manager, or later read from iCabbi. The AI quotes only from this table.
CREATE TABLE IF NOT EXISTS fixed_prices (
  id SERIAL PRIMARY KEY,
  brand VARCHAR(40) NOT NULL DEFAULT '',
  from_place VARCHAR(120) NOT NULL,
  to_place VARCHAR(120) NOT NULL,
  vehicle VARCHAR(60) NOT NULL DEFAULT 'Car (up to 4)',
  price_pence INTEGER NOT NULL CHECK (price_pence >= 0),
  notes VARCHAR(200) NOT NULL DEFAULT '',
  updated_by VARCHAR(120) NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The live dispatch connection (iCabbi, 10 November 2026): the trip number
-- iCabbi gives a booking, its last known status in iCabbi's words, and
-- when that was read.
ALTER TABLE dispatch_bookings ADD COLUMN IF NOT EXISTS external_id VARCHAR(60) NOT NULL DEFAULT '';
ALTER TABLE dispatch_bookings ADD COLUMN IF NOT EXISTS dispatch_status VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE dispatch_bookings ADD COLUMN IF NOT EXISTS status_detail VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE dispatch_bookings ADD COLUMN IF NOT EXISTS status_checked_at TIMESTAMPTZ;

-- The Write worker (10 November 2026): emails staff ask the AI to draft,
-- a new email, a reply or outreach, in the company's name. Approving saves
-- it as a draft in the mailbox for a person to send; nothing is sent here.
CREATE TABLE IF NOT EXISTS compositions (
  id SERIAL PRIMARY KEY,
  brand VARCHAR(40) NOT NULL DEFAULT '',
  kind VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (kind IN ('new', 'reply', 'outreach', 'council_new', 'council_reply')),
  relationship VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (relationship IN ('familiar', 'new', 'formal')),
  to_name VARCHAR(160) NOT NULL DEFAULT '',
  to_address VARCHAR(200) NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  quoted TEXT NOT NULL DEFAULT '',
  subject VARCHAR(200) NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  held_back VARCHAR(400) NOT NULL DEFAULT '',
  guidance JSONB NOT NULL DEFAULT '[]',
  source VARCHAR(20) NOT NULL DEFAULT 'none',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'discarded')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_name VARCHAR(120) NOT NULL DEFAULT '',
  approved_by_name VARCHAR(120) NOT NULL DEFAULT '',
  approved_at TIMESTAMPTZ,
  mailbox_draft_id VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compositions_by_idx ON compositions (created_by, updated_at DESC);
-- Writing to the council (10 November 2026): an existing database widens
-- the kinds once; a database that already allows them is left alone.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'compositions'::regclass AND conname = 'compositions_kind_check' AND pg_get_constraintdef(oid) LIKE '%council_reply%') THEN
    ALTER TABLE compositions DROP CONSTRAINT IF EXISTS compositions_kind_check;
    ALTER TABLE compositions ADD CONSTRAINT compositions_kind_check CHECK (kind IN ('new', 'reply', 'outreach', 'council_new', 'council_reply'));
  END IF;
END $$;

-- Who has been in (Tom, 10 November 2026: "Let's find out what dan does
-- when he logs on"). One row per visit: a sign-in, or the first page after
-- 20 minutes without one, opens it; every page opened and button pressed is
-- added; signing out or 20 quiet minutes closes it. Shown on Activity to
-- managers and owners. Kept 90 days.
CREATE TABLE IF NOT EXISTS visits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user_name VARCHAR(120) NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  ended_how VARCHAR(20) NOT NULL DEFAULT '',
  pages JSONB NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS visits_one_open ON visits (user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS visits_by_start ON visits (started_at DESC);
