// Scott AI Demonstration - reading and writing the fictional books.
//
// Deterministic SQL, like the rest of lib/scott/data/repository.js: no AI
// path reaches these functions, and every write goes through
// validateJournal first. A journal that does not balance is refused rather
// than corrected, because a ledger that silently posts a difference to
// suspense is a ledger with a number in it nobody can explain.
//
// This file deliberately holds no clearance logic. Filtering happens in
// lib/scott/finance/reports.js, against the domain on each account, using
// the same predicate every other Scott surface uses. A repository that
// also decided who may see what would be a second access model.

const db = require('../../../db/pool');
const ledger = require('./ledger');

// ------------------------------------------------------------
// READS
// ------------------------------------------------------------
// One query returns every posting. The whole fictional ledger is a few
// hundred rows and every report needs the same lines, so fetching once and
// projecting many times is both simpler and faster than a query per report.
async function getJournalLines() {
  const { rows } = await db.query(
    `SELECT l.account_code, l.debit_pence, l.credit_pence,
            j.id AS journal_id, j.entry_date, j.source, j.memo, j.source_ref, j.posted_by
       FROM scott_fin_journal_lines l
       JOIN scott_fin_journals j ON j.id = l.journal_id
      ORDER BY j.entry_date, j.id, l.id`
  );
  return rows.map((r) => ({
    journalId: r.journal_id,
    accountCode: r.account_code,
    debitPence: Number(r.debit_pence),
    creditPence: Number(r.credit_pence),
    date: r.entry_date instanceof Date ? r.entry_date.toISOString().slice(0, 10) : String(r.entry_date).slice(0, 10),
    source: r.source,
    memo: r.memo,
    sourceRef: r.source_ref,
    postedBy: r.posted_by
  }));
}

async function getJournals({ limit = 60 } = {}) {
  const { rows } = await db.query(
    `SELECT j.id, j.entry_date, j.memo, j.source, j.source_ref, j.posted_by, j.posted_by_persona, j.created_at,
            COALESCE(SUM(l.debit_pence), 0) AS total_pence
       FROM scott_fin_journals j
       LEFT JOIN scott_fin_journal_lines l ON l.journal_id = j.id
      GROUP BY j.id
      ORDER BY j.entry_date DESC, j.id DESC
      LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    date: String(r.entry_date instanceof Date ? r.entry_date.toISOString().slice(0, 10) : r.entry_date).slice(0, 10),
    memo: r.memo,
    source: r.source,
    sourceRef: r.source_ref,
    postedBy: r.posted_by,
    postedByPersona: r.posted_by_persona,
    totalPence: Number(r.total_pence),
    createdAt: r.created_at
  }));
}

function mapDocument(r) {
  const d = (v) => String(v instanceof Date ? v.toISOString().slice(0, 10) : v).slice(0, 10);
  return {
    id: r.id,
    kind: r.kind,
    ref: r.doc_ref,
    party: r.party,
    description: r.description,
    accountCode: r.account_code,
    documentDate: d(r.document_date),
    dueDate: d(r.due_date),
    netPence: Number(r.net_pence),
    vatPence: Number(r.vat_pence),
    grossPence: Number(r.gross_pence),
    paidPence: Number(r.paid_pence),
    status: r.status,
    journalId: r.journal_id,
    createdBy: r.created_by
  };
}

async function getDocuments({ kind = null, status = null, limit = 200 } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM scott_fin_documents
      WHERE ($1::text IS NULL OR kind = $1)
        AND ($2::text IS NULL OR status = $2)
      ORDER BY due_date ASC, id ASC
      LIMIT $3`,
    [kind, status, limit]
  );
  return rows.map(mapDocument);
}

async function getBankTransactions({ limit = 200 } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM scott_fin_bank_transactions ORDER BY txn_date DESC, id DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    bankCode: r.bank_code,
    date: String(r.txn_date instanceof Date ? r.txn_date.toISOString().slice(0, 10) : r.txn_date).slice(0, 10),
    description: r.description,
    amountPence: Number(r.amount_pence),
    hint: r.hint,
    matchedJournalId: r.matched_journal_id,
    matchedBy: r.matched_by,
    matchedAt: r.matched_at
  }));
}

async function isSeeded() {
  const { rows } = await db.query('SELECT 1 FROM scott_fin_journals LIMIT 1');
  return rows.length > 0;
}

async function nextDocumentRef(kind) {
  const prefix = kind === 'sales' ? 'INV-26' : 'BILL-26';
  const { rows } = await db.query(
    `SELECT doc_ref FROM scott_fin_documents WHERE kind = $1 AND doc_ref LIKE $2
      ORDER BY doc_ref DESC LIMIT 1`,
    [kind, `${prefix}%`]
  );
  const last = rows.length ? parseInt(String(rows[0].doc_ref).slice(prefix.length), 10) : (kind === 'sales' ? 1000 : 2000);
  return `${prefix}${Number.isFinite(last) ? last + 1 : 1001}`;
}

