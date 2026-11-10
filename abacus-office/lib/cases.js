'use strict';

// What the office does with an email once it is a case: reads it (AI, or
// the prepared answer when the AI is off), routes it to a worker, drafts
// the complaint reply, takes staff guidance, and approves a reply by saving
// it as a draft in the firm's mailbox. Nothing here sends to a customer.
//
// Who may do what (the three levels in the proposal):
//   operator  reads, edits drafts, guides the AI, changes status, takes a
//             case, approves replies, complaints included (Tom's email to
//             Dan, 9 November 2026), passes a complaint up to a manager and
//             sends the holding reply, books a job into dispatch after
//             signing it off
//   manager   all of that, approves a complaint that was passed up or is a
//             safety matter, reassigns to anyone, sees the activity log
//   owner     all of that, manages users, brands, prices and settings
//
// Visibility by brand: a case carries the brand of the mailbox it came in
// on; a user with a brand sees only that brand's cases, a user with none
// (the owner's own office) sees every brand.

const ai = require('./ai');
const { cleanJob } = require('./dispatch');
const { brandName } = require('./firm');
const { seedInbox, todayLondon } = require('./demoInbox');
const { workerForIntent } = require('../../lib/taxiOffice/workers');
const { CHANNELS, isChannel, isLogged } = require('./channels');
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

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
// Who approves. An operator approves any reply, a complaint included,
// unless it has been passed up to a manager or is a safety matter: those
// need a manager (the AI's recommendation only suggests passing up; the
// operator decides, and a safety matter is never theirs to close).
function needsManager(kase) {
  return kase.kind === 'complaints' && (Boolean(kase.passed_up_at) || kase.seriousness === 'safety');
}
function canApprove(user, kase) {
  if (!user) return false;
  // A reply to the council is a manager's or owner's, like the council
  // emails themselves.
  if (kase.kind === 'licensing') return seesCouncil(user);
  if (needsManager(kase)) return atLeast(user, 'manager');
  return atLeast(user, 'operator');
}
// Who sees what (Tom, 10 November 2026: "three different companies that
// owners and managers can see, also managers and owners can see council
// worker"). Owners and managers see every company and the council emails.
// An operator sees their own company only (every company when they have
// none set) and never a council email.
function seesCouncil(user) { return atLeast(user, 'manager'); }
function canSee(user, kase) {
  if (!user || !kase) return false;
  if (kase.kind === 'licensing' && !seesCouncil(user)) return false;
  if (atLeast(user, 'manager')) return true;
  return !user.brand || user.brand === (kase.brand || '');
}
// Which company's cases a user is shown: undefined is every company.
function scopeFor(user) { return user && user.brand && !atLeast(user, 'manager') ? user.brand : undefined; }
// The full scope for a list, count or live stamp: the company, and whether
// council emails are left out.
function caseScope(user) { return { brand: scopeFor(user), hideCouncil: !seesCouncil(user) }; }
function canReassign(user, kase) {
  if (!user) return false;
  if (atLeast(user, 'manager')) return true;
  return !kase.owner_id || kase.owner_id === user.id;
}

function preparedFor(kase) {
  const demo = seedInbox(todayLondon()).find((e) => (e.messageId || e.id) === kase.message_id);
  return demo ? { reading: demo.prepared, complaint: demo.preparedComplaint || null, council: demo.preparedCouncil || null } : null;
}

class Office {
  constructor({ store, mailbox, firm, dispatch = null, aiOn = ai.aiEnabled, now = () => new Date() }) {
    this.store = store;
    this.mailbox = mailbox;
    this.firm = firm;
    this.dispatch = dispatch;
    this.aiOn = aiOn;
    this.now = now;
    this.reading = new Set();
  }

  today() { return todayLondon(this.now()); }

