// Scott AI Demonstration — deep company brain (v0.2 data layer).
//
// Transcribed 29/08/2026 from the current Drive controlled evidence:
// 07A Finance & Accounts, 07B People & HR, 07F Operations/Workflow/
// Suppliers/Stock, 07I Stock & Supply Live Feed, 07N Quality Control/
// Rework/Defects, 07S Corporate/Director/Business History, 07U Purchase
// Orders/Goods Receipt/Supplier Invoice Ledger, 07V Job Execution/WIP/Cost
// Ledger. See config.js SNAPSHOT_VERSION/SNAPSHOT_DATE for the version this
// belongs to.
//
// SCOPE HONESTY: this is a deliberately prioritised subset, not a full
// transcription of all twenty-two 07-series domains. It covers the
// financial/corporate/job/quality/purchasing/HR/stock evidence needed to
// answer the named 07Q access-test-cases and demonstrate real
// cross-functional connection (a late PO affecting a specific job's
// promise, a quality hold blocking a specific return, Ravi's leave
// reducing capacity for specific booked jobs). Complaints, Reviews,
// Marketing, Assets/Maintenance, Premises, Continuity, IT-device detail
// beyond clearance.js's persona model, and several other 07-series
// domains (07C/07D/07E/07G/07H/07J/07K/07L/07M/07O/07P/07R/07T in full)
// were read into this session but not yet transcribed into structured
// data here — flagged honestly in the final report as remaining work,
// not silently dropped.
//
// EVERY RECORD CARRIES A domain FIELD matching lib/scott/clearance.js's
// domain codes, so the same clearance.filterByClearance() call gates this
// data everywhere it is used (dashboard cards, AI context, search)
// without a second access-control implementation to keep in sync.

const { SNAPSHOT_LABEL } = require('./config');

// ------------------------------------------------------------
// 07S — Corporate, Director & Business History
// ------------------------------------------------------------
const CORPORATE_PROFILE = {
  domain: 'director_position',
  legalName: "SCOTT'S ARMCHAIR & KNITTING SERVICE LTD",
  companyType: 'UK private company limited by shares (fictional demonstration record)',
  companyNumber: '10648271',
  incorporationDate: '2017-03-14',
  registeredOffice: 'Unit 4, Brunel Craft Estate, Newton Abbot, Devon, TQ12 4SA',
  accountingReferenceDate: '31 March',
  shareCapital: '100 ordinary shares of £1 each',
  shareholder: 'Scott Mercer, 100 ordinary shares, 100% ownership',
  directors: 'Scott Mercer, sole director',
  vatRegistered: true,
  payeEmployer: true
};

const DIRECTOR_POSITION = {
  domain: 'director_position',
  role: 'Founder, sole director, owner-manager and sole ordinary shareholder',
  salaryAnnualGbp: 12570,
  salaryMonthlyGbp: 1047.50,
  employerPensionMonthlyGbp: 500,
  employerPensionYtdGbp: 2500,
  possibleYearEndPensionTopUpGbp: 5000,
  dividends: {
    fy2425Gbp: 28000,
    fy2526Gbp: 36000,
    fy2627PaidToDateGbp: 18000,
    fy2627Payments: [
      { date: '2026-05-22', amountGbp: 10000 },
      { date: '2026-08-14', amountGbp: 8000 }
    ],
    furtherDividendCommitted: false,
    note: 'Owner intention is to review another distribution only after September management accounts, VAT, insurance renewal, debtor position and autumn cash forecast are known.'
  },
  directorsLoanAccount: {
    signConvention: 'positive/credit means the company owes Scott Mercer',
    currentBalanceGbp: 9850,
    asOf: '2026-08-28',
    ledger: [
      { date: '2025-04-01', event: 'opening balance', movementGbp: 18600, balanceGbp: 18600 },
      { date: '2025-05-10', event: 'company repayment to Scott', movementGbp: -5000, balanceGbp: 13600 },
      { date: '2025-09-15', event: 'Scott advanced cash during autumn cash squeeze', movementGbp: 12000, balanceGbp: 25600 },
      { date: '2025-12-20', event: 'company repayment to Scott', movementGbp: -8000, balanceGbp: 17600 },
      { date: '2026-03-31', event: 'approved director expenses not yet reimbursed', movementGbp: 1450, balanceGbp: 19050 },
      { date: '2026-04-30', event: 'company repayment to Scott', movementGbp: -4000, balanceGbp: 15050 },
      { date: '2026-06-30', event: 'personal item accidentally paid on company card, transferred to DLA', movementGbp: -1200, balanceGbp: 13850 },
      { date: '2026-08-15', event: 'company repayment to Scott', movementGbp: -4000, balanceGbp: 9850 }
    ]
  }
};

