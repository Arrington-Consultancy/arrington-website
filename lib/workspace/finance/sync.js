// Arrington AI Workspace: finance sync orchestration.
//
// Ties the Xero client, token storage and repo together into one
// retrievable action, so routes/workspace.js has a single function to
// call and never handles a raw token itself. Read-only throughout:
// nothing here writes to Xero.

const repo = require('./repo');
const xero = require('./xeroClient');
const { encryptToken, decryptToken, tokenCryptoConfigured } = require('./tokenCrypto');
const { isConfigured } = require('./registry');

const PROVIDER = 'xero';

// A token due to expire within this window is refreshed before use,
// rather than being tried and failing mid-sync.
const REFRESH_SKEW_MS = 2 * 60 * 1000;

async function getValidAccessToken() {
  const tokens = await repo.getDecryptableTokens(PROVIDER);
  if (!tokens || !tokens.refresh_token_enc) return null;
  const expiresAt = tokens.access_token_expires_at ? new Date(tokens.access_token_expires_at) : null;
  const stillValid = expiresAt && (expiresAt.getTime() - Date.now()) > REFRESH_SKEW_MS && tokens.access_token_enc;
  if (stillValid) return decryptToken(tokens.access_token_enc);

  const refreshToken = decryptToken(tokens.refresh_token_enc);
  const fresh = await xero.refreshTokens(refreshToken);
  const newExpiresAt = new Date(Date.now() + (fresh.expires_in || 1800) * 1000);
  await repo.upsertAccount(PROVIDER, {
    status: 'configured',
    // Xero rotates the refresh token on every use; the new one must be
    // stored or the NEXT refresh fails with a reused-token error.
    refreshTokenEnc: encryptToken(fresh.refresh_token),
    accessTokenEnc: encryptToken(fresh.access_token),
    accessTokenExpiresAt: newExpiresAt
  });
  return fresh.access_token;
}

// The one entry point routes/workspace.js calls, either from the manual
// "Sync now" button or a future scheduled trigger. Returns a summary the
// route can turn into a response; never throws for an ordinary "not
// configured" or "not connected" state, only for a genuine unexpected
// failure while a sync was actually attempted.
async function syncFinance({ triggeredBy = 'system' } = {}) {
  if (!isConfigured(PROVIDER)) {
    return { outcome: 'skipped_not_configured', itemsWritten: 0, detail: 'XERO_CLIENT_ID / XERO_CLIENT_SECRET are not both set.' };
  }
  if (!tokenCryptoConfigured()) {
    return { outcome: 'skipped_not_configured', itemsWritten: 0, detail: 'WORKSPACE_FINANCE_TOKEN_KEY is not set; cannot decrypt stored tokens.' };
  }
  const state = await repo.accountState();
  if (state.status !== 'configured') {
    return { outcome: 'skipped_not_configured', itemsWritten: 0, detail: 'No Xero organisation has been connected yet (Tom has not completed the OAuth consent screen).' };
  }

  const runId = await repo.startSyncRun(PROVIDER);
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) throw new Error('No stored Xero tokens to use; the connection may have been revoked.');

    // accountState() does not expose tenant_id (the page view has no use
    // for it), so read the row directly for the sync's own use.
    const db = require('../../../db/pool');
    const { rows } = await db.query('SELECT tenant_id, bank_account_id, bank_account_name FROM workspace_finance_accounts WHERE provider = $1', [PROVIDER]);
    const row = rows[0];
    if (!row || !row.tenant_id) throw new Error('No Xero organisation is recorded on the connection row.');

    let bankAccountId = row.bank_account_id;
    let bankAccountName = row.bank_account_name;
    if (!bankAccountId) {
      const bankAccount = await xero.getBankAccount({ accessToken, tenantId: row.tenant_id });
      if (!bankAccount) throw new Error('No bank account was found in the connected Xero organisation.');
      bankAccountId = bankAccount.AccountID;
      bankAccountName = bankAccount.Name;
    }

    const [balancePence, transactions] = await Promise.all([
      xero.getBankBalance({ accessToken, tenantId: row.tenant_id, bankAccountName }),
      xero.getBankTransactions({ accessToken, tenantId: row.tenant_id, bankAccountId })
    ]);

    const itemsWritten = await repo.upsertTransactions(PROVIDER, transactions);
    await repo.upsertAccount(PROVIDER, {
      status: 'configured',
      bankAccountId,
      bankAccountName,
      currentBalancePence: balancePence,
      balanceAsOf: new Date(),
      lastSyncAt: new Date(),
      lastSyncOutcome: 'ok',
      lastError: ''
    });
    await repo.syncFinanceSummaryRecord(PROVIDER);
    await repo.finishSyncRun(runId, { outcome: 'ok', itemsWritten, detail: `${transactions.length} transaction(s) retrieved.` });
    return { outcome: 'ok', itemsWritten, detail: `${transactions.length} transaction(s) retrieved.` };
  } catch (err) {
    await repo.upsertAccount(PROVIDER, {
      status: 'configured',
      lastSyncAt: new Date(),
      lastSyncOutcome: 'failed',
      lastError: String(err.message || err).slice(0, 500)
    });
    await repo.syncFinanceSummaryRecord(PROVIDER);
    await repo.finishSyncRun(runId, { outcome: 'failed', itemsWritten: 0, detail: String(err.message || err).slice(0, 500) });
    return { outcome: 'failed', itemsWritten: 0, detail: String(err.message || err) };
  }
}

module.exports = { PROVIDER, getValidAccessToken, syncFinance };
