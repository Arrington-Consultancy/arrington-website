'use strict';

// Every SQL statement the office runs, in one place. Parameterised
// throughout; nothing here builds SQL from a value.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const ROLES = ['operator', 'manager', 'owner'];
const STATUSES = ['new', 'in_progress', 'waiting', 'done'];
const KINDS = ['unread', 'bookings', 'customer', 'complaints', 'licensing', 'other'];
const DEFAULT_SETTINGS = { escalation_hours: '24', complaint_nudge_hours: '12' };

// A list's scope: a company id (string) or { brand, hideCouncil }. An
// undefined company is every company; hideCouncil leaves out the council
// (licensing) emails, which only managers and owners see.
function scopeOf(scope) {
  if (scope && typeof scope === 'object') return { brand: scope.brand || '', hideCouncil: Boolean(scope.hideCouncil) };
  return { brand: scope || '', hideCouncil: false };
}
function scopeWhere(scope, params, alias = '') {
  const sc = scopeOf(scope);
  const out = [];
  if (sc.brand) { params.push(sc.brand); out.push(`${alias}brand = $${params.length}`); }
  if (sc.hideCouncil) out.push(`${alias}kind <> 'licensing'`);
  return out;
}

class Store {
  constructor(pool) { this.pool = pool; }
  q(text, params) { return this.pool.query(text, params); }

  async ensureSchema() { await this.q(SCHEMA); }

