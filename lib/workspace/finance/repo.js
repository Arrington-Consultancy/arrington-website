// Arrington AI Workspace: finance data access.
//
// Clearance-blind like lib/workspace/repo.js and lib/workspace/social/repo.js:
// callers apply the permission legs. What this file DOES own is the
// honesty rules that must not depend on a caller remembering them, and
// the bridge that lets a BOUNDED, filtered finance summary reach AI
// context through the same mechanism as every other record
// (workspace_records / lib/workspace/lanes.js / lib/workspace/clearance.js)
// rather than a second, less-tested filtering path.

const db = require('../../../db/pool');
const workspaceRepo = require('../repo');
const { PROVIDER_IDS, PROVIDERS, isConfigured } = require('./registry');

const FINANCE_SUMMARY_RECORD_KEY = 'finance.xero_summary';
// Bounded on purpose: the summary record feeds an AI prompt
// (MAX_CONTEXT_RECORDS in lib/workspace/orchestrator.js is 24 total
// across every source class), not a ledger export. The Finance page
// itself reads workspace_finance_transactions directly and is not
// bounded this way.
const SUMMARY_TRANSACTION_COUNT = 15;

// The connector state, always present even when never configured, so
// the page is one view rather than "here if connected, absent if not".
async function accountState(env = process.env, now = new Date()) {
  const providerId = 'xero';
  const provider = PROVIDERS[providerId];
  const { rows } = await db.query('SELECT * FROM workspace_finance_accounts WHERE provider = $1', [providerId]);
  const row = rows[0] || null;
  const configured = isConfigured(providerId, env);
  return {
    provider: providerId,
    name: provider.name,
    api: provider.api,
    setupNote: provider.setupNote,
    readScopes: provider.readScopes,
    supports: provider.supports,
    configured,
    status: configured ? (row ? row.status : 'configured') : 'not_configured',
    tenantName: row ? row.tenant_name : '',
    bankAccountName: row ? row.bank_account_name : '',
    currency: row ? row.currency : '',
    currentBalancePence: row ? row.current_balance_pence : null,
    balanceAsOf: row ? row.balance_as_of : null,
    connectedAt: row ? row.connected_at : null,
    connectedBy: row ? row.connected_by : '',
    lastSyncAt: row ? row.last_sync_at : null,
    lastSyncOutcome: row ? row.last_sync_outcome : 'never',
    lastError: row ? row.last_error : '',
    freshness: connectorFreshness(row, configured, now)
  };
}

// Same rule as workspace_social_accounts: a credential is not a
// retrieval. A configured connector that has never returned data reads
// as "connected, never retrieved". A failed attempt outranks the
// timestamp of the last good one, because the balance on screen is then
// of unknown currency.
function connectorFreshness(row, configured, now = new Date()) {
  if (!configured) return { state: 'not_connected', ageHours: null };
  if (!row || row.last_sync_outcome === 'never' || !row.last_sync_at) {
    return { state: 'never_retrieved', ageHours: null };
  }
  if (row.last_sync_outcome === 'failed') return { state: 'sync_failed', ageHours: null };
  const ageHours = Math.floor((now - new Date(row.last_sync_at)) / 3600000);
  if (row.last_sync_outcome === 'partial') return { state: 'partial', ageHours };
  if (ageHours > (row.stale_after_hours || 24)) return { state: 'stale', ageHours };
  return { state: 'fresh', ageHours };
}