const BORROWING_SCHEDULE = [
  { domain: 'director_position', kind: 'overdraft_facility', lender: 'fictional bank', limitGbp: 15000, drawnGbp: 0, purpose: 'short-term working-capital contingency only' },
  {
    domain: 'director_position', kind: 'term_loan', lender: 'South West Business Bank (fictional)',
    originalAmountGbp: 35000, advancedDate: '2024-04-01', termMonths: 48, interestRatePct: 6.2,
    monthlyPaymentGbp: 826, outstandingPrincipalGbp: 18400, asOf: '2026-08-28',
    nextPaymentDate: '2026-09-01', purpose: 'workshop fit-out and equipment improvements'
  },
  {
    domain: 'director_position', kind: 'equipment_finance', lender: 'fictional equipment finance provider',
    asset: 'foam saw / compressor', outstandingGbp: 6960, monthlyPaymentGbp: 435,
    nextPaymentDate: '2026-09-12', finalPaymentDate: '2027-12', arrears: false
  }
];

const TAX_POSITION = {
  domain: 'director_position',
  vat: { quarterEnd: '2026-09-30', workingEstimateGbp: 8750, filingPaymentDeadline: '2026-11-07' },
  corporationTax: { workingProvisionGbp: 13200, note: 'fictional estimate, not a filed liability', paymentTargetForFYEndingMar2026: '2027-01-01' },
  payeNicWorkingCreditorGbp: 5980,
  pensionWorkingCreditorGbp: 1360,
  accountant: {
    firm: 'Westbridge & Cole Chartered Accountants Ltd', office: 'Torquay, Devon',
    contact: 'Emma Trelawney ACA', relationshipStart: '2021-04'
  }
};

// ------------------------------------------------------------
// 07A — Finance & Accounts
// ------------------------------------------------------------
const FINANCE_SUMMARY = {
  domain: 'finance_full',
  financialYearEnd: '31 March',
  annualSalesRunRateGbp: 550000,
  currentYearTargetTurnoverGbp: 565000,
  currentYearTargetOperatingProfitGbp: 72000,
  monthlyManagementAccounts: [
    { month: '2026-04', revenueGbp: 41800, directCostsGbp: 20500, grossProfitGbp: 21300, overheadsGbp: 15800, operatingProfitGbp: 5500 },
    { month: '2026-05', revenueGbp: 43200, directCostsGbp: 21100, grossProfitGbp: 22100, overheadsGbp: 16050, operatingProfitGbp: 6050 },
    { month: '2026-06', revenueGbp: 45100, directCostsGbp: 21900, grossProfitGbp: 23200, overheadsGbp: 16200, operatingProfitGbp: 7000 },
    { month: '2026-07', revenueGbp: 46800, directCostsGbp: 22500, grossProfitGbp: 24300, overheadsGbp: 16550, operatingProfitGbp: 7750 },
    { month: '2026-08', forecast: true, revenueGbp: 47600, directCostsGbp: 23600, grossProfitGbp: 24000, overheadsGbp: 18100, operatingProfitGbp: 5900, note: 'August margin pressure mainly overtime, two rework jobs, higher collection mileage' }
  ],
  cash: {
    bankBalanceGbp: 41800, minimumPreferredBufferGbp: 25000, vatReserveGbp: 9400,
    expectedSeptemberPayrollGbp: 19200, insuranceRenewalDate: '2026-09-18', insuranceRenewalGbp: 3850,
    workshopRentMonthlyGbp: 4650, vanFixedCostMonthlyGbp: 1420
  },
  debtors: {
    totalGbp: 31400,
    currentGbp: 18900, overdue1to30Gbp: 5300, overdue31to60Gbp: 5100, overdueOver60Gbp: 2100,
    largest: { customer: 'Moorland Holiday Lets', amountGbp: 3600, daysOverdue: 43 },
    secondLargest: { customer: 'Devon Hearth Café Group', amountGbp: 1950, daysOverdue: 36 },
    targetOver30Gbp: 5000
  },
  creditors: {
    totalGbp: 18600, due7DaysGbp: 4900, due30DaysGbp: 13700,
    committedNotInvoicedGbp: 2750
  },
  budgetWatchpoints: {
    grossMarginTargetPct: 50, operatingProfitTargetPct: 13,
    equipmentApprovalThresholdGbp: 2500, cashBufferGbp: 25000
  }
};

