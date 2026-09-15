// Arrington AI Workspace: the authorised Drive record register
// (15/09/2026).
//
// Tom's instruction, after the first build was pinned to one spreadsheet
// id as a constant: Ruth should be able to use the appropriate Arrington
// Drive records, and the architecture must not be built around one
// permanent pin. But it must equally not become Drive browsing.
//
// This register is the answer to both. It is a CODE-DECLARED ALLOWLIST:
// adding a record is a commit, reviewed and in git history, not a
// configuration change and never a runtime discovery. Today it holds
// exactly one entry, deliberately.
//
// THE BOUNDARY IS TWO INDEPENDENT THINGS, AND BOTH MUST HOLD:
//
//   1. GOOGLE'S ACL. The service account has no Drive of its own and can
//      read only files Tom has shared with it, one at a time. That is
//      enforced by Google, visible in each file's own sharing dialog, and
//      revoked by unsharing.
//   2. THIS REGISTER. A file that is not listed here is refused before a
//      request is built, by assertRegistered() below.
//
// So a file shared but not registered is never read, and a file
// registered but not shared fails honestly and says which. Neither alone
// is the control; the intersection is.
//
// AND THERE IS NO DISCOVERY. The client this register feeds has no list,
// no search and no folder traversal, so it cannot find a file it was not
// told about. `test/workspace/hoursLog.test.js` asserts that no Drive
// files/list endpoint appears anywhere in the connector.

// Kinds, and what each would cost. Only 'sheet' is used today.
//
// A Google DOC would need a SECOND OAuth scope (drive.readonly, to export
// the document body), which is still bounded to shared files by the empty
// ACL but is a deliberate widening. It is not requested pre-emptively:
// registering the first Doc is the moment to take that decision.
const KINDS = Object.freeze({ sheet: 'spreadsheets.readonly' });

const RECORDS = Object.freeze([
  Object.freeze({
    id: 'hours_log',
    fileId: '11YzoTkTlUaYf2XB8mAzp_LMSAs45bXxzBsVN25dEB1A',
    title: 'CURRENT - Arrington Consultancy Log Hours Worker',
    kind: 'sheet',
    parser: 'hoursLog',
    // The workspace source class the records derived from this file
    // carry. Granted to NO worker lane; see lib/workspace/lanes.js.
    sourceClass: 'hours',
    sensitivity: 'confidential',
    purpose: 'Dated work entries per client with billable flags, the hourly rate and totals. The record of what work has been DONE.',
    // What it is allowed to be used for, so a future reader can tell
    // whether a new use is inside the authorised purpose or outside it.
    supports: Object.freeze([
      'what work has been done, for whom, and how much billable time it came to',
      'the unbilled side of a reconciliation against Zoho',
      'the evidence behind a figure: which sheet, which rows, read when'
    ]),
    // Stated because it is the thing that makes this file more sensitive
    // than an ordinary business record, and the reason it is granted to
    // no lane rather than merely being confidential.
    sensitiveBecause: "it carries Arrington's own charging rate and notes saying which entries are estimates rather than stopwatch time"
  })
]);

const BY_ID = new Map(RECORDS.map((r) => [r.id, r]));
const BY_FILE = new Map(RECORDS.map((r) => [r.fileId, r]));

function list() { return RECORDS; }
function byId(id) { return BY_ID.get(String(id || '')) || null; }
function byFileId(fileId) { return BY_FILE.get(String(fileId || '')) || null; }
function isRegistered(fileId) { return BY_FILE.has(String(fileId || '')); }

// The guard that replaced the single hardcoded pin. It THROWS rather than
// returning false: a caller that has reached the point of naming a file
// id has no sensible way to continue with an unauthorised one, and a
// silent false invites a caller to carry on with an empty result.
function assertRegistered(fileId) {
  const record = byFileId(fileId);
  if (!record) {
    // Deliberately does not echo the requested id back into the message:
    // an error string travels, and the id of a file somebody tried to
    // read is information about what they tried to read.
    throw new Error('that file is not in the authorised Drive record register, so it was not read');
  }
  return record;
}

// The scopes this register as a whole requires, derived from the kinds
// actually in use rather than declared by hand, so registering a Doc
// cannot quietly ride in on a scope requested for sheets.
function requiredScopes() {
  return [...new Set(RECORDS.map((r) => KINDS[r.kind]).filter(Boolean))];
}

module.exports = { RECORDS, KINDS, list, byId, byFileId, isRegistered, assertRegistered, requiredScopes };