  // Pull the mailbox and make a case for every email not yet seen. Returns
  // the new cases. Reading them is a separate step so a slow model never
  // blocks the inbox arriving.
  async sync() {
    // A real mailbox not connected yet has nothing to pull. Not an error:
    // Settings says what it still needs.
    if (!this.mailbox.demo && this.mailbox.configured && !this.mailbox.configured()) return [];
    const emails = await this.mailbox.listInbox({ max: 50, days: 14, today: this.today() });
    const created = [];
    for (const e of emails) {
      const row = await this.store.insertCase(e, this.firm.mailboxBrand || '');
      if (row) {
        created.push(row);
        await this.store.addEvent(row.id, { kind: 'arrived', detail: `Arrived from ${this.mailbox.label}` });
      }
    }
    return created;
  }

  // The firm as the AI may describe it for this case: the configured facts
  // plus the fixed prices set for the case's brand.
  async firmFor(kase) {
    const prices = await this.store.fixedPrices(kase && kase.brand ? kase.brand : undefined).catch(() => []);
    return { ...this.firm, fixedPrices: prices };
  }

  emailOf(kase) {
    return { id: kase.mailbox_email_id, from: kase.from_address, subject: kase.subject, body: kase.body, receivedAt: londonStamp(kase.received_at), threadId: kase.thread_id, messageId: kase.message_id, channel: kase.channel || 'email', logged: isLogged(kase) };
  }

