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
// SCOPE HONESTY: transcribed domains are 07A Finance, 07B People & HR,
// 07C Leads/Quotes/Pipeline, 07D Customer Service & Complaints, 07F
// Operations, 07G Customers/Job History/Trade Accounts, 07I Stock &
// Supply, 07N Quality Control, 07Q IT/Access (via clearance.js), 07S
// Corporate/Director/History, 07U Purchase Orders, 07V Job Execution/WIP.
//
// NOT yet transcribed into structured data here, and reported as such
// rather than silently dropped: 07E Marketing/Advertising/Social/Reviews,
// 07H Management Dashboard & KPI Pack, 07J Policies/Terms/Payments, 07K
// Safety/Compliance/Insurance, 07L Assets/Vehicles/Maintenance, 07M
// Supplier Resilience & Material Usage, 07O Business Continuity, 07P
// Marketing Asset & Consent Register, 07R Premises/Facilities/Utilities,
// 07T Commercial Leakage (partially present as COST_OPPORTUNITIES from
// the 07Q software register).
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
  { domain: 'jobs_ops', ref: 'SAKS-1047', customer: 'Jane Fletcher', service: 'structural repair + re-cover', quoteGbp: 430, stage: 'AWAITING SPECIAL-ORDER FABRIC', plannedContributionGbp: 138, contributionPct: 32.1, risk: 'RED', riskReason: 'Heritage Fabrics South West despatch delayed (PO-260819-039), customer not yet updated', poRef: 'PO-260819-039', fieldDomains: { riskReason: 'po_status', poRef: 'po_status' } },
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
  { domain: 'yarn_stock', sku: 'Y-CREAM-01', material: 'Cream yarn', supplier: 'Tor Yarn Collective', onHand: 0, allocated: 0, free: 0, onOrder: 24, onOrderRef: 'PO-260825-042', expectedDelivery: '2026-09-02', risk: 'RED', action: 'do not accept cream custom knitting until replenishment confirmed received', fieldDomains: { onOrderRef: 'po_status', expectedDelivery: 'po_status' } }
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
  { domain: 'staffing_capacity', name: 'Mike Evans', role: 'driver / field logistics', trainingNote: 'raised that Thursday collection route regularly runs beyond contracted finish time (workload issue, not disciplinary)', fieldDomains: { trainingNote: 'hr_full' } }
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


// ------------------------------------------------------------
// 07C - Leads, Quotes & Customer Pipeline
// ------------------------------------------------------------
const PIPELINE_ENQUIRIES = [
  { domain: 'leads', ref: 'E-260828-01', customer: 'Sarah Milton', location: 'Torquay', type: 'householder', source: 'website', service: 'repair', detail: 'Wingback chair with collapsed seat, photos supplied. AI classification: likely standard repair with possible webbing replacement.', status: 'DRAFT READY FOR HUMAN REVIEW' },
  { domain: 'leads', ref: 'E-260828-02', customer: 'Moorland Cottages Ltd', location: 'Bovey Tracey', type: 'trade', source: 'email', service: '4 dining-armchair refreshes', detail: 'Existing trade account, requested completion by 18 September. Indicative value GBP 980 before collection.', status: 'NEEDS OPERATIONS CHECK' },
  { domain: 'leads', ref: 'E-260828-03', customer: 'Jean Harris', location: 'Newton Abbot', type: 'householder', source: 'website', service: 'cream knitted throw', detail: 'Cream stock is ZERO, replenishment due 2 September. Draft reply must not promise next-week delivery until receipt confirmed.', status: 'NEEDS INFORMATION / STOCK CONSTRAINT' },
  { domain: 'leads', ref: 'E-260828-04', customer: 'The Woolly Badger Cafe', location: 'Newton Abbot', type: 'repeat trade', source: 'telephone', service: '2 additional navy arm-cover pairs', detail: 'Standard price GBP 64 total. Existing order K-890 due 5 September must be considered first.', status: 'QUOTE READY FOR HUMAN REVIEW' },
  { domain: 'leads', ref: 'E-260828-05', customer: 'Martin Cole', location: 'Totnes', type: 'householder', source: 'Google Business Profile', service: 'structural repair', detail: "Customer asks 'roughly GBP 150?'. Correct response explains structural work requires inspection and avoids anchoring to that figure.", status: 'DRAFT READY FOR HUMAN REVIEW' },
  { domain: 'leads', ref: 'E-260828-06', customer: 'Helen Price', location: 'Teignmouth', type: 'householder', source: 'website', service: 'complaint', detail: 'Linked to job SAKS-1038, chair returned with loose arm. No generic marketing response allowed.', status: 'COMPLAINT ROUTED', complaintRef: 'C-260828-01' },
  { domain: 'leads', ref: 'E-260828-07', customer: 'Devon Hearth Cafe Group', location: 'South Devon', type: 'trade', source: 'referral', service: '6 chairs plus knitted arm covers', detail: 'Account is on referral from an existing trade contact, quantity and arm-cover spec to confirm.', detailRestricted: 'Account has GBP 1,950 overdue at 36 days, so Commercial/Finance input required before extending more credit.', status: 'AI REVIEWING', fieldDomains: { detailRestricted: 'debtor_flag' } },
  { domain: 'leads', ref: 'E-260828-08', customer: 'Peter Wynne', location: 'Newton Abbot', type: 'repeat', source: 'telephone', service: 'standard repair', detail: 'GBP 245 repair plus GBP 35 collection/return, accepted 28 August. Awaiting Operations collection slot.', status: 'QUOTE ACCEPTED' }
];

