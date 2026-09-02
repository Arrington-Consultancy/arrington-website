// Scott AI Demonstration - what each Banking & Accounting screen shows,
// for the person actually looking at it.
//
// The route stays thin and this decides everything, for one reason worth
// stating: every figure on every tab has to pass the same clearance test,
// and a route that assembled thirteen screens inline would eventually
// assemble one of them slightly differently. Here there is a single
// `canSee` predicate threaded through every projection, and the reports
// module applies it BEFORE totalling rather than after.

const reports = require('./reports');
const state = require('./state');
const ledger = require('./ledger');
const { ACCOUNTS, BANK_ACCOUNT_CODES, account } = require('./chartOfAccounts');

// The tabs, in display order. `needs` is the domain a reader must hold for
// the tab to exist at all: a tab that renders as a refusal notice still
// tells you the area exists and roughly what is in it, so a reader who
// holds none of it simply does not get the tab.
const TABS = [
  { id: 'overview', label: 'Overview', needs: ['finance_full', 'finance_summary_ops', 'invoice_status'] },
  { id: 'bank-accounts', label: 'Bank Accounts', needs: ['finance_full'] },
  { id: 'transactions', label: 'Transactions', needs: ['finance_full'] },
  { id: 'reconciliation', label: 'Reconciliation', needs: ['finance_full'] },
  { id: 'sales', label: 'Sales & Invoices', needs: ['invoice_status'] },
  { id: 'bills', label: 'Bills & Expenses', needs: ['finance_full'] },
  { id: 'cashflow', label: 'Cashflow', needs: ['finance_full'] },
  { id: 'profit-and-loss', label: 'Profit & Loss', needs: ['finance_full'] },
  { id: 'balance-sheet', label: 'Balance Sheet', needs: ['finance_full', 'director_position'] },
  { id: 'vat', label: 'VAT', needs: ['finance_full'] },
  { id: 'reports', label: 'Reports', needs: ['finance_full'] },
  { id: 'nigel', label: 'Finance AI', needs: ['finance_full', 'finance_summary_ops', 'invoice_status'] },
  { id: 'audit', label: 'Approvals & Audit', needs: ['finance_full', 'invoice_status'] }
];

function visibleTabs(canSee) {
  return TABS.filter((t) => t.needs.some((d) => canSee(d)));
}