  // A complaint that came in another way (a Google review, a Facebook
  // comment, a phone call...), typed in by a member of staff. It is a
  // complaint from the start; the AI reads it with its channel and drafts
  // the reply that suits it. Returns the new case, read.
  async logComplaint(user, input) {
    const channel = isChannel(input.channel) ? input.channel : '';
    if (!channel) throw refuse('Choose where the complaint came in.');
    const text = String(input.text || '').replace(/\r\n/g, '\n').trim().slice(0, 8000);
    if (text.length < 10) throw refuse('Paste or type the complaint itself.');
    const name = String(input.name || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const contact = String(input.contact || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const when = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? new Date(`${input.date}T12:00:00Z`) : this.now();
    if (when > this.now()) throw refuse('The date it came in cannot be in the future.');
    const label = CHANNELS[channel].label;
    const row = await this.store.insertLoggedComplaint({ brand: input.brand || '', channel, name: name || `Someone (${label.toLowerCase()})`, contact, subject: `${label}: ${text.split('\n')[0].slice(0, 80)}`, text, receivedAt: when });
    await this.store.addEvent(row.id, { actor: user, kind: 'logged', detail: `Typed in from a ${label.toLowerCase()} by ${user.display_name || user.username}` });
    return this.read(row, { actor: user });
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
      let council = null;
      if (this.aiOn()) {
        try {
          const f = await this.firmFor(kase);
          reading = await ai.readEmail(this.emailOf(kase), this.today(), f);
          source = 'ai';
          // Staff typed it in as a complaint, so it is one, whatever the
          // reading made of it.
          if (isLogged(kase)) reading = { ...reading, intent: 'complaint', reply: '' };
          if (reading.intent === 'complaint') complaint = await ai.draftComplaint({ email: this.emailOf(kase), notes: [] }, this.today(), f);
          if (reading.intent === 'council') council = await ai.draftCouncil({ email: this.emailOf(kase), notes: [] }, this.today(), f);
        } catch (e) {
          note = `The AI could not read this email (${e.code || e.status || 'error'}). `;
        }
      }
      if (!reading) {
        const p = preparedFor(kase);
        if (p && !isLogged(kase)) { reading = p.reading; complaint = p.complaint; council = p.council; source = 'prepared'; note += 'This is the answer prepared for the made-up inbox, not the AI\'s reading.'; }
        else { note += this.aiOn() ? 'Read it yourself and write the reply below.' : 'The AI is switched off on this server, so read it yourself and write the reply below.'; }
      }
      const fields = { reading_source: source, reading_note: note.trim() };
      if (reading) {
        fields.reading = reading;
        fields.kind = kindFor(reading.intent);
        fields.seriousness = reading.intent === 'complaint' ? (complaint ? complaint.seriousness : reading.seriousness) : 'none';
        fields.draft = complaint ? complaint.reply : (council ? council.reply : reading.reply);
        fields.complaint = complaint;
        fields.council = council;
        if (kase.status === 'new' && fields.kind === 'other') fields.status = 'done';
      }
      if (isLogged(kase)) fields.kind = 'complaints';
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
    const out = await ai.redraft({ email: this.emailOf(kase), draft: kase.draft, notes, council: kase.kind === 'licensing' }, this.today(), await this.firmFor(kase));
    await this.store.updateCase(kase.id, { guidance: notes, draft: out.reply, held_back: out.held_back, approved_at: null, approved_by: null });
    await this.store.addEvent(kase.id, { actor: user, kind: 'guided', detail: t + (out.held_back ? ` (held back: ${out.held_back})` : '') });
    return { rewritten: true, heldBack: out.held_back };
  }

  // Approve the reply: saved as a draft in the firm's mailbox for a person
  // to send. Nothing goes to the customer from here.
  async approve(kase, user) {
    if (!canApprove(user, kase)) throw refuse(kase.kind === 'licensing' ? 'A reply to the council is approved by a manager or owner.' : needsManager(kase) ? (kase.passed_up_at ? 'This complaint was passed up, so a manager approves the reply.' : 'A safety matter needs a manager to approve the reply.') : 'You cannot approve this.');
    if (!String(kase.draft || '').trim()) throw refuse('There is no reply to approve.');
    if (isLogged(kase)) return this.approveLogged(kase, user);
    const { draftId } = await this.mailbox.saveReplyDraft(this.emailOf(kase), kase.draft);
    await this.store.updateCase(kase.id, { approved_at: this.now(), approved_by: user.id, saved_draft_id: draftId || null, status: 'waiting', owner_id: kase.owner_id || user.id });
    await this.store.addEvent(kase.id, { actor: user, kind: 'approved', detail: this.mailbox.demo ? 'Reply approved. This is the made-up inbox, so the draft was saved nowhere.' : `Reply approved and saved as a draft in ${this.mailbox.label} for someone to send${draftId ? ` (draft ${draftId})` : ''}.` });
    return { draftId: draftId || null };
  }

  // An operator passes a complaint up to a manager (Tom's email to Dan: an
  // escalate button, with the AI suggesting when). The case stays open
  // under the operator until a manager takes it; from here only a manager
  // may approve the reply.
  async passUp(kase, user, reason) {
    if (kase.kind !== 'complaints') throw refuse('Only a complaint is passed up to a manager.');
    if (kase.passed_up_at) throw refuse('This complaint has already been passed up.');
    const why = String(reason || '').trim().slice(0, 600) || (kase.complaint && kase.complaint.pass_to_manager_why) || 'Passed up by the operator';
    await this.store.updateCase(kase.id, { passed_up_at: this.now(), passed_up_by: user ? user.id : null, passed_up_reason: why, status: kase.status === 'new' ? 'in_progress' : kase.status, owner_id: kase.owner_id || (user ? user.id : null) });
    await this.store.addEvent(kase.id, { actor: user, kind: 'passed_up', detail: `Passed up to a manager: ${why}` });
    return this.store.caseById(kase.id);
  }

  // The holding reply the operator sends the customer when a complaint is
  // passed up: one click, the operator's click, never a timer. It goes the
  // same way as every reply, as a draft in the firm's mailbox for a person
  // to send; the text is the firm's, in its own words, not the AI's.
  holdingText(kase) {
    const r = kase.reading || {};
    const first = String(r.customer_name || '').trim().split(/\s+/)[0] || 'there';
    return `Hi ${first},

I'm sorry you've had cause to write to us. I've passed this to a manager so it gets looked at properly, and they will come back to you once they have been through what happened. Thank you for your patience in the meantime.

Thanks,
${this.firm.signature}`;
  }
  // A complaint typed in from another channel: an email one with an
  // address goes into the mailbox as a new draft, like any other reply;
  // anything else is approved for staff to copy and post or send where it
  // came in, and the case says where.
  async approveLogged(kase, user) {
    const ch = CHANNELS[kase.channel] || CHANNELS.other;
    const canHold = !this.mailbox.demo && !this.mailbox.none && typeof this.mailbox.saveNewDraft === 'function' && (!this.mailbox.configured || this.mailbox.configured());
    let draftId = null;
    if (kase.channel === 'email' && EMAIL_RE.test(kase.contact || '') && canHold) {
      draftId = (await this.mailbox.saveNewDraft(kase.contact, 'Your complaint', kase.draft)).draftId || null;
    }
    await this.store.updateCase(kase.id, { approved_at: this.now(), approved_by: user.id, saved_draft_id: draftId, status: 'waiting', owner_id: kase.owner_id || user.id });
    await this.store.addEvent(kase.id, { actor: user, kind: 'approved', detail: draftId ? `Reply approved and saved as a draft in ${this.mailbox.label} to ${kase.contact} for someone to send.` : `Reply approved. It came in as a ${ch.label.toLowerCase()}: ${ch.send}` });
    return { draftId, copyOut: !draftId, send: ch.send };
  }

  async sendHolding(kase, user) {
    if (kase.kind !== 'complaints') throw refuse('A holding reply is for a complaint.');
    if (isLogged(kase)) throw refuse('This complaint came in another way, so answer it with the reply below.');
    if (kase.holding_sent_at) throw refuse('The holding reply has already gone.');
    const text = this.holdingText(kase);
    const { draftId } = await this.mailbox.saveReplyDraft(this.emailOf(kase), text);
    await this.store.updateCase(kase.id, { holding_sent_at: this.now() });
    await this.store.addEvent(kase.id, { actor: user, kind: 'holding_reply', detail: this.mailbox.demo ? 'Holding reply approved. This is the made-up inbox, so it was saved nowhere.' : `Holding reply saved as a draft in ${this.mailbox.label} for someone to send${draftId ? ` (draft ${draftId})` : ''}.` });
    return { text, draftId: draftId || null };
  }

  // A member of staff books the job from an email into dispatch. Only with
  // the sign-off tick, only with every detail present, and only through the
  // dispatch connection, which is the stand-in until iCabbi is connected.
  bookingFrom(kase) {
    const r = kase.reading || {}; const j = r.journey || {};
    return { date: j.date || '', time: j.time || '', pickup: j.pickup || '', destination: j.destination || '', passengers: j.passengers || '', name: r.customer_name || '', phone: r.phone || '', vehicle: '', notes: '', flight: j.flight || '' };
  }
  async book(kase, user, input, signedOff) {
    if (!this.dispatch) throw refuse('No dispatch connection is set up on this office.');
    if (!['bookings'].includes(kase.kind)) throw refuse('Only a booking email is booked into dispatch.');
    if (kase.dispatch_ref) throw refuse(`This job is already in dispatch as ${kase.dispatch_ref}.`);
    if (!signedOff) throw refuse('Tick the sign-off box to confirm you have checked the job against the email. Nothing was booked.');
    const { job, missing } = cleanJob(input || {});
    if (missing.length) throw refuse(`Still needed before it can be booked: ${missing.join(', ')}. Nothing was booked.`);
    const summary = `${job.date} ${job.time}, ${job.pickup} to ${job.destination}, ${job.passengers} passenger${job.passengers === '1' ? '' : 's'}`;
    let result;
    try {
      result = await this.dispatch.book({ job, kase, brand: kase.brand || '', actor: user });
    } catch (e) {
      // What happened is recorded on the case whatever it was, so the next
      // person can see that someone tried and what iCabbi said.
      const kind = e.checkedOnly ? 'dispatch_checked' : e.uncertain ? 'dispatch_uncertain' : 'dispatch_refused';
      await this.store.addEvent(kase.id, { actor: user, kind, detail: `${summary}: ${e.message}` }).catch(() => {});
      throw e;
    }
    const { ref } = result;
    await this.store.updateCase(kase.id, { dispatch_ref: ref, booked_at: this.now(), booked_by: user.id, status: kase.status === 'new' ? 'in_progress' : kase.status, owner_id: kase.owner_id || user.id });
    await this.store.addEvent(kase.id, { actor: user, kind: 'booked', detail: `Booked into ${this.dispatch.label} as ${ref}: ${summary}, signed off by ${user.display_name || user.username}${result.statusWords ? ` (${result.statusWords})` : ''}` });
    return { ref, job, statusWords: result.statusWords || '' };
  }

  // Cancelling a job this office put into dispatch: the same sign-off tick,
  // and a reason that goes on the record.
  async cancelBooking(kase, user, signedOff, reason) {
    if (!kase.dispatch_ref) throw refuse('This case has nothing in dispatch to cancel.');
    if (!signedOff) throw refuse('Tick the box to confirm the customer asked for this to be cancelled. Nothing was cancelled.');
    const why = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!why) throw refuse('Say why it is being cancelled. Nothing was cancelled.');
    const ref = kase.dispatch_ref;
    let result;
    try { result = await this.dispatch.cancel({ ref, kase, actor: user }); } catch (e) {
      await this.store.addEvent(kase.id, { actor: user, kind: e.uncertain ? 'dispatch_uncertain' : 'dispatch_refused', detail: `Cancelling ${ref}: ${e.message}` }).catch(() => {});
      throw e;
    }
    await this.store.updateCase(kase.id, { dispatch_ref: '' });
    await this.store.addEvent(kase.id, { actor: user, kind: 'dispatch_cancelled', detail: `${ref} ${result.statusWords || 'cancelled'} Reason: ${why}. Signed off by ${user.display_name || user.username}` });
    return result;
  }

  // Read the status of every live booking still moving and note any change
  // on its case: driver assigned, on the way, completed, cancelled outside
  // the office. Read only.
  async refreshStatuses(limit = 30) {
    if (!this.dispatch || !this.dispatch.live || !this.dispatch.configured) return { checked: 0, changed: 0 };
    const rows = await this.store.liveDispatchBookings(limit);
    let changed = 0;
    for (const row of rows) {
      let st;
      try { st = await this.dispatch.status(row.ref); } catch (e) { await this.store.setDispatchStatus(row.ref, {}); continue; }
      if (!st) continue;
      const detail = [st.driver && `driver ${st.driver}`, st.vehicle && `car ${st.vehicle}`].filter(Boolean).join(', ');
      const cancelled = /CANCELLED$/.test(st.status);
      await this.store.setDispatchStatus(row.ref, { dispatchStatus: st.status, detail, status: cancelled ? 'cancelled' : null });
      if (st.status !== row.dispatch_status) {
        changed += 1;
        if (row.case_id) {
          await this.store.addEvent(row.case_id, { kind: 'dispatch_status', detail: `iCabbi: ${row.ref} ${st.words}${detail ? ` (${detail})` : ''}` });
          if (cancelled) await this.store.updateCase(row.case_id, { dispatch_ref: '' });
        }
      }
    }
    return { checked: rows.length, changed };
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

  // The complaint nudge (Tom's email to Dan: a complaint unanswered for 12
  // hours goes to a manager). Past the nudge time with no approved reply,
  // the complaint is passed up by the office itself and a manager is
  // emailed once. Nothing goes to the customer.
  async nudge(alerts, baseUrl) {
    const hours = await this.store.complaintNudgeHours();
    const due = await this.store.complaintNudgeCandidates(hours);
    if (!due.length) return { nudged: 0, emailed: false };
    for (const c of due) {
      await this.store.updateCase(c.id, { passed_up_at: this.now(), passed_up_by: null, passed_up_reason: `No approved reply within ${hours} hours` });
      await this.store.addEvent(c.id, { kind: 'passed_up', detail: `Passed up to a manager by the office: no approved reply within ${hours} hours` });
    }
    let emailed = false;
    if (alerts && alerts.sendNudge) {
      try {
        const r = await alerts.sendNudge({ cases: due, hours, baseUrl, firmName: this.firm.name });
        emailed = r.sent;
        if (r.sent) await this.store.markPassedUpNotified(due.map((c) => c.id));
      } catch (e) {
        console.error('Abacus office: nudge email failed', e.message);
      }
    }
    return { nudged: due.length, emailed };
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

module.exports = { Office, kindFor, canApprove, canReassign, canSee, scopeFor, caseScope, seesCouncil, needsManager, atLeast, label, londonStamp, brandName, LEVEL };
