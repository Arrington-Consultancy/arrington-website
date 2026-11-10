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
  async listCases({ status, kind, ownerId, open, escalated, passedUp, brand, limit = 200 } = {}) {
    const where = [];
    const params = [];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    // brand: undefined means every brand (the office view); a string means
    // that brand only, which is what a brand's own staff get.
    where.push(...scopeWhere(brand, params, 'c.'));
    if (status) add('c.status = ?', status);
    if (passedUp) where.push('c.passed_up_at IS NOT NULL AND c.approved_at IS NULL AND c.status <> \'done\'');
    if (kind) add('c.kind = ?', kind);
    if (ownerId) add('c.owner_id = ?', ownerId);
    if (open) where.push("c.status IN ('new', 'in_progress', 'waiting')");
    if (escalated) where.push('c.escalated_at IS NOT NULL AND c.approved_at IS NULL AND c.status IN (\'new\', \'in_progress\')');
    params.push(limit);
    const r = await this.q(
      `SELECT c.*, u.display_name AS owner_display, u.username AS owner_username FROM cases c LEFT JOIN users u ON u.id = c.owner_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.received_at DESC LIMIT $${params.length}`, params);
    return r.rows;
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
      count(*) FILTER (WHERE kind = 'unread')::int AS unread
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
    await this.q(`UPDATE cases SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => (fields[k] !== null && typeof fields[k] === 'object' && !(fields[k] instanceof Date)) ? JSON.stringify(fields[k]) : fields[k])]);
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
  async nextDispatchRef(prefix) {
    const r = await this.q('SELECT count(*)::int AS n FROM dispatch_bookings');
    return `${prefix}-${String(10001 + r.rows[0].n).padStart(5, '0')}`;
  }
  async insertDispatchBooking({ ref, caseId, brand, job, actor, externalId = '', dispatchStatus = '' }) {
    const r = await this.q('INSERT INTO dispatch_bookings (ref, case_id, brand, job, booked_by, booked_by_name, external_id, dispatch_status, status_checked_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING *',
      [ref, caseId, brand || '', JSON.stringify(job), actor ? actor.id : null, actor ? (actor.display_name || actor.username) : '', externalId, dispatchStatus]);
    return r.rows[0];
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
  async recentVisits(limit = 40) { return (await this.q('SELECT * FROM visits ORDER BY started_at DESC LIMIT $1', [limit])).rows; }
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
