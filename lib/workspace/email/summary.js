// The bridge from Tom's inbox into the Company Brain: ONE bounded record,
// `email.summary`, in workspace_records, regenerated when a person presses
// "Update the Company Brain" on the Email page (or a sync route calls it).
// Same shape and same reasons as finance.summary: Ask Ruth draws on the
// filtered, freshness-tracked record mechanism every other source uses,
// rather than a parallel path with its own rules.
//
// What it holds: the unread count, and for the most recent messages the
// sender, subject, date and Google's own one-line snippet. No message
// bodies, no attachments, no addresses of third parties beyond the From
// line. Sensitivity is always 'confidential', the narrowest tier the
// workspace has, and is not a parameter: real correspondence does not
// get a caller-chosen sensitivity. It is a snapshot, so the record says
// when it was taken and goes stale after a day.

const EMAIL_SUMMARY_RECORD_KEY = 'email.summary';
const SUMMARY_MESSAGE_COUNT = 15;

function fmtDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 16).replace('T', ' ') : 'unknown date';
}

function oneLine(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}...` : t;
}

// Pure: builds the record from already-fetched data so it can be tested
// without a mailbox.
function buildEmailSummaryRecord({ profile, counts, messages, now = new Date() }) {
  const recent = (messages || []).slice(0, SUMMARY_MESSAGE_COUNT);
  const lines = [
    `Mailbox: ${profile && profile.emailAddress ? profile.emailAddress : 'unknown'} (Gmail, read via the Gmail API). Snapshot taken ${now.toISOString()}.`,
    `Inbox: ${counts && counts.unread !== null && counts.unread !== undefined ? `${counts.unread} unread` : 'unread count unavailable'}${counts && counts.total !== null && counts.total !== undefined ? ` of ${counts.total} messages` : ''}.`,
    'This record holds message headers and one-line previews only, not message bodies or attachments. It is a snapshot of the inbox at the time above, not a live feed.',
    recent.length ? `Most recent ${recent.length} message(s), newest first:` : 'No messages were returned from the inbox.'
  ];
  recent.forEach((m) => {
    lines.push(`${fmtDate(m.date)} ${m.unread ? '[unread] ' : ''}from ${oneLine(m.from, 80) || '(no sender)'}: ${oneLine(m.subject, 120) || '(no subject)'}${m.snippet ? ` | ${oneLine(m.snippet, 140)}` : ''}`);
  });
  return {
    record_key: EMAIL_SUMMARY_RECORD_KEY,
    source_class: 'email',
    authority_class: 'evidence',
    doc_status: 'current',
    sensitivity: 'confidential',
    title: 'Email: inbox snapshot (headers and previews)',
    source_ref: `Gmail API, ${profile && profile.emailAddress ? profile.emailAddress : 'mailbox'}`,
    body: lines.join('\n'),
    as_of: now,
    synced_at: now,
    stale_after_days: 1,
    sync_outcome: 'ok',
    meta: { mailbox: profile && profile.emailAddress ? profile.emailAddress : '', unread: counts ? counts.unread : null, messages: recent.length }
  };
}

async function syncEmailSummaryRecord(workspaceRepo, data) {
  const record = buildEmailSummaryRecord(data);
  await workspaceRepo.upsertRecord(record);
  return record;
}

module.exports = { EMAIL_SUMMARY_RECORD_KEY, SUMMARY_MESSAGE_COUNT, buildEmailSummaryRecord, syncEmailSummaryRecord };
