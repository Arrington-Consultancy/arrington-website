'use strict';

// What the office does with an email once it is a case: reads it (AI, or
// the prepared answer when the AI is off), routes it to a worker, drafts
// the complaint reply, takes staff guidance, and approves a reply by saving
// it as a draft in the firm's mailbox. Nothing here sends to a customer.
//
// Who may do what (the three levels in the proposal):
//   operator  reads, edits drafts, guides the AI, changes status, takes a
//             case, approves ordinary replies (bookings and customer emails)
//   manager   all of that, approves complaints, reassigns to anyone, sees
//             the activity log
//   owner     all of that, manages users and settings

const ai = require('./ai');
const { seedInbox, todayLondon } = require('./demoInbox');
const { workerForIntent } = require('../../lib/taxiOffice/workers');

// Which worker an email belongs to, from its reading. The Tidewell office's
// routing plus the intents this office reads that Tidewell's does not.
function kindFor(intent) {
  switch (intent) {
    case 'lost_property':
    case 'account':
      return 'customer';
    case 'other':
      return 'other';
    default: {
      const w = workerForIntent(intent);
      return ['bookings', 'customer', 'complaints', 'licensing'].includes(w) ? w : 'other';
    }
  }
}

const LEVEL = { operator: 1, manager: 2, owner: 3 };
function atLeast(user, role) { return Boolean(user) && (LEVEL[user.role] || 0) >= LEVEL[role]; }
function canApprove(user, kase) {
  if (!user) return false;
  if (kase.kind === 'complaints') return atLeast(user, 'manager');
  return atLeast(user, 'operator');
}
function canReassign(user, kase) {
  if (!user) return false;
  if (atLeast(user, 'manager')) return true;
  return !kase.owner_id || kase.owner_id === user.id;
}

function preparedFor(kase) {
  const demo = seedInbox(todayLondon()).find((e) => (e.messageId || e.id) === kase.message_id);
  return demo ? { reading: demo.prepared, complaint: demo.preparedComplaint || null } : null;
}

class Office {
  constructor({ store, mailbox, firm, aiOn = ai.aiEnabled, now = () => new Date() }) {
    this.store = store;
    this.mailbox = mailbox;
    this.firm = firm;
    this.aiOn = aiOn;
    this.now = now;
    this.reading = new Set();
  }

  today() { return todayLondon(this.now()); }

  // Pull the mailbox and make a case for every email not yet seen. Returns
  // the new cases. Reading them is a separate step so a slow model never
  // blocks the inbox arriving.
  async sync() {
    const emails = await this.mailbox.listInbox({ max: 50, days: 14, today: this.today() });
    const created = [];
    for (const e of emails) {
      const row = await this.store.insertCase(e);
      if (row) {
        created.push(row);
        await this.store.addEvent(row.id, { kind: 'arrived', detail: `Arrived from ${this.mailbox.label}` });
      }
    }
    return created;
  }

  emailOf(kase) {
    return { id: kase.mailbox_email_id, from: kase.from_address, subject: kase.subject, body: kase.body, receivedAt: londonStamp(kase.received_at), threadId: kase.thread_id, messageId: kase.message_id };
  }

  // Read one case: the AI when it is on, otherwise the prepared answer for
  // a made-up email, otherwise left unread with a note saying so.
  async read(kase, { actor = null, force = false } = {}) {
    if (kase.reading && !force) return kase;
    if (this.reading.has(kase.id)) return kase;
    this.reading.add(kase.id);
    try {
      let reading = null; let source = 'none'; let note = '';
      let complaint = null;
      if (this.aiOn()) {
        try {
          reading = await ai.readEmail(this.emailOf(kase), this.today(), this.firm);
          source = 'ai';
          if (reading.intent === 'complaint') complaint = await ai.draftComplaint({ email: this.emailOf(kase), notes: [] }, this.today(), this.firm);
        } catch (e) {
          note = `The AI could not read this email (${e.code || e.status || 'error'}). `;
        }
      }
      if (!reading) {
        const p = preparedFor(kase);
        if (p) { reading = p.reading; complaint = p.complaint; source = 'prepared'; note += 'This is the answer prepared for the made-up inbox, not the AI\'s reading.'; }
        else { note += this.aiOn() ? 'Read it yourself and write the reply below.' : 'The AI is switched off on this server, so read it yourself and write the reply below.'; }
      }
      const fields = { reading_source: source, reading_note: note.trim() };
      if (reading) {
        fields.reading = reading;
        fields.kind = kindFor(reading.intent);
        fields.seriousness = reading.intent === 'complaint' ? (complaint ? complaint.seriousness : reading.seriousness) : 'none';
        fields.draft = complaint ? complaint.reply : reading.reply;
        fields.complaint = complaint;
        if (kase.status === 'new' && fields.kind === 'other') fields.status = 'done';
      }
      await this.store.updateCase(kase.id, fields);
      await this.store.addEvent(kase.id, { actor, kind: 'read', detail: reading ? `Read by ${source === 'ai' ? 'the AI' : 'the prepared answer'}: ${reading.summary}` : `Not read: ${note.trim()}` });
      return this.store.caseById(kase.id);
    } finally {
      this.reading.delete(kase.id);
    }
  }

  async readAllUnread(limit = 20) {
    const rows = await this.store.listCases({ kind: 'unread', limit });
    for (const r of rows) await this.read(r);
    return rows.length;
  }