const SERVICE_ECONOMICS = [
  { domain: 'job_margin', service: 'Standard repair and refresh', priceFromGbp: 145, typicalSoldGbp: 245, materialsGbp: 58, labourGbp: 76, transportGbp: 18, contributionGbp: 93 },
  { domain: 'job_margin', service: 'Structural repair', priceRange: '225-450 manual quote', targetMarginPct: 42 },
  { domain: 'job_margin', service: 'Standard knitted chair throw', priceGbp: 48, yarnGbp: 11, labourGbp: 24, packingGbp: 2, contributionGbp: 11, note: 'low margin, do not discount casually' },
  { domain: 'job_margin', service: 'Pair of knitted arm covers', priceGbp: 32, yarnGbp: 7, labourGbp: 15, packingGbp: 2, contributionGbp: 8 },
  { domain: 'job_margin', service: 'Combined repair + standard throw', priceGbp: 180, directCostGbp: 108, contributionGbp: 72, floorGbp: 165, note: 'do not discount below £165 without Scott Mercer approval' },
  { domain: 'job_margin', service: 'Local collection and return', priceGbp: 35, directCostGbp: 19, contributionGbp: 16 }
];

// ------------------------------------------------------------
// 07V — Job Execution, WIP & Cost Ledger (current booked jobs, named)
// ------------------------------------------------------------
const CURRENT_JOBS = [
  { domain: 'jobs_ops', ref: 'SAKS-1041', customer: 'Priya Patel', service: 'standard repair', quoteGbp: 300, stage: 'COLLECTION BOOKED / MATERIAL PRECHECK', promisedReturn: '2026-09-12', plannedContributionGbp: 140, contributionPct: 46.7, risk: 'GREEN' },
  { domain: 'jobs_ops', ref: 'SAKS-1045', customer: 'Elaine Rogers', service: 'structural frame repair', quoteGbp: 385, stage: 'IN PROGRESS / ADHESIVE CURE then FINAL QC', cureCompletes: '2026-08-30', forecastContributionGbp: 175, contributionPct: 45.5, risk: 'AMBER', riskReason: 'quality evidence outstanding (QC-260828-02), not a known failure', qualityRef: 'QC-260828-02' },
  { domain: 'jobs_ops', ref: 'SAKS-1047', customer: 'Jane Fletcher', service: 'structural repair + re-cover', quoteGbp: 430, stage: 'AWAITING SPECIAL-ORDER FABRIC', plannedContributionGbp: 138, contributionPct: 32.1, risk: 'RED', riskReason: 'Heritage Fabrics South West despatch delayed (PO-260819-039), customer not yet updated', poRef: 'PO-260819-039' },
  { domain: 'jobs_ops', ref: 'SAKS-1048', customer: 'Paul Turner', service: 'standard repair', quoteGbp: 245, stage: 'MATERIALS ALLOCATED / workshop slot 1 Sept', plannedContributionGbp: 100, contributionPct: 40.8, risk: 'GREEN', riskNote: "Ravi's leave reduces next-week flexibility" },
  { domain: 'jobs_ops', ref: 'SAKS-1049', customer: 'Olivia Grant', service: 'standard refresh', quoteGbp: 265, stage: 'PRE-WORK HOLD / WEBBING ALLOCATION NOT CONFIRMED', plannedContributionGbp: 111, contributionPct: 41.9, risk: 'AMBER', qualityRef: 'QC-260828-03' },
  { domain: 'jobs_ops', ref: 'SAKS-1050', customer: 'Hannah Brooks', service: 'standard seat refresh', quoteGbp: 245, stage: 'IN PROGRESS', assigned: 'Ellie Park', promisedReady: '2026-09-03', forecastContributionGbp: 102, risk: 'GREEN' },
  { domain: 'jobs_ops', ref: 'SAKS-1051', customer: 'George Salter', service: 'structural arm reinforcement', quoteGbp: 375, stage: 'STRIP/DIAGNOSE complete, STRUCTURAL WORK SCHEDULED', assigned: 'Ravi Singh (strip) / Tony Marsh (structural if not finished before leave)', promisedReturn: '2026-09-10', plannedContributionGbp: 170, contributionPct: 45.3, risk: 'AMBER', riskReason: "Ravi's leave handoff dependency" },
  { domain: 'jobs_ops', ref: 'SAKS-1052', customer: 'Harbour View Guest House Ltd', service: 'two-chair refresh batch (trade)', quoteGbp: 760, stage: 'INTAKE / PHOTOS', promisedReturn: '2026-09-11', plannedContributionGbp: 350, contributionPct: 46.1, risk: 'GREEN/AMBER', riskReason: 'next week reduced-capacity' },
  { domain: 'jobs_ops', ref: 'SAKS-1038', customer: 'Helen Price', service: 'repair (customer return)', quoteGbp: 310, stage: 'CUSTOMER RETURN / QUALITY HOLD / REINSPECTION REQUIRED', risk: 'RED', riskReason: 'loose arm reported after return, stability concern, CRITICAL until reinspection proves otherwise', qualityRef: 'QC-260828-01', complaintRef: 'C-260828-01', note: 'may consume one of the two protected urgent-rework slots; original contribution £146 provisional pending rework cost' }
];