  // ---- settings ----
  async setting(key) {
    const r = await this.q('SELECT value FROM settings WHERE key = $1', [key]);
    return r.rows[0] ? r.rows[0].value : (DEFAULT_SETTINGS[key] ?? '');
  }
  async setSetting(key, value) {
    await this.q('INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [key, String(value)]);
  }
  async escalationHours() {
    const n = Number(await this.setting('escalation_hours'));
    return Number.isFinite(n) && n >= 1 && n <= 168 ? n : 24;
  }
  // How long a complaint may sit with no approved reply before a manager is
  // nudged (Tom's email to Dan, 9 November 2026: 12 hours, pencilled in).
  async complaintNudgeHours() {
    const n = Number(await this.setting('complaint_nudge_hours'));
    return Number.isFinite(n) && n >= 1 && n <= 168 ? n : 12;
  }

  // ---- users ----
  async userCount() { return Number((await this.q('SELECT count(*)::int AS n FROM users')).rows[0].n); }
  async userByName(username) {
    const r = await this.q('SELECT * FROM users WHERE lower(username) = lower($1)', [String(username || '').trim()]);
    return r.rows[0] || null;
  }
  async userById(id) { return (await this.q('SELECT * FROM users WHERE id = $1', [id])).rows[0] || null; }
  async users() { return (await this.q('SELECT id, username, display_name, role, brand, active, must_change_password, created_at, last_login_at FROM users ORDER BY role DESC, username')).rows; }
  async createUser({ username, displayName = '', password, role, brand = '', mustChange = false }) {
    if (!ROLES.includes(role)) throw new Error('bad role');
    const name = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,39}$/.test(name)) throw new Error('A username is 2 to 40 letters, digits, dots, dashes or underscores.');
    if (String(password || '').length < 10) throw new Error('A password needs at least 10 characters.');
    const hash = await bcrypt.hash(password, 12);
    const r = await this.q('INSERT INTO users (username, display_name, password_hash, role, brand, must_change_password) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, display_name, role, brand, active', [name, String(displayName || '').trim().slice(0, 120), hash, role, String(brand || '').trim().toLowerCase().slice(0, 40), mustChange]);
    return r.rows[0];
  }
  async setPassword(id, password, mustChange = false) {
    if (String(password || '').length < 10) throw new Error('A password needs at least 10 characters.');
    const hash = await bcrypt.hash(password, 12);
    await this.q('UPDATE users SET password_hash = $2, must_change_password = $3 WHERE id = $1', [id, hash, mustChange]);
  }
  async setUserActive(id, active) { await this.q('UPDATE users SET active = $2 WHERE id = $1', [id, Boolean(active)]); }
  async setUserRole(id, role) { if (!ROLES.includes(role)) throw new Error('bad role'); await this.q('UPDATE users SET role = $2 WHERE id = $1', [id, role]); }
  async setUserBrand(id, brand) { await this.q('UPDATE users SET brand = $2 WHERE id = $1', [id, String(brand || '').trim().toLowerCase().slice(0, 40)]); }
  async touchLogin(id) { await this.q('UPDATE users SET last_login_at = now() WHERE id = $1', [id]); }
  async ownerCount() { return Number((await this.q("SELECT count(*)::int AS n FROM users WHERE role = 'owner' AND active")).rows[0].n); }

  // ---- cases ----
  async caseByMessageId(messageId) { return (await this.q('SELECT * FROM cases WHERE message_id = $1', [messageId])).rows[0] || null; }
  async caseById(id) {
    const r = await this.q('SELECT c.*, u.display_name AS owner_display, u.username AS owner_username FROM cases c LEFT JOIN users u ON u.id = c.owner_id WHERE c.id = $1', [id]);
    return r.rows[0] || null;
  }
  async insertCase(email, brand = '') {
    const r = await this.q(
      `INSERT INTO cases (message_id, mailbox_email_id, thread_id, from_address, subject, body, received_at, brand)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (message_id) DO NOTHING RETURNING *`,
      [email.messageId || email.id, String(email.id), email.threadId || '', String(email.from || '').slice(0, 300), String(email.subject || '').slice(0, 500), String(email.body || '').slice(0, 20000), new Date(email.receivedAt), String(brand || '').slice(0, 40)]
    );
    return r.rows[0] || null;
  }
  // A complaint typed in by staff (lib/channels.js). Its message id is made
  // here and can never be a real email's, so the mailbox sync never meets it.
  // logId: the form's own one-time id, so the same form sent twice is one
  // complaint. Returns the row, with existed: true when it was already in.
  async insertLoggedComplaint({ brand, channel, name, contact, subject, text, receivedAt, logId }) {
    const one = /^[0-9a-f-]{36}$/.test(String(logId || '')) ? String(logId) : require('crypto').randomUUID();
    const id = `<logged-${one}@office>`;
    const r = await this.q(
      `INSERT INTO cases (message_id, mailbox_email_id, thread_id, from_address, subject, body, received_at, brand, kind, channel, contact)
       VALUES ($1, '', '', $2, $3, $4, $5, $6, 'complaints', $7, $8) ON CONFLICT (message_id) DO NOTHING RETURNING *`,
      [id, String(name || '').slice(0, 300), String(subject || '').slice(0, 500), String(text || '').slice(0, 20000), receivedAt, String(brand || '').slice(0, 40), channel, String(contact || '').slice(0, 200)]
    );
    if (r.rows[0]) return r.rows[0];
    return { ...(await this.caseByMessageId(id)), existed: true };
  }
  async listCases({ status, kind, ownerId, open, escalated, passedUp, unsent, brand, limit = 200 } = {}) {
    const where = [];
    const params = [];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    // brand: undefined means every brand (the office view); a string means
    // that brand only, which is what a brand's own staff get.
    where.push(...scopeWhere(brand, params, 'c.'));
    if (status) add('c.status = ?', status);
    if (passedUp) where.push('c.passed_up_at IS NOT NULL AND c.approved_at IS NULL AND c.status <> \'done\'');
    if (unsent) where.push("c.approved_at IS NOT NULL AND c.sent_at IS NULL AND c.status <> 'done'");
    if (kind) add('c.kind = ?', kind);
    if (ownerId) add('c.owner_id = ?', ownerId);
    if (open) where.push("c.status IN ('new', 'in_progress', 'waiting')");
    if (escalated) where.push('c.escalated_at IS NOT NULL AND c.approved_at IS NULL AND c.status IN (\'new\', \'in_progress\')');
    // Approved and saved in the mailbox, but still not sent after N minutes.
    params.push(limit);
    const r = await this.q(
      `SELECT c.*, u.display_name AS owner_display, u.username AS owner_username FROM cases c LEFT JOIN users u ON u.id = c.owner_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.received_at DESC LIMIT $${params.length}`, params);
    return r.rows;
  }
  // Search the cases a person may see: subject, sender, the email itself,
  // the dispatch reference, the contact staff typed in, and the customer's
  // name and phone as the AI read them. "#12" or "12" also finds case 12.
  async searchCases(text, scope, limit = 100) {
    const q = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (q.length < 2 && !/^#?\d+$/.test(q)) return [];
    const params = [];
    const where = scopeWhere(scope, params, 'c.');
    params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    const p = `$${params.length}`;
    const ors = ['c.subject', 'c.from_address', 'c.body', 'c.dispatch_ref', 'c.contact', "c.reading->>'customer_name'", "c.reading->>'phone'"].map((col) => `${col} ILIKE ${p}`);
    const asId = q.replace(/^#/, '');
    if (/^\d{1,9}$/.test(asId)) { params.push(Number(asId)); ors.push(`c.id = $${params.length}`); }
    where.push(`(${ors.join(' OR ')})`);
    params.push(limit);
    return (await this.q(`SELECT c.*, u.display_name AS owner_display, u.username AS owner_username FROM cases c LEFT JOIN users u ON u.id = c.owner_id
      WHERE ${where.join(' AND ')} ORDER BY c.received_at DESC LIMIT $${params.length}`, params)).rows;
  }
  async counts(scope) {
    const params = [];
    const w = scopeWhere(scope, params);
    const r = await this.q(`SELECT
      count(*) FILTER (WHERE status = 'new')::int AS new_count,
      count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
      count(*) FILTER (WHERE status = 'waiting')::int AS waiting,
      count(*) FILTER (WHERE status = 'done')::int AS done,
      count(*) FILTER (WHERE kind = 'complaints' AND status <> 'done')::int AS complaints_open,
      count(*) FILTER (WHERE kind = 'complaints' AND status <> 'done' AND seriousness = 'safety')::int AS safety_open,
      count(*) FILTER (WHERE escalated_at IS NOT NULL AND approved_at IS NULL AND status IN ('new', 'in_progress'))::int AS overdue,
      count(*) FILTER (WHERE kind = 'complaints' AND status <> 'done' AND passed_up_at IS NOT NULL AND approved_at IS NULL)::int AS passed_up,
      count(*) FILTER (WHERE kind = 'licensing' AND status <> 'done')::int AS council_open,
      count(*) FILTER (WHERE kind = 'unread')::int AS unread,
      count(*) FILTER (WHERE approved_at IS NOT NULL AND sent_at IS NULL AND status <> 'done')::int AS unsent
      FROM cases${w.length ? ` WHERE ${w.join(' AND ')}` : ''}`, params);
    return r.rows[0];
  }
  // One value that changes whenever anything a list page shows has changed,
  // so a page can ask "anything new?" cheaply and reload only then.
  async liveStamp(scope) {
    const params = [];
    const wc = scopeWhere(scope, params, 'c.');
    const sc = scopeOf(scope);
    const ek = [];
    if (sc.brand) ek.push('k.brand = $1');
    if (sc.hideCouncil) ek.push("k.kind <> 'licensing'");
    const r = await this.q(`SELECT count(*)::int AS n, coalesce(max(c.updated_at), 'epoch')::text AS latest,
        coalesce((SELECT max(e.at) FROM case_events e JOIN cases k ON k.id = e.case_id${ek.length ? ` WHERE ${ek.join(' AND ')}` : ''}), 'epoch')::text AS latest_event
      FROM cases c${wc.length ? ` WHERE ${wc.join(' AND ')}` : ''}`, params);
    return `${r.rows[0].n}:${r.rows[0].latest}:${r.rows[0].latest_event}`;
  }
  async updateCase(id, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    // Any change to the reply moves its version on, whoever made it.
    if (keys.includes('draft')) sets.push('draft_version = draft_version + 1');
    await this.q(`UPDATE cases SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => (fields[k] !== null && typeof fields[k] === 'object' && !(fields[k] instanceof Date)) ? JSON.stringify(fields[k]) : fields[k])]);
  }
  // One approval, however many presses: the case is claimed before the
  // mailbox is touched, and only one request can win the claim. A retry is
  // allowed only when a person says they have checked the mailbox and the
  // last attempt is uncertain, or was claimed and never answered.
  // version: the reply's version as the approver read it; a reply changed
  // since then is not the one they approved, so the claim fails.
  async claimApproval(id, userId, { retry = false, version } = {}) {
    const r = await this.q(
      `UPDATE cases SET approved_at = now(), approved_by = $2, mailbox_state = 'saving', mailbox_state_at = now(), sent_at = NULL, sent_by = NULL, updated_at = now()
       WHERE id = $1 AND ($4::int IS NULL OR draft_version = $4)
         AND (approved_at IS NULL OR ($3 AND (mailbox_state = 'uncertain' OR (mailbox_state = 'saving' AND mailbox_state_at < now() - interval '2 minutes'))))
       RETURNING *`, [id, userId, Boolean(retry), Number.isInteger(version) ? version : null]);
    return r.rows[0] || null;
  }
  // One pass-up, one cancellation, one booking, however many presses.
  async claimPassUp(id, userId, reason, status, ownerId) {
    const r = await this.q('UPDATE cases SET passed_up_at = now(), passed_up_by = $2, passed_up_reason = $3, status = $4, owner_id = $5, updated_at = now() WHERE id = $1 AND passed_up_at IS NULL RETURNING id', [id, userId, reason, status, ownerId]);
    return Boolean(r.rows[0]);
  }
  async claimDispatchRef(id, ref) {
    const r = await this.q("UPDATE cases SET dispatch_ref = '', updated_at = now() WHERE id = $1 AND dispatch_ref = $2 RETURNING id", [id, ref]);
    return Boolean(r.rows[0]);
  }
  async restoreDispatchRef(id, ref) {
    await this.q("UPDATE cases SET dispatch_ref = $2, updated_at = now() WHERE id = $1 AND dispatch_ref = ''", [id, ref]);
  }
  async claimBooking(id) {
    const r = await this.q("UPDATE cases SET booking_claim_at = now() WHERE id = $1 AND dispatch_ref = '' AND (booking_claim_at IS NULL OR booking_claim_at < now() - interval '2 minutes') RETURNING id", [id]);
    return Boolean(r.rows[0]);
  }
  async releaseBooking(id) { await this.q('UPDATE cases SET booking_claim_at = NULL WHERE id = $1', [id]); }
  // A change to a booking being made from this email right now.
  async claimWork(id) {
    const r = await this.q("UPDATE cases SET booking_claim_at = now() WHERE id = $1 AND (booking_claim_at IS NULL OR booking_claim_at < now() - interval '2 minutes') RETURNING id", [id]);
    return Boolean(r.rows[0]);
  }
  // A booking being cancelled: only one request takes it from booked.
  async claimDispatchCancel(ref) {
    const r = await this.q("UPDATE dispatch_bookings SET status = 'cancelled' WHERE ref = $1 AND status = 'booked' RETURNING ref", [ref]);
    return Boolean(r.rows[0]);
  }
  async restoreDispatchCancel(ref) { await this.q("UPDATE dispatch_bookings SET status = 'booked' WHERE ref = $1 AND status = 'cancelled'", [ref]); }
  async releaseApproval(id) {
    await this.q("UPDATE cases SET approved_at = NULL, approved_by = NULL, mailbox_state = '', mailbox_state_at = NULL, updated_at = now() WHERE id = $1", [id]);
  }
  async claimHolding(id) {
    const r = await this.q('UPDATE cases SET holding_sent_at = now(), updated_at = now() WHERE id = $1 AND holding_sent_at IS NULL RETURNING id', [id]);
    return Boolean(r.rows[0]);
  }
  async markSent(id, userId) {
    const r = await this.q("UPDATE cases SET sent_at = now(), sent_by = $2, sent_state = 'sent', status = 'waiting', updated_at = now() WHERE id = $1 AND approved_at IS NOT NULL AND sent_at IS NULL RETURNING *", [id, userId]);
    return r.rows[0] || null;
  }
  // An edit takes the reply back to unapproved only when the text really
  // changed, so a form sent twice cannot clear an approval in flight.
  // expected: the reply's version on the page the edit came from. Returns
  // 'saved', 'same' (nothing changed) or 'stale' (someone changed the reply
  // after that page was opened, so this edit was not saved).
  async setDraftIfChanged(id, draft, expected) {
    const r = await this.q(
      `UPDATE cases SET draft = $2, draft_version = draft_version + 1, approved_at = NULL, approved_by = NULL, mailbox_state = '', mailbox_state_at = NULL, sent_at = NULL, sent_by = NULL, sent_state = '', updated_at = now()
       WHERE id = $1 AND draft IS DISTINCT FROM $2 AND ($3::int IS NULL OR draft_version = $3) RETURNING id`, [id, draft, Number.isInteger(expected) ? expected : null]);
    if (r.rows[0]) return 'saved';
    const now = await this.q('SELECT draft FROM cases WHERE id = $1', [id]);
    return now.rows[0] && now.rows[0].draft === draft ? 'same' : 'stale';
  }
  async claimComposition(id, byName) {
    const r = await this.q("UPDATE compositions SET approved_at = now(), approved_by_name = $2, updated_at = now() WHERE id = $1 AND status = 'draft' AND approved_at IS NULL RETURNING *", [id, byName]);
    return r.rows[0] || null;
  }
  async releaseHolding(id) { await this.q('UPDATE cases SET holding_sent_at = NULL WHERE id = $1', [id]); }
  // Approved replies saved in the mailbox whose fate is not yet known,
  // least recently checked first.
  async casesAwaitingSend(limit = 25) {
    return (await this.q(`SELECT * FROM cases WHERE saved_draft_id IS NOT NULL AND saved_draft_id <> '' AND approved_at IS NOT NULL
      AND sent_state IN ('', 'unsent') AND sent_at IS NULL AND approved_at > now() - interval '14 days' ORDER BY sent_checked_at NULLS FIRST LIMIT $1`, [limit])).rows;
  }
  async overdueCandidates(hours) {
    const r = await this.q(
      `SELECT * FROM cases WHERE status IN ('new', 'in_progress') AND approved_at IS NULL AND escalated_at IS NULL
         AND kind <> 'other' AND received_at < now() - ($1 || ' hours')::interval ORDER BY received_at`, [String(hours)]);
    return r.rows;
  }
  async markEscalated(ids) {
    if (!ids.length) return;
    await this.q('UPDATE cases SET escalated_at = now(), updated_at = now() WHERE id = ANY($1::int[]) AND escalated_at IS NULL', [ids]);
  }
  async markEscalationNotified(ids) {
    if (!ids.length) return;
    await this.q('UPDATE cases SET escalation_notified_at = now() WHERE id = ANY($1::int[])', [ids]);
  }
  // Complaints that have sat past the nudge time with no approved reply and
  // have not yet been passed up to a manager.
  async complaintNudgeCandidates(hours) {
    const r = await this.q(
      `SELECT * FROM cases WHERE kind = 'complaints' AND status <> 'done' AND approved_at IS NULL AND passed_up_at IS NULL
         AND received_at < now() - ($1 || ' hours')::interval ORDER BY received_at`, [String(hours)]);
    return r.rows;
  }
  async markPassedUpNotified(ids) {
    if (!ids.length) return;
    await this.q('UPDATE cases SET passed_up_notified_at = now() WHERE id = ANY($1::int[])', [ids]);
  }

  // ---- dispatch (the stand-in) ----
  async nextDispatchRef(prefix, skip = 0) {
    const r = await this.q('SELECT count(*)::int AS n FROM dispatch_bookings');
    return `${prefix}-${String(10001 + r.rows[0].n + skip).padStart(5, '0')}`;
  }
  async insertDispatchBooking({ ref, caseId, brand, job, actor, externalId = '', dispatchStatus = '' }) {
    const r = await this.q('INSERT INTO dispatch_bookings (ref, case_id, brand, job, booked_by, booked_by_name, external_id, dispatch_status, status_checked_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING *',
      [ref, caseId, brand || '', JSON.stringify(job), actor ? actor.id : null, actor ? (actor.display_name || actor.username) : '', externalId, dispatchStatus]);
    return r.rows[0];
  }
  async dispatchBookingByRef(ref) {
    return (await this.q('SELECT * FROM dispatch_bookings WHERE ref = $1', [String(ref || '').slice(0, 60)])).rows[0] || null;
  }
  async updateDispatchJob(ref, job) {
    return (await this.q('UPDATE dispatch_bookings SET job = $2, status_checked_at = now() WHERE ref = $1 RETURNING *', [ref, JSON.stringify(job)])).rows[0] || null;
  }
  async dispatchBookingsForCase(caseId) {
    return (await this.q('SELECT * FROM dispatch_bookings WHERE case_id = $1 ORDER BY created_at', [caseId])).rows;
  }
  async setDispatchStatus(ref, { status, dispatchStatus, detail = null }) {
    const r = await this.q(`UPDATE dispatch_bookings SET status = COALESCE($2, status), dispatch_status = COALESCE($3, dispatch_status), status_detail = COALESCE($4, status_detail), status_checked_at = now()
      WHERE ref = $1 RETURNING *`, [ref, status || null, dispatchStatus || null, detail]);
    return r.rows[0] || null;
  }
  // Live bookings whose status is still moving: from yesterday onwards,
  // not finished, oldest check first.
  async liveDispatchBookings(limit = 30) {
    return (await this.q(`SELECT * FROM dispatch_bookings WHERE external_id <> '' AND status = 'booked'
      AND dispatch_status NOT IN ('NOSHOW', 'COMPLETE', 'COMPLETED', 'CUSTOMER_CANCELLED', 'DRIVER_CANCELLED', 'DISPATCH_CANCELLED')
      AND (job->>'date') >= to_char((now() AT TIME ZONE 'Europe/London') - interval '1 day', 'YYYY-MM-DD')
      ORDER BY status_checked_at NULLS FIRST LIMIT $1`, [limit])).rows;
  }
  async dispatchBookings({ brand, limit = 100 } = {}) {
    const params = brand ? [brand, limit] : [limit];
    return (await this.q(`SELECT * FROM dispatch_bookings${brand ? ' WHERE brand = $1' : ''} ORDER BY created_at DESC LIMIT $${params.length}`, params)).rows;
  }

  // ---- visits (who has been in, and what they did) ----
  // Close a user's visit that has been quiet for 20 minutes, then add this
  // line to the open one, opening a new one if there is none. The partial
  // unique index makes the add atomic, so racing requests share one visit.
  // Returns any visits it closed, so the caller can log them.
  async touchVisit(user, line, { fresh = false } = {}) {
    if (!user) return [];
    const closed = await this.closeVisits({ userId: user.id, idleOnly: !fresh, how: fresh ? 'signed in again' : 'idle' });
    const entry = JSON.stringify([{ at: new Date().toISOString(), what: String(line).slice(0, 200) }]);
    await this.q(`INSERT INTO visits (user_id, user_name, pages) VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (user_id) WHERE ended_at IS NULL DO UPDATE SET last_at = now(),
        pages = CASE WHEN jsonb_array_length(visits.pages) >= 300 THEN visits.pages ELSE visits.pages || EXCLUDED.pages END`,
    [user.id, user.username, entry]);
    return closed;
  }
  // Close visits: one user's (all open, or only idle ones), or every idle
  // visit in the office. Returns the closed rows.
  async closeVisits({ userId, idleOnly = true, how = 'idle' } = {}) {
    const where = ['ended_at IS NULL']; const params = [how];
    if (userId) { params.push(userId); where.push(`user_id = $${params.length}`); }
    if (idleOnly) where.push("last_at < now() - interval '20 minutes'");
    return (await this.q(`UPDATE visits SET ended_at = last_at, ended_how = $1 WHERE ${where.join(' AND ')} RETURNING *`, params)).rows;
  }
  async endVisit(user, line) {
    if (!user) return [];
    const closed = await this.touchVisit(user, line);
    const ended = (await this.q("UPDATE visits SET ended_at = now(), ended_how = 'signed out' WHERE user_id = $1 AND ended_at IS NULL RETURNING *", [user.id])).rows;
    return [...closed, ...ended];
  }
  // Every visit, or, for a manager set to one company, only the visits of
  // the people set to that company.
  async recentVisits(limit = 40, brand) {
    if (!brand) return (await this.q('SELECT * FROM visits ORDER BY started_at DESC LIMIT $1', [limit])).rows;
    return (await this.q("SELECT v.* FROM visits v JOIN users u ON u.id = v.user_id WHERE u.brand = $2 AND u.role <> 'owner' ORDER BY v.started_at DESC LIMIT $1", [limit, brand])).rows;
  }
  async pruneVisits() { return (await this.q("DELETE FROM visits WHERE started_at < now() - interval '90 days'")).rowCount; }

  // ---- compositions (the Write worker) ----
  async insertComposition(c) {
    const r = await this.q(`INSERT INTO compositions (brand, kind, relationship, to_name, to_address, prompt, quoted, subject, body, held_back, source, created_by, created_by_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [c.brand || '', c.kind, c.relationship, c.to_name || '', c.to_address || '', c.prompt || '', c.quoted || '', c.subject || '', c.body || '', c.held_back || '', c.source || 'none', c.actor ? c.actor.id : null, c.actor ? (c.actor.display_name || c.actor.username) : '']);
    return r.rows[0];
  }
  async compositionById(id) { return (await this.q('SELECT * FROM compositions WHERE id = $1', [id])).rows[0] || null; }
  async updateComposition(id, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    await this.q(`UPDATE compositions SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => (fields[k] !== null && typeof fields[k] === 'object' && !(fields[k] instanceof Date)) ? JSON.stringify(fields[k]) : fields[k])]);
  }
  // Drafts a person may see: their own, or, for a manager or the owner,
  // everyone's in the companies they see.
  // council: true lists only the drafts written to the council, false
  // leaves them out (they live on the Council page, for managers and owners).
  async compositions({ userId, brand, council, limit = 50 } = {}) {
    const where = ["status <> 'discarded'"]; const params = [];
    if (council === true) where.push("kind LIKE 'council_%'");
    if (council === false) where.push("kind NOT LIKE 'council_%'");
    if (userId) { params.push(userId); where.push(`created_by = $${params.length}`); }
    if (brand) { params.push(brand); where.push(`brand = $${params.length}`); }
    params.push(limit);
    return (await this.q(`SELECT * FROM compositions WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT $${params.length}`, params)).rows;
  }

  // ---- fixed prices ----
  async fixedPrices(brand) {
    const params = brand ? [brand] : [];
    return (await this.q(`SELECT * FROM fixed_prices${brand ? ' WHERE brand = $1' : ''} ORDER BY from_place, to_place, vehicle`, params)).rows;
  }
  async addFixedPrice({ brand = '', fromPlace, toPlace, vehicle, pricePence, notes = '', actor }) {
    const f = String(fromPlace || '').trim().slice(0, 120); const t = String(toPlace || '').trim().slice(0, 120);
    if (!f || !t) throw new Error('A fixed price needs a from and a to.');
    if (!Number.isInteger(pricePence) || pricePence < 0 || pricePence > 100000000) throw new Error('The price is pounds and pence, for example 45 or 45.50.');
    const r = await this.q('INSERT INTO fixed_prices (brand, from_place, to_place, vehicle, price_pence, notes, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [String(brand || '').slice(0, 40), f, t, String(vehicle || 'Car (up to 4)').trim().slice(0, 60) || 'Car (up to 4)', pricePence, String(notes || '').trim().slice(0, 200), actor ? (actor.display_name || actor.username) : '']);
    return r.rows[0];
  }
  async deleteFixedPrice(id) { await this.q('DELETE FROM fixed_prices WHERE id = $1', [id]); }

  // ---- reports (managers and the owner) ----
  // What came in over the last N days and what happened to it, inside a
  // scope. Times are hours from an email arriving to its reply being
  // approved. Pure counting: nothing here judges anyone.
  async report(scope, days) {
    const d = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const params = [String(d)];
    const w = ["c.received_at >= now() - ($1 || ' days')::interval", ...scopeWhere(scope, params, 'c.')];
    const where = w.join(' AND ');
    const one = async (sql) => (await this.q(sql, params)).rows;
    const [totals, byKind, byCompany, complaints, byPerson, byChannel] = await Promise.all([
      one(`SELECT count(*)::int AS emails,
          count(*) FILTER (WHERE c.approved_at IS NOT NULL)::int AS approved,
          count(*) FILTER (WHERE c.dispatch_ref <> '' OR c.booked_at IS NOT NULL)::int AS into_dispatch,
          count(*) FILTER (WHERE c.status <> 'done' AND c.kind <> 'other')::int AS open_now,
          count(*) FILTER (WHERE c.escalated_at IS NOT NULL)::int AS went_overdue,
          count(*) FILTER (WHERE c.passed_up_at IS NOT NULL)::int AS passed_up,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (c.approved_at - c.received_at)) / 3600) FILTER (WHERE c.approved_at IS NOT NULL) AS median_hours,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM (c.approved_at - c.received_at)) / 3600) FILTER (WHERE c.approved_at IS NOT NULL) AS p90_hours
        FROM cases c WHERE ${where}`),
      one(`SELECT c.kind, count(*)::int AS n, count(*) FILTER (WHERE c.approved_at IS NOT NULL)::int AS approved FROM cases c WHERE ${where} GROUP BY c.kind ORDER BY n DESC`),
      one(`SELECT c.brand, count(*)::int AS n, count(*) FILTER (WHERE c.kind = 'complaints')::int AS complaints, count(*) FILTER (WHERE c.status <> 'done' AND c.kind <> 'other')::int AS open_now FROM cases c WHERE ${where} GROUP BY c.brand ORDER BY n DESC`),
      one(`SELECT c.seriousness, count(*)::int AS n, count(*) FILTER (WHERE c.complaint->>'firm_at_fault' IN ('yes', 'partly'))::int AS at_fault FROM cases c WHERE ${where} AND c.kind = 'complaints' GROUP BY c.seriousness`),
      one(`SELECT u.id, coalesce(nullif(u.display_name, ''), u.username) AS name, count(*)::int AS approved FROM cases c JOIN users u ON u.id = c.approved_by WHERE ${where} GROUP BY u.id, name ORDER BY approved DESC, name`),
      one(`SELECT c.channel, count(*)::int AS n FROM cases c WHERE ${where} AND c.kind = 'complaints' GROUP BY c.channel ORDER BY n DESC`)
    ]);
    return { days: d, totals: totals[0], byKind, byCompany, complaints, byPerson, byChannel };
  }
  // The cases behind a report, for a spreadsheet.
  async casesForExport(scope, days) {
    const d = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
    const params = [String(d)];
    const w = ["c.received_at >= now() - ($1 || ' days')::interval", ...scopeWhere(scope, params, 'c.')];
    return (await this.q(`SELECT c.id, c.brand, c.received_at, c.channel, c.from_address, c.subject, c.kind, c.status, c.seriousness, c.dispatch_ref,
        c.approved_at, c.passed_up_at, c.escalated_at, coalesce(nullif(o.display_name, ''), o.username, '') AS owner_name, coalesce(nullif(a.display_name, ''), a.username, '') AS approved_by_name
      FROM cases c LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users a ON a.id = c.approved_by
      WHERE ${w.join(' AND ')} ORDER BY c.received_at DESC LIMIT 5000`, params)).rows;
  }

  // ---- standard replies ----
  // For a case or a draft: its company's replies plus the ones for every
  // company. For the Settings list: one company's, or every one.
  async standardRepliesFor(brand) {
    return (await this.q("SELECT * FROM standard_replies WHERE brand = $1 OR brand = '' ORDER BY title", [String(brand || '')])).rows;
  }
  async standardReplies(brand) {
    const params = brand ? [brand] : [];
    return (await this.q(`SELECT * FROM standard_replies${brand ? ' WHERE brand = $1' : ''} ORDER BY brand, title`, params)).rows;
  }
  async standardReplyById(id) { return (await this.q('SELECT * FROM standard_replies WHERE id = $1', [id])).rows[0] || null; }
  async addStandardReply({ brand = '', title, body, actor }) {
    const t = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const b = String(body || '').replace(/\r\n/g, '\n').trim().slice(0, 4000);
    if (!t) throw Object.assign(new Error('Give the standard reply a short name, such as "Lost property".'), { code: 'REFUSED' });
    if (b.length < 10) throw Object.assign(new Error('Write the reply itself.'), { code: 'REFUSED' });
    return (await this.q('INSERT INTO standard_replies (brand, title, body, updated_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [String(brand || '').slice(0, 40), t, b, actor ? (actor.display_name || actor.username) : ''])).rows[0];
  }
  async deleteStandardReply(id) { await this.q('DELETE FROM standard_replies WHERE id = $1', [id]); }

  // ---- tariff (the fare calculator) ----
  // One per company, kept as JSON in settings, so a new company has none
  // until a manager types it in. lib/fares.js checks and uses it.
  async tariff(brand) {
    const raw = await this.setting(`tariff:${String(brand || '')}`);
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  async setTariff(brand, tariff) { await this.setSetting(`tariff:${String(brand || '')}`, JSON.stringify(tariff)); }

  // ---- events ----
  async addEvent(caseId, { actor, kind, detail = '' }) {
    await this.q('INSERT INTO case_events (case_id, actor_id, actor_name, kind, detail) VALUES ($1, $2, $3, $4, $5)', [caseId, actor ? actor.id : null, actor ? (actor.display_name || actor.username) : 'the office', kind, String(detail).slice(0, 2000)]);
  }
  async eventsFor(caseId) { return (await this.q('SELECT * FROM case_events WHERE case_id = $1 ORDER BY at', [caseId])).rows; }
  // The latest happenings. With a scope, only events on cases inside it
  // (an operator never sees another company's or the council's subjects);
  // office-wide events with no case are for managers and owners.
  async recentEvents(limit = 100, scope) {
    if (scope === undefined) return (await this.q('SELECT e.*, c.subject FROM case_events e LEFT JOIN cases c ON c.id = e.case_id ORDER BY e.at DESC LIMIT $1', [limit])).rows;
    const params = [];
    const w = scopeWhere(scope, params, 'c.');
    const sc = scopeOf(scope);
    const wide = sc.brand || sc.hideCouncil ? 'c.id IS NOT NULL' : 'TRUE';
    params.push(limit);
    return (await this.q(`SELECT e.*, c.subject FROM case_events e LEFT JOIN cases c ON c.id = e.case_id
      WHERE ${[wide, ...w].join(' AND ')} ORDER BY e.at DESC LIMIT $${params.length}`, params)).rows;
  }
}

module.exports = { Store, ROLES, STATUSES, KINDS, DEFAULT_SETTINGS };