const OPEN_QUOTES = [
  { domain: 'quotes', ref: 'Q-260826-551', customer: 'Moorland Cottages', valueGbp: 980, status: 'NEEDS OPERATIONS CHECK / FINANCE INPUT', detail: 'Draft batch quote for 4 chairs. Not issued: Operations check still required.', detailRestricted: 'Also held pending overdue-account context from Finance before the quote is issued.', fieldDomains: { detailRestricted: 'debtor_flag' } },
  { domain: 'quotes', ref: 'Q-260827-553', customer: 'Woolly Badger Cafe', valueGbp: 64, status: 'READY FOR HUMAN REVIEW', detail: '2 additional navy arm-cover pairs, timing dependent on existing order and navy allocation.' },
  { domain: 'quotes', ref: 'Q-260828-555', customer: 'Martin Cole', valueGbp: null, status: 'NEEDS INSPECTION', detail: 'No firm quote. Structural inspection required. System must not anchor to the suggested GBP 150.' },
  { domain: 'quotes', ref: 'Q-260730-507', customer: 'archived householder', valueGbp: 265, status: 'OPEN, EXPIRES 29 AUGUST', detail: 'Standard refresh issued 30 July. Customer has not responded after follow-up.' },
  { domain: 'quotes', ref: 'Q-260731-509', customer: 'archived householder', valueGbp: 360, status: 'OPEN, EXPIRES 30 AUGUST', detail: 'Structural repair issued 31 July.' },
  { domain: 'quotes', ref: 'Q-260822-541', customer: 'Alan Price', valueGbp: 48, status: 'NEEDS OPERATIONS / MATERIAL CONFIRMATION', detail: "Forest-green throw. Customer expressed acceptance in principle but stock is RED. An informal customer 'yes' is not safe fulfilment evidence." }
];

const PIPELINE_METRICS = {
  domain: 'leads',
  periodDays: 30,
  newEnquiries: 42, qualified: 31, quotesIssued: 26, quotesAccepted: 17, declined: 5, stillOpen: 4,
  leadToQuoteRatePct: 61.9, quoteAcceptanceRatePct: 77.3, averageAcceptedOrderValueGbp: 286,
  bySource: { website: 18, googleBusinessProfile: 7, repeatReferral: 10, social: 4, otherDirect: 3 }
};

const QUOTE_DECLINE_REASONS_90D = {
  domain: 'quotes',
  priceOrChoseReplacement: 6, noResponseAfterFollowUp: 4, timingNotSuitable: 3,
  scopeOutsideOffer: 2, competitor: 2, customerPlansChanged: 1, unknown: 2,
  note: 'Do not claim every lost quote is bad sales performance. Some work is correctly declined because price, scope or capacity discipline protects margin and service.'
};

// ------------------------------------------------------------
// 07D - Customer Service & Complaints
// ------------------------------------------------------------
const COMPLAINTS = [
  { domain: 'complaints_workflow', ref: 'C-260828-01', customer: 'Helen Price', jobRef: 'SAKS-1038', category: 'WORKMANSHIP/QUALITY', received: '2026-08-28', channel: 'website', status: 'AWAITING OPERATIONS REVIEW', detail: 'Loose arm after return, customer supplied photo and says the arm moved again the first evening.', remedy: 'None agreed. Technical check required before any remedy.', qualityRef: 'QC-260828-01' },
  { domain: 'complaints_workflow', ref: 'C-260826-02', customer: 'Moorland Holiday Lets', jobRef: 'SAKS-1029', category: 'DELAY/COMMUNICATION', received: '2026-08-26', channel: 'telephone', status: 'REMEDY APPROVAL REQUIRED', detail: 'Two-day late return caused property-turnover inconvenience. Workshop delay was known 36 hours before the customer was updated.', remedy: 'Proposed GBP 35 collection credit on next booked job plus apology. NOT yet approved.', rootCause: 'late communication, not workmanship' },
  { domain: 'complaints_workflow', ref: 'C-260822-03', customer: 'Alan Reeves', jobRef: 'SAKS-1018', category: 'WORKMANSHIP/FINISH', received: '2026-08-22', channel: 'email', status: 'RESPONSE READY FOR HUMAN REVIEW', detail: 'Fabric shade looked different from mobile-phone photo. Inspection record confirms the selected physical swatch code matches the job.', remedy: 'Draft explains colour-screen limitation and offers workshop viewing of the retained swatch. Does not admit fault unsupported by evidence.' },
  { domain: 'complaints_workflow', ref: 'C-260815-04', customer: 'Lucy Ford', jobRef: 'K-883', category: 'WORKMANSHIP/QUALITY', received: '2026-08-15', channel: 'email', status: 'CLOSED', detail: 'One arm cover measured 2cm short.', remedy: 'Replaced at no charge after Operations confirmed measurement defect. Customer later left a 5-star review.' },
  { domain: 'complaints_workflow', ref: 'C-260809-11', customer: 'archived householder', jobRef: 'SAKS-1027', category: 'WORKMANSHIP/SCOPE', received: '2026-08-09', channel: 'telephone', status: 'CLOSED', detail: 'Seat felt firmer than expected. No structural defect, but expectation/scope communication weak after an owner-authorised uncharged upgrade.', remedy: 'No-charge comfort adjustment.', remedyRestricted: 'Additional cost contributes to SAKS-1027 poor margin.', fieldDomains: { remedyRestricted: 'job_margin' }, rootCause: 'under-scoped intake plus owner-authorised silent enhancement' },
  { domain: 'complaints_workflow', ref: 'C-260731-10', customer: 'Foxcombe Farm Stays', jobRef: 'SAKS-1025', category: 'COLLECTION/RETURN', received: '2026-07-31', channel: 'email', status: 'CLOSED', detail: 'Small scuff on hallway skirting after chair return. No chair damage, cause not established with certainty.', remedy: 'Factual apology and GBP 25 goodwill contribution, approved without admission beyond evidence.' },
  { domain: 'complaints_workflow', ref: 'C-260719-09', customer: 'archived householder', jobRef: 'SAKS-1020', category: 'DELAY/COMMUNICATION', received: '2026-07-19', channel: 'telephone', status: 'CLOSED', detail: 'Return one working day late after foam delivery slipped. Main concern was receiving no update until the morning of return day.', remedy: 'Apology, no financial remedy requested.', rootCause: 'late communication, second occurrence in 90 days' },
  { domain: 'complaints_workflow', ref: 'C-260708-08', customer: 'Jonathan Pearce', jobRef: 'SAKS-1016', category: 'WORKMANSHIP/FINISH', received: '2026-07-08', channel: 'email', status: 'CLOSED', detail: 'Slight fabric puckering on rear seam, photos supported the finish defect.', remedy: 'Rework, 1.0 additional labour hour, no extra customer charge.' },
  { domain: 'complaints_workflow', ref: 'C-260629-07', customer: 'South Moor Care Home', jobRef: 'INV-260612-204', category: 'BILLING', received: '2026-06-29', channel: 'email', status: 'CLOSED', detail: 'Collection charge appeared twice across a batch invoice revision.', remedy: 'GBP 35 credit note issued. No wider account error.', rootCause: 'manual invoice revision control' },
  { domain: 'complaints_workflow', ref: 'C-260617-06', customer: 'archived householder', jobRef: 'SAKS-1012', category: 'WORKMANSHIP/QUALITY', received: '2026-06-17', channel: 'telephone', status: 'CLOSED', detail: 'One front leg felt slightly loose 3 days after return. Fixing torque check had not been documented.', remedy: 'Free collection, rework and return.', rootCause: 'final stability check omission, contributed to the signed-stability-check rule' },
  { domain: 'complaints_workflow', ref: 'C-260604-05', customer: 'Riviera Reading Rooms', jobRef: 'SAKS-1008', category: 'COLLECTION/RETURN', received: '2026-06-04', channel: 'telephone', status: 'CLOSED', detail: 'Collection driver arrived 45 minutes outside the agreed window during venue opening.', remedy: 'Apology plus GBP 20 collection reduction.', rootCause: 'route sequencing and customer update' }
];