const WIP_AGEING_ALERTS = [
  { domain: 'jobs_ops', ref: 'SAKS-1047', daysSinceIntake: 8, stuckReason: 'SUPPLIER SPECIAL FABRIC', severity: 'RED' },
  { domain: 'jobs_ops', ref: 'SAKS-1045', daysSinceIntake: 14, stuckReason: 'ADHESIVE CURE + MANDATORY QC (not unproductive delay)', severity: 'AMBER' },
  { domain: 'jobs_ops', ref: 'SAKS-1049', daysSinceAcceptance: 7, stuckReason: 'WEBBING ALLOCATION / material-control hold', severity: 'AMBER' },
  { domain: 'jobs_ops', ref: 'SAKS-1043', daysSinceAcceptance: 5, stuckReason: 'CUSTOMER COLLECTION DATE NOT AGREED', severity: 'AMBER' }
];

// ------------------------------------------------------------
// 07N — Quality Control, Rework & Defects
// ------------------------------------------------------------
const QUALITY_QUEUE = [
  { domain: 'quality_full', ref: 'QC-260828-01', jobRef: 'SAKS-1038', customer: 'Helen Price', status: 'CUSTOMER RETURN', severity: 'CRITICAL', detail: 'Loose arm reported after return, stability concern until reinspection proves otherwise', complaintRef: 'C-260828-01', action: 'chair must be re-inspected before any remedy is finalised' },
  { domain: 'quality_full', ref: 'QC-260828-02', jobRef: 'SAKS-1045', customer: 'Elaine Rogers', status: 'AWAITING FINAL QC', severity: 'BLOCKING', detail: 'adhesive cure completes 30 August; independent second-person structural stability sign-off required before release', action: 'no return slot may be confirmed until PASS recorded' },
  { domain: 'quality_full', ref: 'QC-260828-03', jobRef: 'SAKS-1049', customer: 'Olivia Grant', status: 'PRE-WORK HOLD', severity: 'MINOR', detail: 'webbing allocation not yet confirmed; final material specification must match the quote before work begins' },
  { domain: 'quality_full', ref: 'QC-260828-04', jobRef: 'K-891', customer: 'Barbara Lane', status: 'PLANNED FINAL QC', severity: 'MINOR', detail: 'two mustard throws due 7 September; Leah should check any non-standard sizing adjustment' },
  { domain: 'quality_full', ref: 'QC-260828-05', jobRef: null, customer: null, status: 'SUPPLIER QUALITY ALERT', severity: 'MAJOR', detail: 'one sheet in the latest South Devon Foam & Webbing delivery (batch F-8821) measured materially softer than spec; sheet quarantined, remaining batch requires identification check before use', supplierRef: 'South Devon Foam & Webbing Ltd' }
];

