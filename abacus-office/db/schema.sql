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
-- A complaint typed in by staff from another channel (10 November 2026):
-- where it came in, and how to reach the customer if staff have it.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'email';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS contact VARCHAR(200) NOT NULL DEFAULT '';
-- Approving is not sending (11 November 2026). mailbox_state records where
-- an approved reply got to: '' (nothing), 'saving' (claimed, the mailbox not
-- yet answered), 'saved', or 'uncertain' (the mailbox did not answer
-- clearly, so the draft may or may not be there). sent_at is a person's
-- word that they sent it.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS mailbox_state VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS mailbox_state_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
-- Every change to the reply moves its version on, so a save or approval
-- from a page opened before the change is refused (11 November 2026).
ALTER TABLE cases ADD COLUMN IF NOT EXISTS draft_version INTEGER NOT NULL DEFAULT 0;
-- A booking being put into dispatch right now, so two presses make one.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS booking_claim_at TIMESTAMPTZ;

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

-- Standard replies (11 November 2026): the firm's own wording for the
-- questions it gets every day, kept per company by a manager or the owner.
-- Staff put one into a draft with a click, and the AI follows the wording
-- of one that fits. A reply with no company is for every company.
CREATE TABLE IF NOT EXISTS standard_replies (
  id SERIAL PRIMARY KEY,
  brand VARCHAR(40) NOT NULL DEFAULT '',
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  updated_by VARCHAR(120) NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS standard_replies_brand_idx ON standard_replies (brand, title);

-- The review of 11 November 2026. What became of an approved reply in the
-- mailbox: still a draft ('unsent'), sent ('sent'), or deleted without being
-- sent ('discarded'), read back from Gmail. And a version on the draft, so a
-- save made from a page someone else has since changed is refused rather
-- than written over theirs.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS saved_thread_id TEXT NOT NULL DEFAULT '';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sent_state VARCHAR(12) NOT NULL DEFAULT '';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sent_checked_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS draft_version INTEGER NOT NULL DEFAULT 0;

-- What the pilot measures (Codex's review, 16 November 2026). ai_draft: the
-- reply as the AI (or the prepared answer) last wrote it, so an approval
-- can record whether staff changed it first. approved_edited: NULL when
-- staff wrote the reply themselves, true when they changed the AI's,
-- false when they approved it as written.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS ai_draft TEXT NOT NULL DEFAULT '';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS approved_edited BOOLEAN;

-- Complaint escalation times (Tom, 16 November 2026): a safety matter tells
-- a manager straight away, a serious complaint after 2 hours with no
-- approved reply, any other after 12. Telling a manager does NOT take the
-- complaint away from the operators (Tom: "i dont want complaints to bypass
-- operators, they need to go there as well"): the operators keep it and can
-- still answer it. Only an operator's own "Pass up to a manager" hands
-- approval to a manager.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS manager_alerted_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS manager_alert_reason TEXT NOT NULL DEFAULT '';
-- Complaints the old 12-hour nudge passed up by itself (no person, no
-- holding reply sent) go back to the operators, with the manager still told.
UPDATE cases SET manager_alerted_at = passed_up_at, manager_alert_reason = passed_up_reason,
       passed_up_at = NULL, passed_up_reason = ''
 WHERE passed_up_at IS NOT NULL AND passed_up_by IS NULL AND holding_sent_at IS NULL
   AND passed_up_reason LIKE 'No approved reply within %';

-- One mailbox per company, and more later (Tom, 27 November 2026: "each
-- company might have multiple inboxes"; ".com .co.uk .net etc can all go
-- into one company email box. We can create more down the line"). The owner
-- adds a mailbox in Settings, ties it to a company and connects it by
-- signing in to Google as that address. token is the sealed refresh token
-- (lib/secretBox.js); it is never shown. start_at is the moment it was
-- first connected: nothing received before then is taken in, so staff
-- start with a clean inbox and no backlog marked overdue.
CREATE TABLE IF NOT EXISTS mailboxes (
  id SERIAL PRIMARY KEY,
  brand VARCHAR(40) NOT NULL DEFAULT '',
  address VARCHAR(200) NOT NULL UNIQUE,
  token TEXT NOT NULL DEFAULT '',
  connected_by VARCHAR(200) NOT NULL DEFAULT '',
  connected_at TIMESTAMPTZ,
  start_at TIMESTAMPTZ,
  created_by VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Which mailbox an email came into (NULL or 0: the one set on the server),
-- its address as it was then, so the case still says so after the mailbox
-- is removed, and the addresses the customer wrote to, so staff can see
-- whether it was the .com, the .co.uk or another one.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS mailbox_id INTEGER;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS mailbox_address VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS sent_to TEXT NOT NULL DEFAULT '';
-- Which mailbox an approved Write email was saved in.
ALTER TABLE compositions ADD COLUMN IF NOT EXISTS mailbox_id INTEGER;
