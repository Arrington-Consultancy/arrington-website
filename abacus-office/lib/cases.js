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
// Who sees what. Which companies a person sees is set on them in Users
// (Tom, 11 November 2026: "I think this needs to be an option in users when
// we create them"): one company, or every company with the company menu in
// the bar. That applies to operators and managers alike; the owner always
// sees every company, so the person who sets this can never lock
// themselves out. Council emails are for managers and the owner only (Tom,
// 10 November 2026), and a manager set to one company sees that company's.
function seesCouncil(user) { return atLeast(user, 'manager'); }
function seesEveryCompany(user) { return Boolean(user) && (user.role === 'owner' || !user.brand); }
function canSee(user, kase) {
  if (!user || !kase) return false;
  if (kase.kind === 'licensing' && !seesCouncil(user)) return false;
  return seesEveryCompany(user) || user.brand === (kase.brand || '');
}
// Which company's cases a user is shown: undefined is every company.
function scopeFor(user) { return user && !seesEveryCompany(user) ? user.brand : undefined; }
// Each company has its own portal (Tom, 11 November 2026: "the two other
// companies portals to be there, owner having drop down access"). Anyone
// set to see every company chooses which portal to look at from the bar;
// '' is all companies together. Someone set to one company is always in
// that company's portal and has no menu.
function canSwitchPortal(user) { return Boolean(user) && !scopeFor(user); }
function portalFor(user, chosen, brands) {
  const own = scopeFor(user);
  if (own) return own;
  const want = String(chosen || '');
  return (brands || []).some((b) => b.id === want) ? want : '';
}
// The full scope for a list, count or live stamp: the company, and whether
// council emails are left out. A chosen portal narrows it; it never widens
// what an operator sees.
function caseScope(user, portal) { return { brand: scopeFor(user) || portal || undefined, hideCouncil: !seesCouncil(user) }; }
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

  // The firm as the AI may describe it for this case: the configured facts,
  // the fixed prices and the standard replies set for the case's company.
  async firmFor(kase) {
    const brand = kase && kase.brand ? kase.brand : '';
    const [prices, replies] = await Promise.all([
      this.store.fixedPrices(brand || undefined).catch(() => []),
      this.store.standardRepliesFor(brand).catch(() => [])
    ]);
    return { ...this.firm, fixedPrices: prices, standardReplies: replies };
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
    const row = await this.store.insertLoggedComplaint({ brand: input.brand || '', channel, name: name || `Someone (${label.toLowerCase()})`, contact, subject: `${label}: ${text.split('\n')[0].slice(0, 80)}`, text, receivedAt: when, logId: input.logId });
    // The same form sent twice: the complaint is already in, so nothing is
    // logged or read a second time.
    if (row.existed) return this.store.caseById(row.id);
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
        // A new reading is a new reply: an approval of the old one no
        // longer stands, and it has not been sent.
        if (kase.approved_at) Object.assign(fields, { approved_at: null, approved_by: null, mailbox_state: '', mailbox_state_at: null, sent_at: null, sent_by: null, sent_state: '', status: kase.status === 'waiting' ? 'in_progress' : (fields.status || kase.status) });
      }
      if (isLogged(kase)) fields.kind = 'complaints';
      await this.store.updateCase(kase.id, fields);
      await this.store.addEvent(kase.id, { actor, kind: 'read', detail: reading ? `Read by ${source === 'ai' ? 'the AI' : 'the prepared answer'}: ${reading.summary}${kase.approved_at ? '. The reply was approved before; the new one needs approving again' : ''}` : `Not read: ${note.trim()}` });
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
    if (toUser && (!toUser.active || !canSee(toUser, kase))) throw refuse('That person cannot open this email, so it was not assigned to them.');
    await this.store.updateCase(kase.id, { owner_id: toUser ? toUser.id : null, status: kase.status === 'new' && toUser ? 'in_progress' : kase.status });
    await this.store.addEvent(kase.id, { actor: user, kind: 'assigned', detail: toUser ? `Assigned to ${toUser.display_name || toUser.username}` : 'Left unassigned' });
  }

  async setStatus(kase, user, status) {
    if (!['new', 'in_progress', 'waiting', 'done'].includes(status)) throw refuse('Not a status.');
    if (status === kase.status) return;
    if (status === 'waiting' && !kase.sent_at) throw refuse('A case waits on the customer once its reply has gone. Approve the reply, send it, then press I have sent it.');
    if (status === 'done' && needsManager(kase) && !atLeast(user, 'manager')) throw refuse(kase.seriousness === 'safety' ? 'A safety complaint is closed by a manager.' : 'This complaint was passed up, so a manager closes it.');
    await this.store.updateCase(kase.id, { status });
    await this.store.addEvent(kase.id, { actor: user, kind: 'status', detail: `Marked ${label(status)}` });
  }

  async saveDraft(kase, user, text, expected) {
    const draft = String(text || '').replace(/\r\n/g, '\n').slice(0, 4000);
    const r = await this.store.setDraftIfChanged(kase.id, draft, expected);
    if (r === 'stale') throw stale();
    if (r !== 'saved') return;
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
    await this.store.updateCase(kase.id, { guidance: notes, draft: out.reply, held_back: out.held_back, approved_at: null, approved_by: null, mailbox_state: '', mailbox_state_at: null, sent_at: null, sent_by: null, sent_state: '' });
    await this.store.addEvent(kase.id, { actor: user, kind: 'guided', detail: t + (out.held_back ? ` (held back: ${out.held_back})` : '') });
    return { rewritten: true, heldBack: out.held_back };
  }

  // Where an approved reply goes, in words for the case history.
  savedWhere(draftId) {
    if (this.mailbox.demo) return 'This is the made-up inbox, so it was saved nowhere and nothing was sent.';
    if (this.mailbox.none) return 'No mailbox is connected, so it was saved nowhere and nothing was sent. Copy it into your own email and send it from there.';
    return `Saved as a draft in ${this.mailbox.label} for someone to send${draftId ? ` (draft ${draftId})` : ''}. Nothing has been sent.`;
  }

  // Approve the reply: saved as a draft in the firm's mailbox for a person
  // to send. Nothing goes to the customer from here, and approving is not
  // sending: the case stays open until someone says they sent it.
  //
  // One draft, however many presses (11 November 2026): the case is claimed
  // in the database before the mailbox is touched. If the mailbox refuses
  // outright the claim is released; if it does not answer clearly the case
  // is marked uncertain, and a second attempt needs a person to say they
  // have looked in the mailbox and the draft is not there.
  async approve(kase, user, { mailboxChecked = false, version } = {}) {
    if (!canApprove(user, kase)) throw refuse(kase.kind === 'licensing' ? 'A reply to the council is approved by a manager or owner.' : needsManager(kase) ? (kase.passed_up_at ? 'This complaint was passed up, so a manager approves the reply.' : 'A safety matter needs a manager to approve the reply.') : 'You cannot approve this.');
    if (!String(kase.draft || '').trim()) throw refuse('There is no reply to approve.');
    if (isLogged(kase)) return this.approveLogged(kase, user, version);
    const claim = await this.store.claimApproval(kase.id, user.id, { retry: mailboxChecked, version });
    if (!claim) {
      const now = await this.store.caseById(kase.id);
      if (now && Number.isInteger(version) && now.draft_version !== version) throw stale();
      if (now && (now.mailbox_state === 'uncertain' || now.mailbox_state === 'saving')) throw refuse(`This reply may already be in ${this.mailbox.label} as a draft. Look in the mailbox drafts first. If it is not there, tick the box to say you have checked and approve it again.`);
      throw refuse('This reply is already approved. To change it, edit the reply and approve the new version.');
    }
    let draftId = null; let threadId = null;
    try {
      ({ draftId = null, threadId = null } = await this.mailbox.saveReplyDraft(this.emailOf(kase), kase.draft));
    } catch (e) {
      if (e.code === 'MAILBOX_REFUSED') {
        await this.store.releaseApproval(kase.id);
        throw refuse(`${this.mailbox.label} refused it, so nothing was saved: ${e.message}.`);
      }
      await this.store.updateCase(kase.id, { mailbox_state: 'uncertain', mailbox_state_at: this.now() }).catch(() => {});
      await this.store.addEvent(kase.id, { actor: user, kind: 'approve_uncertain', detail: `Approved, but ${this.mailbox.label} did not answer clearly (${String(e.message).slice(0, 160)}). The draft may or may not be there.` }).catch(() => {});
      throw refuse(`${this.mailbox.label} did not answer clearly, so the draft may or may not be there. Look in the mailbox drafts. If it is not there, tick the box to say you have checked and approve it again.`);
    }
    const status = kase.status === 'new' ? 'in_progress' : (kase.status === 'waiting' ? 'in_progress' : kase.status);
    // 'none': approved with no mailbox to save to (staff copy it out).
    const state = (this.mailbox.none || this.mailbox.demo) ? 'none' : 'saved';
    // Where the mailbox can say whether a draft was sent (Gmail), the office
    // watches it and marks the reply sent itself (checkSent).
    const tracked = Boolean(draftId) && Boolean(this.mailbox.canTrackSent);
    try {
      await this.store.updateCase(kase.id, { saved_draft_id: draftId || null, saved_thread_id: threadId || kase.thread_id || '', sent_state: tracked ? 'unsent' : '', mailbox_state: state, mailbox_state_at: this.now(), status, owner_id: kase.owner_id || user.id });
    } catch (e) {
      // The draft is in the mailbox. Record that, and keep the claim, so a
      // retry cannot put a second one there.
      await this.store.updateCase(kase.id, { mailbox_state: state, mailbox_state_at: this.now() }).catch(() => {});
      throw refuse(`The reply was saved in ${this.mailbox.label}, but the office could not finish recording it. Do not approve it again; reload the page in a moment.`);
    }
    await this.store.addEvent(kase.id, { actor: user, kind: 'approved', detail: `Reply approved. ${this.savedWhere(draftId)}` }).catch((e) => console.error('Abacus office: approval event not written', e.message));
    return { draftId: draftId || null };
  }

  // Someone sent the approved reply from the mailbox (or their own email):
  // their word, recorded with their name. Only now is the case waiting on
  // the customer.
  async markSent(kase, user) {
    if (!kase.approved_at) throw refuse('Approve the reply before marking it sent.');
    if (kase.sent_at) throw refuse('This reply is already marked as sent.');
    const row = await this.store.markSent(kase.id, user.id);
    if (!row) throw refuse('This reply is already marked as sent.');
    await this.store.addEvent(kase.id, { actor: user, kind: 'sent', detail: `Marked as sent by ${user.display_name || user.username}` });
    return row;
  }

  // An operator passes a complaint up to a manager (Tom's email to Dan: an
  // escalate button, with the AI suggesting when). The case stays open
  // under the operator until a manager takes it; from here only a manager
  // may approve the reply.
  async passUp(kase, user, reason) {
    if (kase.kind !== 'complaints') throw refuse('Only a complaint is passed up to a manager.');
    if (kase.passed_up_at) throw refuse('This complaint has already been passed up.');
    const why = String(reason || '').trim().slice(0, 600) || (kase.complaint && kase.complaint.pass_to_manager_why) || 'Passed up by the operator';
    const won = await this.store.claimPassUp(kase.id, user ? user.id : null, why, kase.status === 'new' ? 'in_progress' : kase.status, kase.owner_id || (user ? user.id : null));
    if (!won) throw refuse('This complaint has already been passed up.');
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
  async approveLogged(kase, user, version) {
    const ch = CHANNELS[kase.channel] || CHANNELS.other;
    // Only the company the mailbox belongs to has its drafts put there.
    const canHold = this.canHoldNew(kase.brand);
    const claim = await this.store.claimApproval(kase.id, user.id, { version });
    if (!claim) {
      const now = await this.store.caseById(kase.id);
      if (now && Number.isInteger(version) && now.draft_version !== version) throw stale();
      throw refuse('This reply is already approved. To change it, edit the reply and approve the new version.');
    }
    let draftId = null; let threadId = null;
    if (kase.channel === 'email' && EMAIL_RE.test(kase.contact || '') && canHold) {
      try { ({ draftId = null, threadId = null } = await this.mailbox.saveNewDraft(kase.contact, 'Your complaint', kase.draft)); } catch (e) {
        if (e.code === 'MAILBOX_REFUSED') { await this.store.releaseApproval(kase.id); throw refuse(`${this.mailbox.label} refused it, so nothing was saved: ${e.message}.`); }
        await this.store.updateCase(kase.id, { mailbox_state: 'uncertain', mailbox_state_at: this.now() }).catch(() => {});
        throw refuse(`${this.mailbox.label} did not answer clearly, so the draft may or may not be there. Look in the mailbox drafts before doing anything else.`);
      }
    }
    await this.store.updateCase(kase.id, { saved_draft_id: draftId, saved_thread_id: threadId || '', sent_state: draftId && this.mailbox.canTrackSent ? 'unsent' : '', mailbox_state: draftId ? 'saved' : '', mailbox_state_at: this.now(), status: kase.status === 'new' ? 'in_progress' : kase.status, owner_id: kase.owner_id || user.id });
    await this.store.addEvent(kase.id, { actor: user, kind: 'approved', detail: draftId ? `Reply approved and saved as a draft in ${this.mailbox.label} to ${kase.contact} for someone to send.` : `Reply approved. It came in as a ${ch.label.toLowerCase()}: ${ch.send}` });
    return { draftId, copyOut: !draftId, send: ch.send };
  }

  // A new email (not a reply in a thread) can go into the connected mailbox
  // only for the company that mailbox belongs to. Coastline's or A2B's would
  // otherwise go out from the Abacus address; until each has its own
  // mailbox, staff copy it into that company's own email.
  canHoldNew(brand) {
    const m = this.mailbox;
    if (m.demo || m.none || typeof m.saveNewDraft !== 'function' || (m.configured && !m.configured())) return false;
    return !brand || !this.firm.mailboxBrand || brand === this.firm.mailboxBrand;
  }

  async sendHolding(kase, user) {
    if (kase.kind !== 'complaints') throw refuse('A holding reply is for a complaint.');
    if (isLogged(kase)) throw refuse('This complaint came in another way, so answer it with the reply below.');
    if (!kase.passed_up_at) throw refuse('The holding reply tells the customer it has gone to a manager, so pass the complaint up first.');
    if (kase.holding_sent_at || !(await this.store.claimHolding(kase.id))) throw refuse('The holding reply has already been approved.');
    const text = this.holdingText(kase);
    let draftId = null;
    try { ({ draftId } = await this.mailbox.saveReplyDraft(this.emailOf(kase), text)); } catch (e) {
      if (e.code === 'MAILBOX_REFUSED') { await this.store.updateCase(kase.id, { holding_sent_at: null }); throw refuse(`${this.mailbox.label} refused it, so nothing was saved: ${e.message}.`); }
      await this.store.addEvent(kase.id, { actor: user, kind: 'holding_uncertain', detail: `Holding reply: ${this.mailbox.label} did not answer clearly (${String(e.message).slice(0, 160)}). It may or may not be in the drafts.` }).catch(() => {});
      throw refuse(`${this.mailbox.label} did not answer clearly, so the holding reply may or may not be in the drafts. Look there before doing anything else.`);
    }
    await this.store.addEvent(kase.id, { actor: user, kind: 'holding_reply', detail: `Holding reply approved. ${this.savedWhere(draftId)}` });
    return { text, draftId: draftId || null };
  }

  // What became of approved replies saved in the mailbox (the review of 11
  // November 2026: staff could not tell a saved draft from a sent reply).
  // Sent: noted. Deleted without being sent: the approval comes off and the
  // email is open again, so it cannot look handled when it was not. Still a
  // draft: checked again next time; Today lists one unsent for over an hour.
  async checkSent(limit = 25) {
    if (!this.mailbox.canTrackSent || this.mailbox.demo || this.mailbox.none) return { checked: 0, changed: 0 };
    const rows = await this.store.casesAwaitingSend(limit);
    let changed = 0;
    for (const c of rows) {
      let st;
      try { st = await this.mailbox.draftState({ draftId: c.saved_draft_id, threadId: c.saved_thread_id || c.thread_id, since: c.approved_at }); } catch (e) { continue; }
      if (!st) continue;
      if (st.state === 'sent') {
        changed += 1;
        await this.store.updateCase(c.id, { sent_state: 'sent', sent_at: st.at || this.now(), sent_checked_at: this.now(), status: c.status === 'done' ? 'done' : 'waiting' });
        await this.store.addEvent(c.id, { kind: 'sent', detail: `The approved reply was sent from ${this.mailbox.label}` });
      } else if (st.state === 'discarded') {
        changed += 1;
        await this.store.updateCase(c.id, { sent_state: 'discarded', sent_checked_at: this.now(), approved_at: null, approved_by: null, saved_draft_id: null, mailbox_state: '', mailbox_state_at: null, status: 'in_progress' });
        await this.store.addEvent(c.id, { kind: 'discarded', detail: `The draft was deleted in ${this.mailbox.label} without being sent, so the reply needs approving again` });
      } else {
        await this.store.updateCase(c.id, { sent_checked_at: this.now() });
      }
    }
    return { checked: rows.length, changed };
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
    // One booking however many presses: the case is claimed first.
    if (!(await this.store.claimBooking(kase.id))) throw refuse('This job is being booked, or was booked a moment ago. Reload the page before trying again. Nothing was booked twice.');
    let result;
    try {
      result = await this.dispatch.book({ job, kase, brand: kase.brand || '', actor: user });
    } catch (e) {
      await this.store.releaseBooking(kase.id).catch(() => {});
      // What happened is recorded on the case whatever it was, so the next
      // person can see that someone tried and what iCabbi said.
      const kind = e.checkedOnly ? 'dispatch_checked' : e.uncertain ? 'dispatch_uncertain' : 'dispatch_refused';
      await this.store.addEvent(kase.id, { actor: user, kind, detail: `${summary}: ${e.message}` }).catch(() => {});
      throw e;
    }
    const { ref } = result;
    await this.store.updateCase(kase.id, { dispatch_ref: ref, booking_claim_at: null, booked_at: this.now(), booked_by: user.id, status: kase.status === 'new' ? 'in_progress' : kase.status, owner_id: kase.owner_id || user.id });
    await this.store.addEvent(kase.id, { actor: user, kind: 'booked', detail: `${this.dispatch.live ? 'Booked into' : 'Recorded on the stand-in dispatch, not a live system, as'} ${this.dispatch.live ? `${this.dispatch.label} as ` : ''}${ref}: ${summary}, signed off by ${user.display_name || user.username}${result.statusWords ? ` (${result.statusWords})` : ''}${this.dispatch.live ? '' : '. No car is booked.'}` });
    // Only a job in a live dispatch system may be confirmed to the customer:
    // then the AI rewrites the draft to confirm what is in dispatch, still as
    // a draft for staff to approve. A stand-in booking books no car, so it
    // never produces a confirmation.
    let confirmed = false;
    const fresh = await this.store.caseById(kase.id);
    if (this.dispatch.live && this.aiOn() && fresh && !fresh.approved_at) {
      try {
        await this.guide(fresh, user, `This job is now booked in dispatch as ${ref}: ${summary}${job.vehicle ? `, ${job.vehicle}` : ''}. Confirm the booking to the customer with these details, and nothing more.`);
        confirmed = true;
      } catch (e) { /* the booking stands; staff guide the reply by hand */ }
    }
    return { ref, job, statusWords: result.statusWords || '', confirmed };
  }

  // The booking a change or cancel email is about: the one this case put
  // into dispatch, or one staff name by its reference (a customer writing
  // to change a job booked from an earlier email or by phone). It must be a
  // booking this office holds, still booked, in a company this person sees.
  async bookingToAlter(kase, user, typedRef) {
    const ref = kase.dispatch_ref || String(typedRef || '').replace(/\s+/g, '').slice(0, 60);
    if (!ref) throw refuse('Give the dispatch reference of the booking, from the board or the earlier email. Nothing was changed.');
    const row = await this.store.dispatchBookingByRef(ref);
    const sees = row && (seesEveryCompany(user) || user.brand === (row.brand || ''));
    if (!row || !sees) throw refuse(`This office has no booking ${ref}${this.dispatch && this.dispatch.live ? '. A job booked straight into iCabbi, not from here, is changed in iCabbi' : ''}. Nothing was changed.`);
    if (row.status !== 'booked') throw refuse(`${ref} has already been cancelled. Nothing was changed.`);
    return row;
  }

  // Changing a job already in dispatch: the same sign-off tick, every
  // detail present, and a record of exactly what changed.
  async changeBooking(kase, user, input, signedOff, typedRef) {
    if (!this.dispatch || typeof this.dispatch.update !== 'function') throw refuse('This dispatch connection cannot change a booking. Change it on the board.');
    if (kase.kind !== 'bookings') throw refuse('Only a booking email changes a job in dispatch.');
    const row = await this.bookingToAlter(kase, user, typedRef);
    if (!signedOff) throw refuse('Tick the box to confirm you have checked the change against the customer\'s email. Nothing was changed.');
    const { job, missing } = cleanJob(input || {});
    if (missing.length) throw refuse(`Still needed before it can be changed: ${missing.join(', ')}. Nothing was changed.`);
    const before = row.job || {};
    const names = { date: 'date', time: 'time', pickup: 'pickup', destination: 'destination', name: 'passenger', phone: 'phone', passengers: 'passengers', vehicle: 'vehicle', notes: 'note for the driver', flight: 'flight' };
    const changes = Object.keys(names).filter((k) => String(before[k] || '') !== String(job[k] || '')).map((k) => `${names[k]} ${before[k] ? `from ${before[k]} ` : ''}to ${job[k] || '(none)'}`);
    if (!changes.length) throw refuse('Nothing in the job is different from what dispatch holds. Nothing was changed.');
    if (!(await this.store.claimWork(kase.id))) throw refuse('This change is being made, or was made a moment ago. Reload the page before trying again. Nothing was changed twice.');
    let result;
    try { result = await this.dispatch.update({ ref: row.ref, job, kase, actor: user }); } catch (e) {
      await this.store.releaseBooking(kase.id).catch(() => {});
      const kind = e.checkedOnly ? 'dispatch_checked' : e.uncertain ? 'dispatch_uncertain' : 'dispatch_refused';
      await this.store.addEvent(kase.id, { actor: user, kind, detail: `Changing ${row.ref}: ${e.message}` }).catch(() => {});
      throw e;
    }
    await this.store.releaseBooking(kase.id).catch(() => {});
    const detail = `${row.ref} changed in ${this.dispatch.label}: ${changes.join('; ')}. Signed off by ${user.display_name || user.username}`;
    if (!kase.dispatch_ref) await this.store.updateCase(kase.id, { dispatch_ref: row.ref, owner_id: kase.owner_id || user.id, status: kase.status === 'new' ? 'in_progress' : kase.status });
    await this.store.addEvent(kase.id, { actor: user, kind: 'dispatch_changed', detail });
    if (row.case_id && row.case_id !== kase.id) await this.store.addEvent(row.case_id, { actor: user, kind: 'dispatch_changed', detail: `${detail}, from email ${kase.id}` });
    return { ref: row.ref, changes, statusWords: result && result.statusWords };
  }

  // Cancelling a job in dispatch: the one this case booked, or one named by
  // its reference from a cancel email. The same sign-off tick, and a reason
  // that goes on the record.
  async cancelBooking(kase, user, signedOff, reason, typedRef) {
    if (!kase.dispatch_ref && !typedRef) throw refuse('This case has nothing in dispatch to cancel.');
    const row = await this.bookingToAlter(kase, user, typedRef);
    if (!signedOff) throw refuse('Tick the box to confirm the customer asked for this to be cancelled. Nothing was cancelled.');
    const why = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!why) throw refuse('Say why it is being cancelled. Nothing was cancelled.');
    const ref = row.ref;
    // One cancellation however many presses: the booking is claimed first.
    if (!(await this.store.claimDispatchCancel(ref))) throw refuse(`${ref} has already been cancelled. Nothing was changed.`);
    let result;
    try { result = await this.dispatch.cancel({ ref, kase, actor: user }); } catch (e) {
      await this.store.restoreDispatchCancel(ref).catch(() => {});
      await this.store.addEvent(kase.id, { actor: user, kind: e.checkedOnly ? 'dispatch_checked' : e.uncertain ? 'dispatch_uncertain' : 'dispatch_refused', detail: `Cancelling ${ref}: ${e.message}` }).catch(() => {});
      throw e;
    }
    const detail = `${ref} ${result.statusWords || 'cancelled'} Reason: ${why}. Signed off by ${user.display_name || user.username}`;
    await this.store.updateCase(kase.id, { dispatch_ref: '' });
    await this.store.addEvent(kase.id, { actor: user, kind: 'dispatch_cancelled', detail });
    if (row.case_id && row.case_id !== kase.id) {
      await this.store.addEvent(row.case_id, { actor: user, kind: 'dispatch_cancelled', detail: `${detail}, from email ${kase.id}` });
      const other = await this.store.caseById(row.case_id);
      if (other && other.dispatch_ref === ref) await this.store.updateCase(row.case_id, { dispatch_ref: '' });
    }
    return { ...result, ref };
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
        if (r.sent) await this.store.markEscalationNotified(r.sentIds || due.map((c) => c.id));
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
        if (r.sent) await this.store.markPassedUpNotified(r.sentIds || due.map((c) => c.id));
      } catch (e) {
        console.error('Abacus office: nudge email failed', e.message);
      }
    }
    return { nudged: due.length, emailed };
  }
}

function refuse(message) { const e = new Error(message); e.code = 'REFUSED'; return e; }
// Someone changed the reply after this person's page was opened.
function stale() {
  const e = refuse('Someone else changed this reply while you had it open, so yours was not saved or approved. Your version is shown above the reply to copy back in.');
  e.stale = true;
  return e;
}

function label(status) {
  return { new: 'new', in_progress: 'in progress', waiting: 'sent, waiting on the customer', done: 'done' }[status] || status;
}

function londonStamp(d) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(d));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

module.exports = { Office, kindFor, canApprove, canReassign, canSee, scopeFor, caseScope, canSwitchPortal, portalFor, seesEveryCompany, seesCouncil, needsManager, atLeast, label, londonStamp, brandName, LEVEL };
