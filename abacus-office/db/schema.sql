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