const COMPLAINT_METRICS_90D = {
  domain: 'complaints_workflow',
  total: 11, workmanshipQuality: 5, delayCommunication: 3, collectionReturn: 2, billing: 1,
  closedWithin5WorkingDays: 8, closedWithin6to10: 2, currentlyOpen: 1,
  resultedInRework: 3, resultedInGoodwillCredit: 2, fullRefunds: 0,
  watchpoint: 'Late customer updates have appeared twice in the last 90 days and remain a management watchpoint. Two workmanship complaints were linked to final-check omissions before return.'
};

const REMEDY_AUTHORITY = {
  domain: 'complaints_workflow',
  apologyAndExplanation: 'May be drafted without owner approval, human-reviewed before send.',
  reworkInOriginalScope: 'Operations may recommend and schedule within capacity, subject to human review.',
  refundOrGoodwill: 'Commercial must assess cost and authority.',
  ownerApprovalThreshold: 'Any goodwill above GBP 75, or refund above 20% of invoice value, requires Scott Mercer approval. Any response admitting liability beyond established facts also requires his approval.',
  prohibited: 'No worker may fabricate legal rights or contractual terms.'
};

// ------------------------------------------------------------
// 07G - Customers, Job History & Trade Accounts
// ------------------------------------------------------------
const CUSTOMERS = [
  { domain: 'customers_contact', ref: 'CUST-0001', name: 'Peter Wynne', location: 'Newton Abbot', type: 'householder/repeat', since: 2023, lifetimeBilledGbp: 525, preferredContact: 'telephone', openComplaints: 0, reviewHistory: '5-star', balanceGbp: 0, payment: 'reliable' },
  { domain: 'customers_contact', ref: 'CUST-0003', name: 'Moorland Holiday Lets Ltd', location: 'Bovey Tracey', type: 'trade', since: 2024, lifetimeBilledGbp: 12230, terms: '30-day', overdueGbp: 3600, overdueDays: 43, openComplaints: 1, avgPayDays: 34, creditRisk: 'AMBER' },
  { domain: 'customers_contact', ref: 'CUST-0004', name: 'The Woolly Badger Cafe', location: 'Newton Abbot', type: 'trade', since: 2025, lifetimeBilledGbp: 1332, terms: '30-day', avgPayDays: 19, openComplaints: 0, creditRisk: 'GREEN' },
  { domain: 'customers_contact', ref: 'CUST-0005', name: 'Devon Hearth Cafe Group', location: 'South Devon', type: 'trade', since: 2024, lifetimeBilledGbp: 17940, terms: '30-day', overdueGbp: 1950, overdueDays: 36, avgPayDays: 29, creditRisk: 'AMBER', note: 'recent deterioration' },
  { domain: 'customers_contact', ref: 'CUST-0008', name: 'Helen Price', location: 'Teignmouth', type: 'householder', since: 2026, lifetimeBilledGbp: 310, openComplaints: 1, balanceGbp: 0, preferredContact: 'email', note: 'open loose-arm complaint and quality return on SAKS-1038' },
  { domain: 'customers_contact', ref: 'CUST-0009', name: 'Jane Fletcher', location: 'Dawlish', type: 'householder', since: 2026, lifetimeBilledGbp: 0, openComplaints: 0, note: 'SAKS-1047 special fabric delayed, customer update required before it becomes a complaint' },
  { domain: 'customers_contact', ref: 'CUST-0018', name: 'Harbour View Guest House Ltd', location: 'Teignmouth', type: 'trade', since: 2023, lifetimeBilledGbp: 9480, terms: '30-day', avgPayDays: 24, balanceGbp: 1120, creditRisk: 'GREEN' },
  { domain: 'customers_contact', ref: 'CUST-0024', name: 'Seabreeze Holiday Cottages Ltd', location: 'Dawlish', type: 'trade', since: 2025, lifetimeBilledGbp: 3960, avgPayDays: 37, overdueGbp: 620, creditRisk: 'AMBER watch' },
  { domain: 'customers_contact', ref: 'CUST-0007', name: 'Alan Reeves', location: 'Newton Abbot', type: 'householder', since: 2026, lifetimeBilledGbp: 310, openComplaints: 1, reviewHistory: '3-star', note: 'colour-perception complaint, no workmanship defect established' },
  { domain: 'customers_contact', ref: 'CUST-0006', name: 'Lucy Ford', location: 'Teignmouth', type: 'householder', since: 2026, lifetimeBilledGbp: 64, openComplaints: 0, reviewHistory: '5-star', note: 'service-recovery example: defect replaced free, customer then left 5 stars' }
];