const QUALITY_KPIS = {
  domain: 'quality_full',
  targetReworkRatePct: 4.0,
  rolling30DayReworkRatePct: 4.7,
  rolling90DayExtraReworkHours: 31.5
};

// ------------------------------------------------------------
// 07U — Purchase Orders, Goods Receipt & Supplier Invoice Ledger (current/open only)
// ------------------------------------------------------------
const OPEN_PURCHASE_ORDERS = [
  { domain: 'po_status', ref: 'PO-260804-036', supplier: 'South Devon Foam & Webbing Ltd', netGbp: 1560, status: 'RECEIVED / QUALITY ISSUE OPEN', detail: 'batch F-8821 quality issue, invoice SDFW-7964 partially disputed pending supplier response' },
  { domain: 'po_status', ref: 'PO-260819-039', supplier: 'Heritage Fabrics South West', netGbp: 518.40, status: 'LATE / OPEN', detail: 'Jane Fletcher SAKS-1047 special-order fabric, despatch slipped from 28 Aug to 31 Aug, likely arrival 1-2 Sept', jobRef: 'SAKS-1047' },
  { domain: 'po_status', ref: 'PO-260824-041', supplier: 'South Devon Foam & Webbing Ltd', netGbp: 2750, status: 'ACKNOWLEDGED / OPEN', detail: 'September replenishment, promised 1 September, not yet received', financeApproval: 'Scott Mercer (above £1,500 in a week with other cash commitments)' },
  { domain: 'po_status', ref: 'PO-260825-042', supplier: 'Tor Yarn Collective', netGbp: 680, status: 'ACKNOWLEDGED / OPEN', detail: 'cream yarn 24 balls, promised 2 September, on schedule as of 28 Aug' },
  { domain: 'po_status', ref: 'PO-260827-045', supplier: 'South Devon Safety Supplies', netGbp: 368, status: 'ACKNOWLEDGED / NOT RECEIVED', detail: 'PPE/first-aid restock, promised 31 August' },
  { domain: 'po_status', ref: 'PR-260828-043', supplier: 'Tor Yarn Collective (proposed)', netGbp: 510, status: 'PROPOSED FOR HUMAN REVIEW', detail: 'mustard yarn 18 balls, NOT YET AN ORDER, no supplier commitment exists' },
  { domain: 'po_status', ref: 'PR-260828-044', supplier: 'Tor Yarn Collective (proposed)', netGbp: 510, status: 'PROPOSED FOR HUMAN REVIEW', detail: 'navy yarn 18 balls, NOT YET AN ORDER, no supplier commitment exists' }
];