async function upsertAccount(providerId, fields) {
  const { rows } = await db.query(
    `INSERT INTO workspace_finance_accounts
       (provider, status, tenant_id, tenant_name, bank_account_id, bank_account_name, currency,
        refresh_token_enc, access_token_enc, access_token_expires_at,
        current_balance_pence, balance_as_of, connected_at, connected_by,
        last_sync_at, last_sync_outcome, last_error, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
     ON CONFLICT (provider) DO UPDATE SET
       status = EXCLUDED.status,
       tenant_id = EXCLUDED.tenant_id,
       tenant_name = EXCLUDED.tenant_name,
       bank_account_id = EXCLUDED.bank_account_id,
       bank_account_name = EXCLUDED.bank_account_name,
       currency = EXCLUDED.currency,
       refresh_token_enc = CASE WHEN EXCLUDED.refresh_token_enc = '' THEN workspace_finance_accounts.refresh_token_enc ELSE EXCLUDED.refresh_token_enc END,
       access_token_enc = CASE WHEN EXCLUDED.access_token_enc = '' THEN workspace_finance_accounts.access_token_enc ELSE EXCLUDED.access_token_enc END,
       access_token_expires_at = COALESCE(EXCLUDED.access_token_expires_at, workspace_finance_accounts.access_token_expires_at),
       current_balance_pence = COALESCE(EXCLUDED.current_balance_pence, workspace_finance_accounts.current_balance_pence),
       balance_as_of = COALESCE(EXCLUDED.balance_as_of, workspace_finance_accounts.balance_as_of),
       connected_at = COALESCE(workspace_finance_accounts.connected_at, EXCLUDED.connected_at),
       connected_by = CASE WHEN EXCLUDED.connected_by = '' THEN workspace_finance_accounts.connected_by ELSE EXCLUDED.connected_by END,
       last_sync_at = COALESCE(EXCLUDED.last_sync_at, workspace_finance_accounts.last_sync_at),
       last_sync_outcome = EXCLUDED.last_sync_outcome,
       last_error = EXCLUDED.last_error,
       updated_at = NOW()
     RETURNING *`,
    [
      providerId, fields.status || 'configured', fields.tenantId || '', fields.tenantName || '',
      fields.bankAccountId || '', fields.bankAccountName || '', fields.currency || '',
      fields.refreshTokenEnc || '', fields.accessTokenEnc || '', fields.accessTokenExpiresAt || null,
      fields.currentBalancePence ?? null, fields.balanceAsOf || null,
      fields.connectedAt || null, fields.connectedBy || '',
      fields.lastSyncAt || null, fields.lastSyncOutcome || 'never', fields.lastError || ''
    ]
  );
  return rows[0];
}

// Disconnecting forgets the credential and the balance, but keeps the
// transaction history that has already been synced: the ledger is a
// factual record of what happened, not a live credential.
async function disconnectAccount(providerId, disconnectedBy) {
  await db.query(
    `UPDATE workspace_finance_accounts
     SET status = 'revoked', refresh_token_enc = '', access_token_enc = '', access_token_expires_at = NULL,
         last_error = '', updated_at = NOW()
     WHERE provider = $1`,
    [providerId]
  );
  await workspaceRepo.addActivity({
    actor: disconnectedBy,
    eventType: 'finance_disconnected',
    summary: `Disconnected the ${providerId} finance connector. Synced transaction history was kept; the credential was not.`
  });
}

async function getDecryptableTokens(providerId) {
  const { rows } = await db.query(
    'SELECT refresh_token_enc, access_token_enc, access_token_expires_at FROM workspace_finance_accounts WHERE provider = $1',
    [providerId]
  );
  return rows[0] || null;
}