const CUSTOMER_MASTER_SUMMARY = {
  domain: 'customers_contact',
  namedDetailedRecords: 50,
  tradeAccountDetailed: 13,
  householdRepeatDetailed: 37,
  archivedAggregateHouseholdCustomers: 624,
  archivePeriod: 'April 2022 to August 2026',
  note: 'Aggregate records support trend counts but are not individually fabricated. If asked for a person not in the detailed set, the correct answer is that no detailed record exists.'
};

const TRADE_ACCOUNT_RULES = {
  domain: 'trade_terms',
  standardTerms: '30 days from invoice',
  defaultCreditLimitGbp: 2500,
  over30DaysOverdue: 'flagged',
  over45DaysOverdue: 'should not receive increased exposure without Finance review and Scott Mercer approval',
  principle: 'Customer-service complaints do not erase valid debt, and debt does not justify ignoring a genuine complaint. Handle both facts separately.'
};

const CUSTOMER_VALUE_METRICS = {
  domain: 'kpi_trend',
  householderAverageOrderValueGbp: 262,
  tradeAverageInvoiceValueGbp: 438,
  repeatReferralShareOfRevenuePct: 37,
  top10CustomerShareOfRevenuePct: 22,
  tradeShareOfRevenuePct: 28,
  note: 'No single customer exceeds 5% of annual revenue. Lifetime revenue is not lifetime gross profit; use job-level margin for profitability questions.'
};

// ------------------------------------------------------------
// 07E SCOTT'S MARKETING, ADVERTISING, SOCIAL & REVIEWS
// ------------------------------------------------------------
// Two domains, deliberately, because 07Q separates them: reputation
// handling (`review_status`, which Chloe holds as customer admin) is not
// the same as knowing what the company spends to acquire a lead
// (`marketing_performance`, management level only). Chloe drafts a reply
// to a bad review without being shown the cost per qualified lead.
const MARKETING_CHANNELS_12M = [
  { domain: 'marketing_performance', channel: 'Google Ads', spendGbp: 16524, enquiries: null, qualified: 164, accepted: 83, bookedRevenueGbp: 32064, linkedContributionGbp: 14107, note: 'strong qualified volume, but attribution is incomplete on trade and repeat follow-on work' },
  { domain: 'marketing_performance', channel: 'Local print and cards', spendGbp: 2640, enquiries: 31, qualified: 17, accepted: 10, bookedRevenueGbp: 4120, costPerQualifiedGbp: 155.29 },
  { domain: 'marketing_performance', channel: 'Photography and content support', spendGbp: 3420, enquiries: null, qualified: null, accepted: null, bookedRevenueGbp: null, note: 'not attributable as a lead source on its own: the assets support social, website and the Google profile. Judge on engagement and assisted enquiries, not false last-click precision' },
  { domain: 'marketing_performance', channel: 'Boosted social', spendGbp: 1360, enquiries: 47, qualified: 21, accepted: 9, bookedRevenueGbp: 2880, note: 'weaker direct efficiency than strong organic content. Do not increase boosts merely because reach is larger' },
  { domain: 'marketing_performance', channel: 'Organic social', spendGbp: 0, enquiries: 96, qualified: 44, accepted: 19, bookedRevenueGbp: 6540, note: 'before/after and process/skills posts dominate the useful response' },
  { domain: 'marketing_performance', channel: 'Google Business Profile organic', spendGbp: 0, enquiries: 82, qualified: 50, accepted: 27, bookedRevenueGbp: 9470 },
  { domain: 'marketing_performance', channel: 'Repeat and referral', spendGbp: 0, enquiries: 126, qualified: 96, accepted: 63, bookedRevenueGbp: 21880, note: 'highest quality source, consistent with the 37% repeat/referral share of booked revenue' },
  { domain: 'marketing_performance', channel: 'Email to consented customers', spendGbp: 720, enquiries: 53, qualified: 31, accepted: 18, bookedRevenueGbp: 6210, note: '6 campaigns' }
];

const ADS_CAMPAIGNS_90D = [
  { domain: 'marketing_performance', campaign: 'Armchair repair', spendGbp: 2040, qualified: 25, accepted: 15, bookedRevenueGbp: 5820, linkedContributionGbp: 2570, verdict: 'strongest paid-search fit' },
  { domain: 'marketing_performance', campaign: 'Chair upholstery / refresh', spendGbp: 1430, qualified: 15, accepted: 9, bookedRevenueGbp: 3240, linkedContributionGbp: 1430, verdict: 'acceptable, lower order value' },
  { domain: 'marketing_performance', campaign: 'Furniture repair local', spendGbp: 1520, qualified: 10, accepted: 5, bookedRevenueGbp: 2110, linkedContributionGbp: 930, verdict: 'weakest: mixed search quality from furniture/sofa ambiguity' },
  { domain: 'marketing_performance', campaign: 'Chair collection repair return', spendGbp: 1159, qualified: 9, accepted: 5, bookedRevenueGbp: 2050, linkedContributionGbp: 915, verdict: 'useful for local service intent' }
];