const SUPPLIER_DIRECTORY = [
  { domain: 'suppliers_ops', name: 'South Devon Foam & Webbing Ltd', supplies: 'foam/webbing/springs', terms: '30-day account', leadTime: '2 working days', settlementDiscount: '2% within 10 days' },
  { domain: 'suppliers_ops', name: 'Tor Yarn Collective', supplies: 'primary yarn', terms: '30-day account', leadTime: '3-4 working days (7-10 special)', note: 'batch/dye-lot critical' },
  { domain: 'suppliers_ops', name: 'Heritage Fabrics South West', supplies: 'upholstery fabric', terms: '30-day account', leadTime: '5 working days', note: 'rolling reliability weaker than primary foam supplier' },
  { domain: 'suppliers_ops', name: 'Newton Fixings & Timber', supplies: 'timber/springs/fixings', terms: 'monthly trade account', leadTime: 'same day if collected before 15:00' },
  { domain: 'suppliers_ops', name: 'Dartmoor Wool & Yarn', supplies: 'alternate yarn', terms: '14 days', leadTime: '4-5 working days', note: 'batch validation required, not approved for mixing into existing Tor Yarn items' }
];

// ------------------------------------------------------------
// 07I — Stock & Supply Live Feed (snapshot)
// ------------------------------------------------------------
const STOCK_SNAPSHOT = [
  { domain: 'yarn_stock', sku: 'Y-NAVY-01', material: 'Navy yarn', supplier: 'Tor Yarn Collective', onHand: 18, allocated: 10, free: 8, onOrder: 0, reorderPoint: 10, leadTime: '3-4 working days', risk: 'AMBER', action: 'order 18 balls now' },
  { domain: 'yarn_stock', sku: 'Y-MUST-01', material: 'Mustard yarn', supplier: 'Tor Yarn Collective', onHand: 7, allocated: 5, free: 2, onOrder: 0, reorderPoint: 8, leadTime: '3-4 working days', risk: 'RED', action: 'order 18 balls immediately' },
  { domain: 'yarn_stock', sku: 'Y-FGRN-01', material: 'Forest green yarn', supplier: 'Tor Yarn Collective', onHand: 2, allocated: 0, free: 2, onOrder: 0, reorderPoint: 8, leadTime: '3-4 working days', risk: 'RED', action: 'confirm K-892 requirement then order at least 18 balls' },
  { domain: 'yarn_stock', sku: 'Y-CREAM-01', material: 'Cream yarn', supplier: 'Tor Yarn Collective', onHand: 0, allocated: 0, free: 0, onOrder: 24, onOrderRef: 'PO-260825-042', expectedDelivery: '2026-09-02', risk: 'RED', action: 'do not accept cream custom knitting until replenishment confirmed received' }
];

// ------------------------------------------------------------
// 07B — People & HR (staffing, absence, training, current issues)
// ------------------------------------------------------------
const STAFF = [
  { domain: 'staffing_capacity', name: 'Tony Marsh', role: 'Workshop & Operations Manager / senior management', training: 'first aid current to May 2027; structural repair sign-off complete; manual handling refresher due Nov 2026' },
  { domain: 'staffing_capacity', name: 'Ellie Park', role: 'skilled repair/upholstery technician', training: 'structural repair sign-off complete; customer-site inspection sign-off complete', leaveRemaining: 4 },
  { domain: 'staffing_capacity', name: 'Ravi Singh', role: 'workshop/field operative', leave: '2026-08-31 to 2026-09-04', training: 'collection-site inspection sign-off complete; structural repair sign-off complete' },
  { domain: 'staffing_capacity', name: 'Leah Morgan', role: 'knitting quality lead / team lead', training: 'pattern-authorisation trainer', leaveRemaining: 9 },
  { domain: 'staffing_capacity', name: 'Jo Bell', role: 'knitting operative', probationReview: '2026-09-04', trainingNote: 'standard-pattern sign-off complete; custom-pattern sign-off pending; speed ~12% below target for standard throws, development action agreed' },
  { domain: 'staffing_capacity', name: 'Chloe Reed', role: 'office / customer admin', training: 'complaint logging, data handling and trade-account admin training current' },
  { domain: 'staffing_capacity', name: 'Mike Evans', role: 'driver / field logistics', trainingNote: 'raised that Thursday collection route regularly runs beyond contracted finish time (workload issue, not disciplinary)' }
];