// from/to (Date or 'YYYY-MM-DD') filter by txn_date, inclusive, for the
// accounting summary below. Without them this is the plain recent-ledger
// list the Finance page always showed. With them, the cap is higher: a
// category summary over a real period needs more than the ledger's
// usual page of 100.
async function listTransactions({ limit = 100, offset = 0, from = null, to = null } = {}) {
  const clauses = [];
  const params = [];
  if (from) { params.push(from); clauses.push(`txn_date >= $${params.length}`); }
  if (to) { params.push(to); clauses.push(`txn_date <= $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const cap = (from || to) ? 5000 : 500;
  params.push(Math.min(limit, cap));
  params.push(Math.max(offset, 0));
  const { rows } = await db.query(
    `SELECT * FROM workspace_finance_transactions ${where} ORDER BY txn_date DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

// Upserts a batch, deduplicated on (provider, external_id): a re-sync
// never doubles the ledger. Returns the count actually written.
async function upsertTransactions(providerId, transactions) {
  let written = 0;
  for (const t of transactions) {
    const { rowCount } = await db.query(
      `INSERT INTO workspace_finance_transactions
         (provider, external_id, txn_date, amount_pence, direction, payee, reference, category, is_recurring, recurring_group, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (provider, external_id) DO UPDATE SET
         txn_date = EXCLUDED.txn_date, amount_pence = EXCLUDED.amount_pence, direction = EXCLUDED.direction,
         payee = EXCLUDED.payee, reference = EXCLUDED.reference, category = EXCLUDED.category,
         is_recurring = EXCLUDED.is_recurring, recurring_group = EXCLUDED.recurring_group, synced_at = NOW()`,
      [
        providerId, t.externalId, t.date, t.amountPence, t.direction,
        t.payee || '', t.reference || '', t.category || '', !!t.isRecurring, t.recurringGroup || ''
      ]
    );
    written += rowCount;
  }
  return written;
}

async function startSyncRun(providerId) {
  const { rows } = await db.query('INSERT INTO workspace_finance_sync_runs (provider) VALUES ($1) RETURNING id', [providerId]);
  return rows[0].id;
}

async function finishSyncRun(id, { outcome, itemsWritten = 0, detail = '' }) {
  await db.query(
    'UPDATE workspace_finance_sync_runs SET finished_at = NOW(), outcome = $2, items_written = $3, detail = $4 WHERE id = $1',
    [id, outcome, itemsWritten, detail]
  );
}

async function recentSyncRuns(limit = 20) {
  const { rows } = await db.query('SELECT * FROM workspace_finance_sync_runs ORDER BY id DESC LIMIT $1', [Math.min(limit, 100)]);
  return rows;
}

function formatPence(pence) {
  if (pence === null || pence === undefined) return 'unknown';
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  return `${sign}£${(abs / 100).toFixed(2)}`;
}

// The bridge into AI context. Regenerates the ONE bounded finance record
// in workspace_records after every sync, so Ask Ruth draws on the same
// filtered, freshness-tracked mechanism as every other source, rather
// than a parallel path that would need its own testing. Deliberately a
// rolled-up summary (balance + the most recent SUMMARY_TRANSACTION_COUNT
// transactions), never the full ledger: MAX_CONTEXT_RECORDS in the
// orchestrator caps total records per answer, and a raw ledger dump is
// not the right shape for a prompt anyway.
//
// sensitivity is always 'confidential', the narrowest tier the workspace
// has, and is not a parameter: real banking data does not get a caller-
// chosen sensitivity.
async function syncFinanceSummaryRecord(providerId, now = new Date()) {
  const [state, recent] = await Promise.all([
    accountState(process.env, now),
    listTransactions({ limit: SUMMARY_TRANSACTION_COUNT })
  ]);
  if (state.status !== 'configured' && state.lastSyncOutcome === 'never') {
    // Nothing has ever synced: no summary record to write. An absent
    // record is itself the honest state (buildLaneContext simply has
    // nothing to offer), rather than writing a placeholder that then
    // needs its own "empty" wording kept in sync with the real UI.
    return null;
  }
  const lines = [
    `Provider: ${state.name} (${providerId}). Status: ${state.status}. Last sync: ${state.lastSyncOutcome}${state.lastError ? ` (${state.lastError})` : ''}.`,
    `Current balance: ${formatPence(state.currentBalancePence)}${state.balanceAsOf ? ` as of ${new Date(state.balanceAsOf).toISOString().slice(0, 10)}` : ''}.`,
    recent.length ? `Most recent ${recent.length} transaction(s):` : 'No transactions have been synced yet.'
  ];
  recent.forEach((t) => {
    const amount = `${t.direction === 'in' ? '+' : '-'}${formatPence(t.amount_pence)}`;
    lines.push(`${t.txn_date.toISOString ? t.txn_date.toISOString().slice(0, 10) : t.txn_date} ${amount} ${t.payee || '(no payee recorded)'}${t.reference ? ` ref: ${t.reference}` : ''}${t.category ? ` [${t.category}]` : ''}${t.is_recurring ? ' (recurring)' : ''}`);
  });
  const outcome = state.lastSyncOutcome === 'failed' ? 'failed' : state.lastSyncOutcome === 'ok' ? 'ok' : 'partial';
  return workspaceRepo.upsertRecord({
    record_key: FINANCE_SUMMARY_RECORD_KEY,
    source_class: 'finance',
    authority_class: 'evidence',
    doc_status: outcome === 'failed' ? 'unverified' : 'current',
    sensitivity: 'confidential',
    title: 'Business banking: current balance and recent transactions',
    source_ref: `${state.name}, ${state.tenantName || 'organisation not yet identified'}`,
    body: lines.join('\n'),
    as_of: state.balanceAsOf || null,
    synced_at: state.lastSyncAt || now,
    stale_after_days: 1,
    sync_outcome: outcome,
    meta: { provider: providerId }
  });
}

module.exports = {
  FINANCE_SUMMARY_RECORD_KEY,
  SUMMARY_TRANSACTION_COUNT,
  accountState,
  connectorFreshness,
  upsertAccount,
  disconnectAccount,
  getDecryptableTokens,
  listTransactions,
  upsertTransactions,
  startSyncRun,
  finishSyncRun,
  recentSyncRuns,
  formatPence,
  syncFinanceSummaryRecord
};