const ADS_CURRENT_POSITION = {
  domain: 'marketing_performance',
  monthlyBudgetGbp: 1650,
  last30Days: { spendGbp: 1574, impressions: 23700, clicks: 412, websiteLeads: 14, phoneEnquiries: 9, qualifiedLeads: 16, acceptedJobs: 7, openQuoteDecisions: 3, costPerQualifiedLeadGbp: 98.38, averageBookedRevenueGbp: 372 },
  knownWeakness: 'sofa search terms are producing irrelevant traffic and should be excluded: the current offer is armchairs, not full sofa restoration',
  controlRule: 'No AI worker may change campaign spend in the demonstration. It may analyse and propose.'
};

// The honest-attribution note is the point of this record, not a caveat on
// it. Subtracting ad spend from linked contribution produces a negative
// number, and the record says plainly that publishing that as the ROI
// would be misleading, because the contribution sample only counts
// directly linked booked jobs while historic attribution is incomplete.
// Any worker reporting on this must state the limitation rather than
// invent a positive return.
const ADS_ATTRIBUTION_WARNING = {
  domain: 'marketing_performance',
  rule: 'Do not call booked revenue "return on ad spend profit". The business still has labour, material, transport and overhead.',
  naiveCalculation: 'contribution GBP 14,107 less ad spend GBP 16,524 reads as negative',
  whyThatIsWrong: 'the contribution sample counts only directly linked booked jobs, while attribution on trade and repeat follow-on work is incomplete. State the attribution limitation rather than invent either a positive or a negative return.'
};

const PAID_SEARCH_WASTE = {
  domain: 'marketing_performance',
  finding: 'sofa-intent search terms still sitting inside broader chair and furniture ad groups after the armchair focus tightened',
  clicks30d: 61,
  attributedSpendGbp: 238,
  leads: 1,
  qualifiedLeads: 0,
  bookedJobs: 0,
  averageIrrelevantClickGbp: 3.90,
  annualisedGrossGbp: 2856,
  workingOpportunityRange: 'reduce the leakage by 70 to 90 per cent, roughly GBP 167 to GBP 214 a month if traffic quality holds',
  honesty: 'This is potential avoidable spend, not a realised saving. Some overlap may still generate useful chair enquiries, so any improvement case should use a range rather than claiming all of it back.'
};

const MARKETING_SPEND_AUGUST = {
  domain: 'dept_budget',
  googleAdsGbp: 1650,
  localPrintGbp: 240,
  photographyContentGbp: 320,
  boostedSocialGbp: 150,
  totalGbp: 2360,
  ownerReviewCeilingGbp: 2500,
  note: 'monthly marketing spend above GBP 2,500 needs Scott Mercer owner review'
};

const GOOGLE_REVIEW_POSITION = {
  domain: 'review_status',
  rating: 4.7,
  totalReviews: 186,
  fiveStar: 157,
  fourStar: 19,
  threeStar: 5,
  twoStar: 3,
  oneStar: 2,
  responseTarget: 'respond to all 1 to 3 star reviews within 2 working days, selected 4 and 5 star reviews within 5 working days',
  rules: 'Responses should sound individual, not templated. Check a negative review against the complaint and job record before drafting. Never disclose private job detail publicly, never accuse a reviewer of lying because the internal record differs, never offer an incentive for deletion or editing.'
};

const RECENT_REVIEWS = [
  { domain: 'review_status', date: '2026-08-27', stars: 5, customer: 'Lucy Ford', detail: 'praises the fast replacement of a short knitted arm cover, says the team sorted it without fuss', supportingRecord: 'C-260815-04' },
  { domain: 'review_status', date: '2026-08-26', stars: 2, customer: 'Moorland Holiday Lets', detail: 'says the chair was late and communication was poor', supportingRecord: 'C-260826-02', status: 'complaint open at remedy stage', draftingRule: 'acknowledge the poor communication without discussing the account or any credit detail', fieldDomains: { draftingRule: 'review_status' } },
  { domain: 'review_status', date: '2026-08-23', stars: 5, customer: 'Peter Wynne', detail: 'praises the collection service and the repair quality', supportingRecord: null },
  { domain: 'review_status', date: '2026-08-18', stars: 3, customer: 'Alan Reeves', detail: 'says the fabric colour looked different from the photo', supportingRecord: 'C-260822-03' }
];

const SOCIAL_POSITION = {
  domain: 'marketing_performance',
  facebookFollowers: 3840,
  instagramFollowers: 2460,
  cadence: 'three useful posts a week plus occasional Stories',
  bestThemes: 'before and after chair repairs, workshop process photos, old-chair stories with permission, knitting detail close-ups, staff craft and skills posts',
  weakestTheme: 'generic quote graphics and forced promotional posts',
  evidence: 'generic quote graphics: 12 posts in six months, average reach 1,450, 2 attributable enquiries, 0 qualified. Before/after, process and skills: 26 posts, average reach 5,980, 71 enquiries, 24 qualified.'
};