const HR_CURRENT_ISSUES = [
  { domain: 'hr_full', person: 'Jo Bell', issue: 'probation review due 2026-09-04', detail: 'good on quality and attendance, speed ~12% below target for standard throws; agreed action: two supervised batch sessions with Leah before any decision on extending pattern scope' },
  { domain: 'hr_full', person: 'Mike Evans', issue: 'Thursday route workload', detail: 'regularly runs beyond contracted finish time; logged as workload issue, not disciplinary; Operations should review route density before authorising routine overtime' },
  { domain: 'hr_full', person: 'Chloe Reed', issue: 'flexible working request', detail: 'requested from 1 October: four shorter days, one longer Friday; no decision made, requires business-impact review and Scott Mercer approval' }
];

const CAPACITY_NOTE = {
  domain: 'staffing_capacity',
  weekOf: '2026-08-31',
  effect: "Ravi Singh's annual leave reduces safe routine repair capacity from 12 to 8-9 jobs unless Tony approves overtime or temporary skilled cover",
  recruitmentWatch: 'no vacancy currently approved; if monthly repair demand stays above 46 jobs for 3 consecutive months, assess another technician (indicative fully-loaded cost £39,000-£42,000/year, requires Finance affordability confirmation and Scott Mercer approval)'
};

// ------------------------------------------------------------
// Recurring cost / commercial-leakage evidence (07Q software register)
// ------------------------------------------------------------
const COST_OPPORTUNITIES = [
  { domain: 'finance_summary_ops', ref: 'OPP-004', item: 'ChairSketch Pro', currentMonthlyGbp: 170, detail: '5 seats, only 2 users in last 90 days, 2-seat plan available at £68/month', potentialAnnualSavingGbp: 1224, status: 'identified', note: 'do not cancel before confirming no workflow/export dependency' },
  { domain: 'finance_summary_ops', ref: 'OPP-005', item: 'Social Scheduler Plus', currentMonthlyGbp: 79, detail: 'used 3 publishing sessions in 90 days; native scheduling may suffice at current volume', potentialAnnualSavingGbp: 948, status: 'identified' },
  { domain: 'finance_summary_ops', ref: 'OPP-006', item: 'SecureBox Legacy Archive', currentMonthlyGbp: 65, detail: 'no restore performed in 12 months; NOT approved to cancel until retention/export compatibility checked', potentialAnnualSavingGbp: 780, status: 'identified, pending verification' },
  { domain: 'finance_summary_ops', ref: 'OPP-007', item: 'Business mobile plan spare SIMs', currentMonthlyGbp: 44, detail: '2 of 9 paid SIMs have had no chargeable activity for 6 months', potentialAnnualSavingGbp: 528, status: 'identified' },
  { domain: 'finance_summary_ops', ref: 'OPP-008', item: 'Managed printer plan', currentMonthlyGbp: 118, detail: 'rolling average 1,850 pages/month against a 10,000-page allowance; lower-volume plan available at £69/month', potentialAnnualSavingGbp: 588, status: 'identified' }
];
const COST_OPPORTUNITIES_TOTAL_ANNUAL_GBP = 4068;

module.exports = {
  SNAPSHOT_LABEL,
  CORPORATE_PROFILE,
  DIRECTOR_POSITION,
  BORROWING_SCHEDULE,
  TAX_POSITION,
  FINANCE_SUMMARY,
  SERVICE_ECONOMICS,
  CURRENT_JOBS,
  WIP_AGEING_ALERTS,
  QUALITY_QUEUE,
  QUALITY_KPIS,
  OPEN_PURCHASE_ORDERS,
  SUPPLIER_DIRECTORY,
  STOCK_SNAPSHOT,
  STAFF,
  HR_CURRENT_ISSUES,
  CAPACITY_NOTE,
  COST_OPPORTUNITIES,
  COST_OPPORTUNITIES_TOTAL_ANNUAL_GBP
};
