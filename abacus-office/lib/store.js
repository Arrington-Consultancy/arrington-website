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
    if (brand !== undefined && brand !== null && brand !== '') add('c.brand = ?', brand);
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
  async counts(brand) {
    const params = brand ? [brand] : [];
    const r = await this.q(`SELECT
      count(*) FILTER (WHERE status = 'new')::int AS new_count,
      count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
      count(*) FILTER (WHERE status = 'waiting')::int AS waiting,
      count(*) FILTER (WHERE status = 'done')::int AS done,
      count(*) FILTER (WHERE kind = 'complaints' AND status <> 'done')::int AS complaints_open,
      count(*) FILTER (WHERE kind = 'complaints' AND status <> 'done' AND seriousness = 'safety')::int AS safety_open,
      count(*) FILTER (WHERE escalated_at IS NOT NULL AND approved_at IS NULL AND status IN ('new', 'in_progress'))::int AS overdue,
      count(*) FILTER (WHERE kind = 'complaints' AND status <> 'done' AND passed_up_at IS NOT NULL AND approved_at IS NULL)::int AS passed_up,
      count(*) FILTER (WHERE kind = 'unread')::int AS unread
      FROM cases${brand ? ' WHERE brand = $1' : ''}`, params);
    return r.rows[0];
  }
  // One value that changes whenever anything a list page shows has changed,
  // so a page can ask "anything new?" cheaply and reload only then.
  async liveStamp(brand) {
    const params = brand ? [brand] : [];
    const r = await this.q(`SELECT count(*)::int AS n, coalesce(max(c.updated_at), 'epoch')::text AS latest,
        coalesce((SELECT max(e.at) FROM case_events e JOIN cases k ON k.id = e.case_id${brand ? ' WHERE k.brand = $1' : ''}), 'epoch')::text AS latest_event
      FROM cases c${brand ? ' WHERE c.brand = $1' : ''}`, params);
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
  async insertDispatchBooking({ ref, caseId, brand, job, actor }) {
    const r = await this.q('INSERT INTO dispatch_bookings (ref, case_id, brand, job, booked_by, booked_by_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [ref, caseId, brand || '', JSON.stringify(job), actor ? actor.id : null, actor ? (actor.display_name || actor.username) : '']);
    return r.rows[0];
  }
  async dispatchBookings({ brand, limit = 100 } = {}) {
    const params = brand ? [brand, limit] : [limit];
    return (await this.q(`SELECT * FROM dispatch_bookings${brand ? ' WHERE brand = $1' : ''} ORDER BY created_at DESC LIMIT $${params.length}`, params)).rows;
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
  async recentEvents(limit = 100) {
    return (await this.q('SELECT e.*, c.subject FROM case_events e LEFT JOIN cases c ON c.id = e.case_id ORDER BY e.at DESC LIMIT $1', [limit])).rows;
  }
}

module.exports = { Store, ROLES, STATUSES, KINDS, DEFAULT_SETTINGS };