const RECENT_SOCIAL_POSTS = [
  { domain: 'marketing_performance', date: '2026-08-21', post: 'green wingback before and after', channel: 'Facebook', reach: 8900, reactions: 247, comments: 31, enquiries: 18, qualified: 4 },
  { domain: 'marketing_performance', date: '2026-08-24', post: 'Leah explaining why yarn batches matter', channel: 'Instagram', reach: 4600, reactions: 181, saves: 13, enquiries: 5, qualified: 2 },
  { domain: 'marketing_performance', date: '2026-08-26', post: '10 per cent off knitted accessories', channel: 'proposed', reach: null, enquiries: null, qualified: null, status: 'NOT PUBLISHED', reason: 'Commercial had not approved the margin impact. No reach, spend or result may be invented for it.' }
];

const MARKETING_WATCHPOINTS = [
  { domain: 'marketing_performance', item: 'Google Ads irrelevant sofa traffic needs an exclusion proposal' },
  { domain: 'review_status', item: 'the Moorland review needs a complaint-led response, not a generic reputation reply' },
  { domain: 'marketing_performance', item: 'the Facebook before/after format is producing the strongest qualified engagement and should be prioritised over generic promotional graphics' },
  { domain: 'marketing_performance', item: 'no campaign pushing cream knitting until cream yarn receipt is physically confirmed' }
];

const EMAIL_MARKETING = {
  domain: 'marketing_performance',
  consentedCustomers: 1840,
  tradeContacts: 126,
  rule: 'No purchased lists.',
  campaigns: [
    { name: 'Autumn chair check', date: '2025-10', recipients: 1520, openPct: 49, clickPct: 5.8, enquiries: 17, accepted: 8, revenueGbp: 2580 },
    { name: 'Repair before replacing', date: '2026-01', recipients: 1604, openPct: 47, clickPct: 4.9, enquiries: 12, accepted: 4, revenueGbp: 1260 },
    { name: 'Spring refresh', date: '2026-03', recipients: 1650, openPct: 45, clickPct: 4.4, enquiries: 9, accepted: 3, revenueGbp: 965 },
    { name: 'Local collection dates', date: '2026-05', recipients: 1712, openPct: 51, clickPct: 6.1, enquiries: 10, accepted: 3, revenueGbp: 1065 },
    { name: 'Before/after favourites', date: '2026-07', recipients: 1798, openPct: 54, clickPct: 6.8, enquiries: 5, accepted: 0, revenueGbp: 0 },
    { name: 'Get the chair checked before the Christmas rush', date: '2026-09', status: 'DRAFT ONLY, not approved for send, no performance result exists' }
  ]
};

// ------------------------------------------------------------
// 07L SCOTT'S ASSETS, VEHICLES & MAINTENANCE
// ------------------------------------------------------------
// The clearest per-field case in the whole dataset. A machine record is
// operational (`assets_ops`): what it is, when it was last serviced, who
// is allowed to use it, what happens to capacity if it stops. What it is
// worth in the accounts is not operational, it is `finance_full`, so the
// book value is tagged separately on the same record. Tony opens the
// register and sees the foam saw, its service history and that Ravi may
// only use it supervised; he does not see its net book value. Only Scott
// sees both.
//
// The vehicle is `vehicle_status`, which Mike Evans holds as the driver:
// he can see whether the van he drives is roadworthy and when it is due
// its MOT without being given the workshop equipment register.
const VEHICLE = {
  domain: 'vehicle_status',
  registration: 'SAKS22V',
  note: 'Fictional registration. Never represent as a real DVLA record.',
  vehicle: '2022 Ford Transit Custom 280 L1H1 Trend, diesel',
  leaseProvider: 'Westmoor Vehicle Leasing Ltd (fictional)',
  leaseStarted: '2025-03-15',
  primaryDriver: 'Mike Evans',
  otherAuthorisedDrivers: 'Ravi Singh, Tony Marsh',
  mileage: 48620,
  mileageAsOf: '2026-08-28',
  annualMileagePlanningLimit: 18000,
  mileageWatch: 'ahead of simple pro rata against the planning limit, worth watching, but no excess-mileage charge accrues until the provider terms and forecast are reviewed',
  motDue: '2027-02-14',
  serviceDue: '2026-10-18 or 55,000 miles, whichever comes first',
  tyres: 'front pair 4.1mm, rear pair 5.3mm measured 12 August',
  nextTyreCheck: '2026-09-30',
  openDefects: 'none, no warning lights',
  spareVehicle: 'none owned, short-term local hire is the contingency',
  downtimeRisk: 'AMBER: collection and return depend heavily on one vehicle',
  monthlyFixedCostGbp: 1420,
  payloadPlanning: 'normal single-route load up to four average armchairs with secured protection, subject to actual size and weight. This is a planning rule, not legal payload certification.',
  fieldDomains: { monthlyFixedCostGbp: 'finance_summary_ops' }
};

const VEHICLE_MAINTENANCE_HISTORY = [
  { domain: 'vehicle_status', date: '2025-05-16', event: 'initial fleet inspection after two months', costGbp: 0, note: 'no fault, within package' },
  { domain: 'vehicle_status', date: '2025-10-18', event: 'annual service package visit at 30,940 miles, oil and filters', costGbp: 0, note: 'no material fault' },
  { domain: 'vehicle_status', date: '2026-01-07', event: 'nearside rear lamp unit replaced', costGbp: 96, note: 'outside package' },
  { domain: 'vehicle_status', date: '2026-04-22', event: 'front brake pads replaced at 40,870 miles', costGbp: 286 },
  { domain: 'vehicle_status', date: '2026-08-12', event: 'tyre and mid-year inspection', costGbp: 0, note: 'no replacement needed, front tyres 4.1mm' }
];

const VAN_HIRE_CONTINGENCY = {
  domain: 'assets_ops',
  provider: 'Newton Van Hire Ltd (fictional)',
  dailyRateGbp: 92,
  twoDayBaseGbp: 184,
  note: 'plus VAT, before fuel and extra cover. Insurance and excess terms need a human check at booking.',
  rule: 'Operations must compare this against the affected collection and return promises. Approval remains human.'
};