  async take(kase, user) {
    await this.store.updateCase(kase.id, { owner_id: user.id, status: kase.status === 'new' ? 'in_progress' : kase.status });
    await this.store.addEvent(kase.id, { actor: user, kind: 'taken', detail: `${user.display_name || user.username} took the case` });
  }

  async assign(kase, user, toUser) {
    if (!canReassign(user, kase)) throw refuse('Only a manager can reassign a case someone else holds.');
    await this.store.updateCase(kase.id, { owner_id: toUser ? toUser.id : null, status: kase.status === 'new' && toUser ? 'in_progress' : kase.status });
    await this.store.addEvent(kase.id, { actor: user, kind: 'assigned', detail: toUser ? `Assigned to ${toUser.display_name || toUser.username}` : 'Left unassigned' });
  }

  async setStatus(kase, user, status) {
    if (!['new', 'in_progress', 'waiting', 'done'].includes(status)) throw refuse('Not a status.');
    await this.store.updateCase(kase.id, { status });
    await this.store.addEvent(kase.id, { actor: user, kind: 'status', detail: `Marked ${label(status)}` });
  }

  async saveDraft(kase, user, text) {
    const draft = String(text || '').replace(/\r\n/g, '\n').slice(0, 4000);
    await this.store.updateCase(kase.id, { draft, approved_at: null, approved_by: null });
    await this.store.addEvent(kase.id, { actor: user, kind: 'draft_edited', detail: 'Draft edited by hand' });
  }

  async note(kase, user, text) {
    const t = String(text || '').trim().slice(0, 2000);
    if (!t) return;
    await this.store.addEvent(kase.id, { actor: user, kind: 'note', detail: t });
  }

  // Staff guide the AI: their note is kept, earliest first, and the draft
  // is rewritten to all of them. With the AI off, the note is recorded and
  // the person edits the draft by hand.
  async guide(kase, user, text) {
    const t = String(text || '').trim().slice(0, 1200);
    if (!t) throw refuse('Say what the reply should do.');
    const notes = [...(kase.guidance || []), t].slice(-6);
    if (!this.aiOn()) {
      await this.store.updateCase(kase.id, { guidance: notes });
      await this.store.addEvent(kase.id, { actor: user, kind: 'guided', detail: `${t} (the AI is off, so the draft was not rewritten)` });
      return { rewritten: false };
    }
    const out = await ai.redraft({ email: this.emailOf(kase), draft: kase.draft, notes }, this.today(), this.firm);
    await this.store.updateCase(kase.id, { guidance: notes, draft: out.reply, held_back: out.held_back, approved_at: null, approved_by: null });
    await this.store.addEvent(kase.id, { actor: user, kind: 'guided', detail: t + (out.held_back ? ` (held back: ${out.held_back})` : '') });
    return { rewritten: true, heldBack: out.held_back };
  }

  // Approve the reply: saved as a draft in the firm's mailbox for a person
  // to send. Nothing goes to the customer from here.
  async approve(kase, user) {
    if (!canApprove(user, kase)) throw refuse(kase.kind === 'complaints' ? 'A complaint reply needs a manager to approve it.' : 'You cannot approve this.');
    if (!String(kase.draft || '').trim()) throw refuse('There is no reply to approve.');
    const { draftId } = await this.mailbox.saveReplyDraft(this.emailOf(kase), kase.draft);
    await this.store.updateCase(kase.id, { approved_at: this.now(), approved_by: user.id, saved_draft_id: draftId || null, status: 'waiting', owner_id: kase.owner_id || user.id });
    await this.store.addEvent(kase.id, { actor: user, kind: 'approved', detail: this.mailbox.demo ? 'Reply approved. This is the made-up inbox, so the draft was saved nowhere.' : `Reply approved and saved as a draft in ${this.mailbox.label} for someone to send${draftId ? ` (draft ${draftId})` : ''}.` });
    return { draftId: draftId || null };
  }

  // The escalation sweep: a reply that has waited past the set time with
  // nobody approving it goes red on Today, and a manager is emailed once.
  async sweep(alerts, baseUrl) {
    const hours = await this.store.escalationHours();
    const due = await this.store.overdueCandidates(hours);
    if (!due.length) return { escalated: 0, emailed: false };
    await this.store.markEscalated(due.map((c) => c.id));
    for (const c of due) await this.store.addEvent(c.id, { kind: 'escalated', detail: `Waiting more than ${hours} hours with no approved reply` });
    let emailed = false;
    if (alerts) {
      try {
        const r = await alerts.sendEscalation({ cases: due, hours, baseUrl, firmName: this.firm.name });
        emailed = r.sent;
        if (r.sent) await this.store.markEscalationNotified(due.map((c) => c.id));
      } catch (e) {
        console.error('Abacus office: escalation email failed', e.message);
      }
    }
    return { escalated: due.length, emailed };
  }
}

function refuse(message) { const e = new Error(message); e.code = 'REFUSED'; return e; }

function label(status) {
  return { new: 'new', in_progress: 'in progress', waiting: 'waiting on the customer', done: 'done' }[status] || status;
}

function londonStamp(d) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(d));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

module.exports = { Office, kindFor, canApprove, canReassign, atLeast, label, londonStamp, LEVEL };