// ------------------------------------------------------------
// WRITES
// ------------------------------------------------------------
// Every write is one transaction. A journal whose header committed and
// whose lines did not would be an unbalanced ledger that no validation
// could catch afterwards, because the invalid state would already be the
// stored state.
async function postJournal(journal, { postedBy = 'system', personaId = null, client = null } = {}) {
  const check = ledger.validateJournal(journal);
  if (!check.ok) {
    const err = new Error(check.errors.join(' '));
    err.validation = check.errors;
    throw err;
  }
  const run = async (c) => {
    const { rows } = await c.query(
      `INSERT INTO scott_fin_journals (entry_date, memo, source, source_ref, posted_by, posted_by_persona)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [journal.date, journal.memo, journal.source, journal.sourceRef || null, postedBy, personaId]
    );
    const id = rows[0].id;
    for (const l of journal.lines) {
      await c.query(
        `INSERT INTO scott_fin_journal_lines (journal_id, account_code, debit_pence, credit_pence)
         VALUES ($1, $2, $3, $4)`,
        [id, l.accountCode, l.debitPence || 0, l.creditPence || 0]
      );
    }
    return id;
  };
  if (client) return run(client);
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    const id = await run(c);
    await c.query('COMMIT');
    return id;
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

// A document and the journal that recognises it are created together or
// not at all. An invoice on the sales ledger with no posting behind it is
// exactly the inconsistency this whole design exists to prevent.
async function createDocumentWithJournal(doc, journal, { postedBy = 'system', personaId = null } = {}) {
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    const journalId = await postJournal(journal, { postedBy, personaId, client: c });
    const { rows } = await c.query(
      `INSERT INTO scott_fin_documents
         (kind, doc_ref, party, description, account_code, document_date, due_date,
          net_pence, vat_pence, gross_pence, paid_pence, status, journal_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [doc.kind, doc.ref, doc.party, doc.description || '', doc.accountCode, doc.documentDate, doc.dueDate,
        doc.netPence, doc.vatPence || 0, doc.grossPence, doc.paidPence || 0, doc.status || 'open', journalId, postedBy]
    );
    await c.query('COMMIT');
    return mapDocument(rows[0]);
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

// Explaining a bank line: post the journal that accounts for it and record
// the match in the same transaction. A line marked reconciled against a
// journal that failed to post would say the books are explained when they
// are not, which is the class of untruth this codebase keeps designing out.
async function categoriseBankTransaction(txnId, journal, { postedBy = 'system', personaId = null } = {}) {
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    // Re-read inside the transaction and refuse a line somebody else has
    // already explained, rather than posting a second journal for the same
    // movement. Two people reconciling at once is ordinary, and the
    // duplicate would be real money counted twice.
    const { rows: existing } = await c.query(
      'SELECT id, matched_journal_id FROM scott_fin_bank_transactions WHERE id = $1 FOR UPDATE',
      [txnId]
    );
    if (!existing.length) {
      await c.query('ROLLBACK');
      return { ok: false, reason: 'not_found' };
    }
    if (existing[0].matched_journal_id) {
      await c.query('ROLLBACK');
      return { ok: false, reason: 'already_matched' };
    }
    const journalId = await postJournal(journal, { postedBy, personaId, client: c });
    await c.query(
      `UPDATE scott_fin_bank_transactions
          SET matched_journal_id = $1, matched_by = $2, matched_at = NOW()
        WHERE id = $3`,
      [journalId, postedBy, txnId]
    );
    await c.query('COMMIT');
    return { ok: true, journalId };
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
}

// A document with no journal of its own. Used only by the seed, where the
// control accounts were posted in summary from the management accounts and
// these are the analysis behind them: posting each one again would count
// the same debtor twice. Anything created through the workspace uses
// createDocumentWithJournal, so nothing a user does can leave a document
// without a posting behind it.
async function insertDocument(doc) {
  const { rows } = await db.query(
    `INSERT INTO scott_fin_documents
       (kind, doc_ref, party, description, account_code, document_date, due_date,
        net_pence, vat_pence, gross_pence, paid_pence, status, journal_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL,$13)
     ON CONFLICT (doc_ref) DO NOTHING
     RETURNING *`,
    [doc.kind, doc.ref, doc.party, doc.description || '', doc.accountCode, doc.documentDate, doc.dueDate,
      doc.netPence, doc.vatPence || 0, doc.grossPence, doc.paidPence || 0, doc.status || 'open', 'opening records']
  );
  return rows.length ? mapDocument(rows[0]) : null;
}

async function insertBankTransaction(txn) {
  const { rows } = await db.query(
    `INSERT INTO scott_fin_bank_transactions (bank_code, txn_date, description, amount_pence, hint, matched_journal_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [txn.bankCode || '1200', txn.date, txn.description, txn.amountPence, txn.hint || '', txn.matchedJournalId || null]
  );
  return rows[0].id;
}

module.exports = {
  getJournalLines,
  getJournals,
  getDocuments,
  getBankTransactions,
  isSeeded,
  nextDocumentRef,
  postJournal,
  createDocumentWithJournal,
  categoriseBankTransaction,
  insertBankTransaction,
  insertDocument
};