// Book value is tagged finance_full on every one of these, so the
// register reads as an operational maintenance record to Tony and as a
// fixed-asset schedule to Scott, from the same rows.
const EQUIPMENT_REGISTER = [
  { domain: 'assets_ops', ref: 'EQ-01', assetRef: 'FA-002', name: 'Industrial upholstery staple gun and compressor set', model: 'BritStitch PX90 + AirForge 100L', purchased: '2024-04-12', costGbp: 6450, bookValueGbp: 2800, authorised: 'Tony, Ellie, Ravi', lastService: '2026-06-07', nextService: '2026-12-07', status: 'GREEN', faultHistory: 'pressure regulator replaced 9 January 2026, GBP 148, no safety incident', fieldDomains: { costGbp: 'finance_full', bookValueGbp: 'finance_full' } },
  { domain: 'assets_ops', ref: 'EQ-02', assetRef: 'FA-003', name: 'Foam cutting saw', model: 'FoamMaster FS450', purchased: '2019-09-05', costGbp: 8400, bookValueGbp: 3100, authorised: 'Tony and Ellie. Ravi supervised only until his refresher is complete.', lastBladeChange: '2026-08-18', nextInspection: 'electrical inspection January 2027', status: 'GREEN', faultHistory: 'blade-alignment repair 11 February 2025 GBP 310, guide adjustment 4 May 2026 GBP 185', replacementWatch: 'seven years old with two minor alignment repairs in 18 months. Another material fault should trigger the GBP 5,800 replacement and payback model.', fieldDomains: { costGbp: 'finance_full', bookValueGbp: 'finance_full' } },
  { domain: 'assets_ops', ref: 'EQ-03', assetRef: 'FA-004', name: 'Spring tensioning and repair bench tools', purchased: '2020-06-18', costGbp: 4900, bookValueGbp: 1650, authorised: 'Tony, Ellie, Ravi', lastCheck: '2026-08-01', nextCheck: '2026-09-01', status: 'AMBER', statusReason: 'scheduled check approaching, no known defect', faultHistory: 'replacement clamp GBP 74 November 2025', fieldDomains: { costGbp: 'finance_full', bookValueGbp: 'finance_full' } },
  { domain: 'assets_ops', ref: 'EQ-04', assetRef: 'FA-005', name: 'Heavy-duty sewing machine', model: 'Albion SewWorks HD-8', purchased: '2021-03-17', costGbp: 6800, bookValueGbp: 3400, authorised: 'Ellie and Tony', lastService: '2026-05-22', nextService: '2026-11-22', status: 'GREEN', faultHistory: 'needle-bar timing adjustment October 2025, GBP 126', fieldDomains: { costGbp: 'finance_full', bookValueGbp: 'finance_full' } },
  { domain: 'assets_ops', ref: 'EQ-05', assetRef: 'FA-006', name: 'Portable extraction and cleaning unit', model: 'CleanPro Extract 60', purchased: '2022-05-14', costGbp: 3150, bookValueGbp: 1450, authorised: 'Tony, Ellie, Ravi', lastCheck: '2026-08-25', status: 'GREEN', faultHistory: 'hose replaced March 2026 GBP 64', fieldDomains: { costGbp: 'finance_full', bookValueGbp: 'finance_full' } },
  { domain: 'assets_ops', ref: 'EQ-06', assetRef: 'FA-007', name: 'Manual handling trolley and chair dolly', model: 'ChairMate HD2', purchased: '2023-01-09', costGbp: 890, bookValueGbp: 300, authorised: 'inducted workshop and collection staff', nextCheck: '2026-09-03', status: 'GREEN', fieldDomains: { costGbp: 'finance_full', bookValueGbp: 'finance_full' } },
  { domain: 'assets_ops', ref: 'EQ-07', assetRef: 'FA-008', name: 'Drill and driver set', model: 'ProTorque 18V twin set', purchased: '2022-11-30', costGbp: 620, bookValueGbp: 220, authorised: 'Tony, Ellie, Ravi', nextInspection: 'portable electrical inspection December 2026', status: 'GREEN', fieldDomains: { costGbp: 'finance_full', bookValueGbp: 'finance_full' } },
  { domain: 'assets_ops', ref: 'EQ-08', assetRef: 'FA-009', name: 'Adhesive and finishing ventilation extraction', model: 'AirClean BenchVent 3000', purchased: '2024-03-18', costGbp: 7800, bookValueGbp: 4600, authorised: 'trained workshop staff only', nextService: 'filter replacement due 15 September 2026', status: 'AMBER', statusReason: 'planned maintenance falls inside the next 30 days, no known fault', fieldDomains: { costGbp: 'finance_full', bookValueGbp: 'finance_full' } }
];

const MAINTENANCE_CALENDAR = [
  { domain: 'assets_ops', date: '2026-09-01', item: 'EQ-03 spring-tool condition check' },
  { domain: 'assets_ops', date: '2026-09-03', item: 'EQ-06 trolley wheel and brake check' },
  { domain: 'assets_ops', date: '2026-09-15', item: 'EQ-08 ventilation extraction filter replacement' },
  { domain: 'assets_ops', date: '2026-09-18', item: 'insurance renewal, tracked in 07K and 07A' },
  { domain: 'vehicle_status', date: '2026-09-30', item: 'van tyre check' },
  { domain: 'vehicle_status', date: '2026-10-18', item: 'Transit service, or at 55,000 miles' },
  { domain: 'assets_ops', date: '2026-11-22', item: 'sewing machine service' },
  { domain: 'assets_ops', date: '2026-12-07', item: 'compressor service' },
  { domain: 'assets_ops', date: '2026-12-31', item: 'drill and portable electrical inspection' },
  { domain: 'assets_ops', date: '2027-01-31', item: 'foam saw electrical inspection' },
  { domain: 'vehicle_status', date: '2027-02-14', item: 'Transit MOT' }
];