function isVisibleTab(id, canSee) {
  return visibleTabs(canSee).some((t) => t.id === id);
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthLabel(m) {
  const [y, mm] = String(m).split('-');
  return `${MONTH_NAMES[Number(mm) - 1]} ${y}`;
}

function ledgerMonths(lines) {
  return [...new Set(lines.map((l) => String(l.date).slice(0, 7)))]
    .filter((m) => m >= '2026-04')
    .sort();
}

// The accounts a reader may post to. Handed to the invoice, bill, journal
// and categorisation forms, so a select box can never offer an account the
// person is not cleared to touch, and the API checks the same thing again
// because a select box is a layout choice and not an access decision.
// `requireVisible: false` for the sales-invoice form, matching the rule in
// routes/scott.js: a person who may raise an invoice needs a service line
// to code it to, and coding to an account is not reading its balance. Any
// other form only ever offers accounts the reader can also see, because
// the same person is being shown the position they are posting into.
function postableAccounts(canSee, kinds, { requireVisible = true } = {}) {
  return ACCOUNTS.filter((a) => kinds.includes(a.group) && (!requireVisible || canSee(a.domain)));
}

function build(tab, { canSee, persona, canAct }) {
  const { lines, documents, bank } = state.snapshot();
  const on = state.asOf();
  const month = state.latestMonth();
  const months = ledgerMonths(lines);
  const vm = {
    tab,
    asOf: on,
    latestMonth: month,
    latestMonthLabel: monthLabel(month),
    tabs: visibleTabs(canSee),
    live: state.isLive(),
    fmt: ledger.formatGbp,
    monthLabel,
    accountName: (code) => (account(code) || {}).name || code
  };

  if (tab === 'overview') {
    if (canSee('finance_full')) {
      const pl = reports.profitAndLoss(lines, { from: `${month}-01`, to: `${month}-31`, canSeeDomain: canSee });
      const rec = reports.reconciliationSummary(bank, { canSeeDomain: canSee });
      vm.cash = {
        currentPence: reports.accountBalance(lines, '1200'),
        reservePence: reports.accountBalance(lines, '1210')
      };
      vm.pl = pl;
      vm.reconciliation = rec;
      vm.debtors = reports.agedAnalysis(documents, { asOf: on, kind: 'sales' });
      vm.creditors = reports.agedAnalysis(documents, { asOf: on, kind: 'purchase' });
      const q = state.lastCompleteQuarter(on);
      vm.vat = reports.vatReturn(lines, { from: q.from, to: q.to, canSeeDomain: canSee });
      vm.vatQuarter = q;
    } else if (canSee('invoice_status')) {
      // Chloe's overview is her own ledger and nothing else. Not a cut-down
      // version of Scott's with the numbers blanked: a different screen,
      // built from what she is actually responsible for.
      vm.debtors = reports.agedAnalysis(documents, { asOf: on, kind: 'sales' });
    } else if (canSee('finance_summary_ops')) {
      const dueSoon = documents.filter((d) => d.kind === 'purchase' && d.status !== 'paid');
      vm.paymentCapacity = {
        supplierPaymentsDue: dueSoon.length,
        clearToRelease: true,
        note: 'A yes or no on whether committed payments can go out. It deliberately carries no balance, no headroom and no borrowing position.'
      };
    }
  }

  if (tab === 'bank-accounts' && canSee('finance_full')) {
    vm.accounts = BANK_ACCOUNT_CODES.map((code) => {
      const a = account(code);
      const ledgerBalance = reports.accountBalance(lines, code);
      const statement = bank
        .filter((t) => t.bankCode === code)
        .reduce((s, t) => s + (t.matchedJournalId ? 0 : t.amountPence), 0);
      return {
        code,
        name: a.name,
        note: a.note || '',
        ledgerBalancePence: ledgerBalance,
        // The statement balance differs from the ledger by exactly the
        // lines nobody has explained yet. Shown as a real difference
        // rather than hidden, because that difference IS reconciliation.
        unexplainedPence: statement,
        statementBalancePence: ledgerBalance + statement
      };
    });
  }

  if (tab === 'transactions' && canSee('finance_full')) {
    vm.transactions = bank.slice(0, 100);
    vm.journals = lines;
  }

  if (tab === 'reconciliation' && canSee('finance_full')) {
    vm.summary = reports.reconciliationSummary(bank, { canSeeDomain: canSee });
    vm.unmatched = bank.filter((t) => !t.matchedJournalId);
    vm.matched = bank.filter((t) => t.matchedJournalId).slice(0, 25);
    // Split by direction rather than offering one list of everything.
    // Money leaving the bank is a cost and money arriving is income, so a
    // single list defaulting to "Sales - repairs and refresh" invited
    // somebody to book the water bill to turnover in front of a prospect.
    vm.costCategories = postableAccounts(canSee, ['direct_costs', 'overheads']);
    vm.incomeCategories = postableAccounts(canSee, ['turnover']);
  }

  if (tab === 'sales' && canSee('invoice_status')) {
    vm.aged = reports.agedAnalysis(documents, { asOf: on, kind: 'sales' });
    vm.invoices = documents.filter((d) => d.kind === 'sales');
    vm.incomeAccounts = postableAccounts(canSee, ['turnover'], { requireVisible: false });
    vm.canCreate = canAct('invoice_create');
  }

  if (tab === 'bills' && canSee('finance_full')) {
    vm.aged = reports.agedAnalysis(documents, { asOf: on, kind: 'purchase' });
    vm.bills = documents.filter((d) => d.kind === 'purchase');
    vm.costAccounts = postableAccounts(canSee, ['direct_costs', 'overheads']);
    vm.canRecord = canAct('bill_record');
    vm.canRequestPayment = canAct('payment_request');
  }

  if (tab === 'cashflow' && canSee('finance_full')) {
    vm.cashflow = reports.cashflowByMonth(lines, { canSeeDomain: canSee });
  }

  if (tab === 'profit-and-loss' && canSee('finance_full')) {
    vm.months = reports.monthlyProfitAndLoss(lines, { months, canSeeDomain: canSee });
    vm.year = reports.profitAndLoss(lines, { from: '2026-04-01', to: `${month}-31`, canSeeDomain: canSee });
  }

  if (tab === 'balance-sheet') {
    vm.balanceSheet = reports.balanceSheet(lines, { asOf: on, canSeeDomain: canSee });
  }

  if (tab === 'vat' && canSee('finance_full')) {
    const q = state.lastCompleteQuarter(on);
    const cur = state.quarterContaining(on);
    vm.quarter = q;
    vm.currentQuarter = cur;
    vm.ret = reports.vatReturn(lines, { from: q.from, to: q.to, canSeeDomain: canSee });
    vm.inProgress = reports.vatReturn(lines, { from: cur.from, to: on, canSeeDomain: canSee });
    vm.reservePence = reports.accountBalance(lines, '1210');
  }

  if (tab === 'reports' && canSee('finance_full')) {
    vm.trial = reports.trialBalance(lines, { asOf: on, canSeeDomain: canSee });
    vm.months = reports.monthlyProfitAndLoss(lines, { months, canSeeDomain: canSee });
    vm.canPostJournal = canAct('journal_post');
    vm.allAccounts = ACCOUNTS.filter((a) => canSee(a.domain));
  }

  if (tab === 'audit') {
    vm.recentJournals = null; // filled by the route, which owns database reads
  }

  return vm;
}

module.exports = { TABS, visibleTabs, isVisibleTab, build, monthLabel, postableAccounts };