const ASSET_CAPACITY_IMPACT = [
  { domain: 'assets_ops', asset: 'EQ-02 foam saw', impact: 'if unavailable for more than one working day, standard repair throughput is estimated to fall by 15 to 20 per cent unless pre-cut foam can be sourced' },
  { domain: 'assets_ops', asset: 'EQ-04 sewing machine', impact: 'if unavailable, upholstery refresh jobs needing stitching should be held or subcontracted after Commercial and Operations review' },
  { domain: 'vehicle_status', asset: 'Transit van', impact: 'if unavailable, collection and return capacity drops to zero unless a hire vehicle is approved or customer delivery is arranged' }
];

const ASSET_MAINTENANCE_RULES = {
  domain: 'assets_ops',
  reminders: 'maintenance dates should generate reminders 30 days, 7 days and 1 day before the due date where material',
  overdueSafetyCritical: 'RED, and prevents ordinary use until resolved',
  overduePlanned: 'AMBER until assessed',
  precedence: 'Actual defects outrank calendar status.',
  outOfService: 'A machine marked OUT OF SERVICE must not be scheduled into capacity assumptions.',
  vehicleRule: 'No AI worker may certify a vehicle roadworthy from incomplete evidence.',
  competenceRule: 'No AI may infer machine competence from a job title. Use the training and asset records.'
};

const FIXED_ASSET_RECONCILIATION = {
  domain: 'finance_full',
  asOf: '2026-08-28',
  totalNetBookValueGbp: 68300,
  note: 'Management figures reconciling to the GBP 68,300 fixed-asset balance in 07A. The Transit right-of-use asset is included for internal management balance-sheet consistency and is not a statutory accounting opinion.',
  lines: 'FA-001 workshop fit-out GBP 26,000; FA-002 GBP 2,800; FA-003 GBP 3,100; FA-004 GBP 1,650; FA-005 GBP 3,400; FA-006 GBP 1,450; FA-007 GBP 300; FA-008 GBP 220; FA-009 GBP 4,600; FA-010 IT and office hardware GBP 4,180; FA-011 racking and furniture GBP 5,000; FA-012 handling and transport equipment GBP 3,000; FA-013 Transit right-of-use GBP 12,600',
  leaseNote: 'The Transit carrying value of GBP 12,600 against a management lease liability of GBP 14,400 is normal accounting timing and must not be treated as an early-settlement quote. Exact settlement needs a provider statement.'
};

const CAPITAL_REPLACEMENT_WATCH = {
  domain: 'assets_ops',
  approved: 'No asset replacement is currently approved.',
  candidate: 'EQ-02 foam saw: seven years old, two minor blade-alignment repairs in 18 months. Not yet unreliable enough to replace.',
  indicativeCostGbp: 5800,
  requirement: 'Any purchase needs Finance affordability and payback evidence plus Scott Mercer approval.',
  fieldDomains: { indicativeCostGbp: 'finance_summary_ops' }
};

const ASSET_AUTHORISATION = [
  { domain: 'equipment_authorised', person: 'Tony Marsh', authorised: 'all listed workshop assets within training' },
  { domain: 'equipment_authorised', person: 'Ellie Park', authorised: 'EQ-01 to EQ-07 and appropriate EQ-08 use' },
  { domain: 'equipment_authorised', person: 'Ravi Singh', authorised: 'EQ-01, EQ-03, EQ-05, EQ-06, EQ-07 and EQ-08 trained tasks. EQ-02 supervised only until refresher. Not authorised on EQ-04 unless the training record changes.' },
  { domain: 'equipment_authorised', person: 'Mike Evans', authorised: 'EQ-06 handling equipment and Transit route equipment, not production machines' },
  { domain: 'equipment_authorised', person: 'Leah Morgan and Jo Bell', authorised: 'knitting equipment and workstations plus relevant low-risk handling, not repair machines unless separately trained' }
];

module.exports = {
  VEHICLE,
  VEHICLE_MAINTENANCE_HISTORY,
  VAN_HIRE_CONTINGENCY,
  EQUIPMENT_REGISTER,
  MAINTENANCE_CALENDAR,
  ASSET_CAPACITY_IMPACT,
  ASSET_MAINTENANCE_RULES,
  FIXED_ASSET_RECONCILIATION,
  CAPITAL_REPLACEMENT_WATCH,
  ASSET_AUTHORISATION,
  MARKETING_CHANNELS_12M,
  ADS_CAMPAIGNS_90D,
  ADS_CURRENT_POSITION,
  ADS_ATTRIBUTION_WARNING,
  PAID_SEARCH_WASTE,
  MARKETING_SPEND_AUGUST,
  GOOGLE_REVIEW_POSITION,
  RECENT_REVIEWS,
  SOCIAL_POSITION,
  RECENT_SOCIAL_POSTS,
  MARKETING_WATCHPOINTS,
  EMAIL_MARKETING,
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
  COST_OPPORTUNITIES_TOTAL_ANNUAL_GBP,
  PIPELINE_ENQUIRIES,
  OPEN_QUOTES,
  PIPELINE_METRICS,
  QUOTE_DECLINE_REASONS_90D,
  COMPLAINTS,
  COMPLAINT_METRICS_90D,
  REMEDY_AUTHORITY,
  CUSTOMERS,
  CUSTOMER_MASTER_SUMMARY,
  TRADE_ACCOUNT_RULES,
  CUSTOMER_VALUE_METRICS
};
