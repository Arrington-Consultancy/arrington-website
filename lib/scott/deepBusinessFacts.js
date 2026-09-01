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

// ------------------------------------------------------------
// 07T SCOTT'S COMMERCIAL LEAKAGE & IMPROVEMENT EVIDENCE
// ------------------------------------------------------------
// The register is a management view (07T: "the management opportunity
// view may aggregate findings, but each item must link back to the
// underlying domain record"), so most items are finance_summary_ops,
// which Scott and Tony hold. Three diverge on purpose: the debtor
// opportunity is debtor_flag so Chloe, who chases the money, sees it;
// the owner-discretionary one is director_position and is Scott's alone;
// the Ads one is marketing_performance, matching 07E.
//
// The control principle is the most important thing in this record and is
// carried as data rather than left as a comment, because the workers have
// to state it: an identified opportunity is not a saving, and a realised
// figure may only be claimed after an approved change and a before and
// after measurement.
const IMPROVEMENT_CONTROL_PRINCIPLE = {
  domain: 'finance_summary_ops',
  rule: 'Potential saving is not actual saving.',
  openUntil: 'An opportunity stays OPEN until the evidence is checked and a human-approved action is recorded where one is required.',
  showYourWorking: 'A worker must show the source facts and the arithmetic.',
  neverCut: 'Savings must not be manufactured by cutting necessary safety, quality, customer service, staff rights or evidence controls.',
  routing: 'Where a change belongs to another worker, route it rather than claiming ownership.',
  realisedOnly: 'A realised-savings figure may be shown only after the change has been approved, the state has actually changed, and a before and after measurement exists.'
};

const IMPROVEMENT_REGISTER = [
  { domain: 'marketing_performance', ref: 'OPP-001', title: 'Google Ads irrelevant sofa traffic', source: '07E', evidence: '61 sofa-intent clicks in 30 days, GBP 238 spend, 1 lead, 0 qualified, 0 bookings', annualisedGrossGbp: 2856, recoverableRange: 'GBP 2,004 to GBP 2,568 a year by removing 70 to 90 per cent of the irrelevant spend', action: 'negative-keyword and search-term clean-up, campaign structure review', owner: 'Customers & Marketing proposes, a human reviews the campaign change', status: 'OPEN', confidence: 'HIGH on current spend, MEDIUM on future annual saving' },
  { domain: 'finance_summary_ops', ref: 'OPP-002', title: 'Thursday collection route overrun', source: '07F and 07B', evidence: 'eight Thursday routes averaging 82 miles and 6.8 paid hours, five over 75 miles. August overtime attributable to overruns 10.5 hours at GBP 18.40 loaded cost plus GBP 22 excess van cost', annualisedGrossGbp: 2580, recoverableRange: 'GBP 1,550 to GBP 2,060 a year', action: 'earlier booking cut-off, geographic batching, customer-window negotiation, route-density review', owner: 'Operations', status: 'OPEN', confidence: 'HIGH on August cost, MEDIUM on annual recovery' },
  { domain: 'finance_summary_ops', ref: 'OPP-003', title: 'Quality and rework cost', source: '07N', evidence: 'GBP 1,820 identifiable cost over 90 days, 5.1 per cent rework rate, 31.5 extra workshop hours', annualisedGrossGbp: 7280, recoverableRange: 'GBP 2,400 to GBP 3,200 a year by reducing rework to 3.0 per cent, plus released workshop capacity', action: 'stability-check compliance, foam-specification control, root-cause review, targeted training', owner: 'Quality Control owns the evidence once activated, Operations owns the process, People & HR owns training', status: 'OPEN, corrective actions partly active', confidence: 'HIGH on the recorded 90-day cost, MEDIUM on the saving range' },
  { domain: 'finance_summary_ops', ref: 'OPP-004', title: 'ChairSketch Pro unused licences', source: '07Q', evidence: 'five licences at GBP 34 a month, only two used in 90 days', annualisedGrossGbp: 1224, recoverableRange: 'GBP 1,224 a year, right-sized to two seats', action: 'reduce to two seats', dependency: 'confirm no required dormant-user or export workflow', status: 'OPEN', confidence: 'HIGH' },
  { domain: 'finance_summary_ops', ref: 'OPP-005', title: 'Social Scheduler Plus low utilisation', source: '07Q', evidence: 'GBP 79 a month, used in three sessions in 90 days, current volume could use native scheduling', annualisedGrossGbp: 948, dependency: 'Customers & Marketing must confirm no unique approval or archive requirement', status: 'OPEN', confidence: 'MEDIUM-HIGH' },
  { domain: 'finance_summary_ops', ref: 'OPP-006', title: 'SecureBox legacy archive duplication', source: '07Q', evidence: 'GBP 65 a month retained after the newer managed storage model, no restore from the service in 12 months', annualisedGrossGbp: 780, dependency: 'successful export and restore/retention verification BEFORE cancellation', status: 'OPEN, DO NOT CANCEL YET', confidence: 'MEDIUM' },
  { domain: 'finance_summary_ops', ref: 'OPP-007', title: 'Unused mobile lines', source: '07Q', evidence: 'nine paid SIMs at GBP 22 a month, seven assigned, two unused for six months', annualisedGrossGbp: 528, dependency: 'confirm no spare or emergency purpose', status: 'OPEN', confidence: 'HIGH' },
  { domain: 'finance_summary_ops', ref: 'OPP-008', title: 'Oversized printer plan', source: '07Q', evidence: 'GBP 118 a month for 10,000 pages, six-month actual average 1,850 pages, a 3,000-page plan is GBP 69', annualisedGrossGbp: 588, dependency: 'compare overage and service terms', status: 'OPEN', confidence: 'HIGH' },
  { domain: 'finance_summary_ops', ref: 'OPP-009', title: 'Electricity tariff', source: '07R', evidence: 'GBP 8,760 over 12 months on a variable tariff after the fixed term ended, a comparable fixed quote annualises at GBP 7,420 for the same consumption', annualisedGrossGbp: 1340, dependency: 'Finance to compare standing charges, term, exit conditions and realistic consumption', status: 'OPEN', confidence: 'MEDIUM-HIGH' },
  { domain: 'finance_summary_ops', ref: 'OPP-010', title: 'Trade-waste collection frequency', source: '07R', evidence: 'weekly general waste GBP 118 a month, last eight collections averaging 46 per cent full, fortnightly option GBP 78', annualisedGrossGbp: 480, dependency: 'seasonal volume, hygiene and safe storage', status: 'OPEN', confidence: 'MEDIUM-HIGH' },
  { domain: 'finance_summary_ops', ref: 'OPP-011', title: 'Habitual over-ordering of consumables', source: '07R', evidence: 'a 48-roll case bought monthly at GBP 31.20, rolling usage 31 rolls a month, 82 rolls currently in stock. Evidence supports about 7.75 cases a year rather than 12', annualisedGrossGbp: 133, action: 'reorder point rather than a calendar order', status: 'OPEN', confidence: 'HIGH on the stock and usage, LOW materiality' },
  { domain: 'finance_summary_ops', ref: 'OPP-012', title: 'Insurance renewal comparison', source: '07K', evidence: 'current renewal indication GBP 3,850, an alternative at GBP 3,330 but the goods and customer-property excess increases and the wording needs clarification', annualisedGrossGbp: null, headlineGapGbp: 520, status: 'OPEN, COVER CHECK REQUIRED', confidence: 'HIGH on the premium gap, LOW on net value until cover equivalence is resolved', warning: 'Do not record the GBP 520 as a real saving.' },
  { domain: 'finance_summary_ops', ref: 'OPP-013', title: 'Missed early-payment discount', source: '07M', evidence: 'South Devon Foam & Webbing rolling purchases GBP 46,800 with a 2 per cent discount within 10 days. GBP 31,900 of eligible undisputed invoices were paid after day 10, a gross missed discount of GBP 638', annualisedGrossGbp: 638, recoverableRange: 'GBP 400 to GBP 600 a year where the cash buffer supports early payment', status: 'OPEN', confidence: 'HIGH on the historic miss, MEDIUM on future use' },
  { domain: 'finance_summary_ops', ref: 'OPP-014', title: 'Avoidable expedite and rush delivery', source: '07M', evidence: 'GBP 1,420 of expedite charges over 12 months, only GBP 210 recharged, GBP 1,210 absorbed. About GBP 690 is linked to late ordering or optimistic promised dates', annualisedGrossGbp: 690, recoverableRange: 'GBP 450 to GBP 650 a year', action: 'earlier material trigger, no promise before a stock and lead-time check', status: 'OPEN', confidence: 'MEDIUM-HIGH' },
  { domain: 'finance_summary_ops', ref: 'OPP-015', title: 'Slow-moving speculative fabric', source: '07M and 07S', evidence: 'a 2023 speculative buy of GBP 6,400 above normal policy, GBP 2,100 still held after 12 months, current residual slow-moving cost GBP 620', annualisedGrossGbp: null, status: 'CONTROLLED, NO REORDER', confidence: 'HIGH', warning: 'The cash is already spent. The GBP 620 is sunk cost and must not be reported as a saving. Do not discount below viable margin merely to make the stock disappear.' },
  { domain: 'debtor_flag', ref: 'OPP-016', title: 'Overdue trade debt and working capital', source: '07A and 07G', evidence: 'GBP 7,200 of debtors over 30 days against a target below GBP 5,000. Moorland GBP 3,600 at 43 days, Devon Hearth GBP 1,950 at 36 days', annualisedGrossGbp: null, action: 'evidence-led debtor follow-up, no increased exposure without review', status: 'OPEN', confidence: 'HIGH', warning: 'This is a cash and credit-risk opportunity, not a cost saving. The benefit is faster cash conversion and less reliance on owner or overdraft funding.' },
  { domain: 'finance_summary_ops', ref: 'OPP-017', title: 'Knitting discount leakage', source: '07A and 07S', evidence: 'standard throws and arm covers carry low gross contribution. A 2025 discounted knitting promotion produced strong volume but materially poorer contribution and capacity pressure', annualisedGrossGbp: null, status: 'CONTROL ACTIVE', confidence: 'HIGH', warning: 'The opportunity is preventing future leakage, not recovering historic money. Current control: no casual discounting, combined orders below GBP 165 and discounts above 10 per cent need Scott approval.' },
  { domain: 'director_position', ref: 'OPP-018', title: 'Owner discretionary customer spend', source: '07A ledger', evidence: 'GBP 2,029 recorded direct cost over 12 months. About GBP 560 has a clear complaint or repeat-customer rationale. About GBP 779 has no recorded commercial rationale beyond Scott wanting to help. GBP 690 of avoidable expedite is already counted in OPP-014', annualisedGrossGbp: null, recoverableRange: 'GBP 600 to GBP 900 a year from requiring a recorded commercial reason for discretionary extras', status: 'OPEN', confidence: 'MEDIUM-HIGH because the spend is recorded, though the commercial value of goodwill is not perfectly measurable', warning: 'Do not double-count the GBP 690 already in OPP-014. Demonstrate this carefully: challenge undocumented generosity, do not tell Scott to stop looking after customers.' }
];

// The totals record exists mainly to stop a worker adding the headline
// numbers together. 07T says so directly, and the envelope is deliberately
// a range with named exclusions.
const IMPROVEMENT_TOTALS = {
  domain: 'finance_summary_ops',
  doNotSum: 'Do not simply add every headline value. Some opportunities overlap and some are conditional.',
  envelopeLowGbp: 12825,
  envelopeHighGbp: 15099,
  excludes: 'insurance, the working-capital benefit, slow-stock recovery and the owner-discretionary spend',
  warning: 'This is an opportunity envelope, not a claim that the AI has saved fifteen thousand pounds. A realised figure requires an approved change and a before and after measurement.'
};

// ------------------------------------------------------------
// 07H SCOTT'S MANAGEMENT DASHBOARD & KPI PACK
// ------------------------------------------------------------
// Each attention item carries the domain of the thing it is actually
// about, not a single "dashboard" tag, so "what needs my attention today"
// resolves differently and correctly for each person. Jo Bell gets the
// yarn items because she is the knitter. Chloe gets the debtors and the
// complaint. Tony gets the job, the capacity and the margin. Nobody gets
// a list padded with things they cannot act on.
//
// 07H ends with a rule that matters more than any figure in it, carried
// here as data because the workers have to honour it: this is a summary
// layer and not the highest source of truth. A decision resting on a
// material number must go to the controlled record underneath.
const DASHBOARD_SOURCE_RULE = {
  domain: 'dashboard',
  rule: 'This dashboard is a summary layer, not the highest source of truth. When a decision depends on a material number, customer record, current stock, personnel issue or complaint, use the underlying controlled record rather than treating this summary as proof.'
};

const ATTENTION_TODAY = [
  { domain: 'jobs_ops', rank: 1, item: 'SAKS-1047 is at risk: upholstery fabric is three days late and Jane Fletcher has not been updated', action: 'Operations to confirm revised likely timing, Customers & Marketing to prepare a human-reviewed update today' },
  { domain: 'yarn_stock', rank: 2, item: 'Cream yarn is at zero stock, 24 balls due 2 September', action: 'Do not promise cream knitting until receipt is physically confirmed' },
  { domain: 'staffing_capacity', rank: 3, item: 'Ravi Singh on annual leave 31 August to 4 September, routine repair capacity falls to 8 or 9 jobs next week before overtime or cover', action: 'New date promises must account for this' },
  { domain: 'debtor_flag', rank: 4, item: 'Moorland Holiday Lets owes GBP 3,600 at 43 days, and has both a new four-chair enquiry and an open service complaint', action: 'Handle the complaint and the credit exposure separately' },
  { domain: 'debtor_flag', rank: 5, item: 'Devon Hearth Cafe Group owes GBP 1,950 at 36 days and has a new six-chair combined enquiry', action: 'No further credit without Finance or owner review' },
  { domain: 'complaints_workflow', rank: 6, item: 'Complaint C-260828-01 from Helen Price', action: 'Needs technical reinspection before any remedy is promised' },
  { domain: 'yarn_stock', rank: 7, item: 'Mustard yarn is below reorder point and forest green is critically low' },
  { domain: 'marketing_performance', rank: 8, item: 'Google Ads is wasting spend on irrelevant sofa repair traffic', action: 'A negative-keyword proposal is ready for human review' },
  { domain: 'finance_summary_ops', rank: 9, item: 'August operating profit forecast is GBP 5,900, below recent months because of overtime, rework and collection mileage', action: 'Not a crisis, but a watchpoint' },
  { domain: 'hr_full', rank: 10, item: "Jo Bell's probation review is due 4 September and Chloe Reed's flexible-working request needs a business-impact review before a decision" }
];

const EXECUTIVE_KPIS_FINANCIAL = {
  domain: 'finance_full',
  annualSalesRunRateGbp: 550000,
  turnoverTargetGbp: 565000,
  operatingProfitTargetGbp: 72000,
  aprilToAugustOperatingProfitGbp: 32200,
  grossMarginTargetPct: 50,
  augustForecastGrossMarginPct: 50.4,
  cashGbp: 41800,
  preferredMinimumCashBufferGbp: 25000,
  tradeDebtorsGbp: 31400,
  debtorsOver30DaysGbp: 7200,
  debtorsOver30DaysTargetGbp: 5000
};

const EXECUTIVE_KPIS_OPERATIONAL = {
  domain: 'kpi_trend',
  rolling30DayJobsCompleted: 43,
  rolling30DayOnTimeReturnPct: 88.4,
  onTimeTargetPct: 93,
  rolling30DayReworkRatePct: 4.7,
  last30DayNewEnquiries: 42,
  quoteAcceptanceRatePct: 77.3,
  googleRating: 4.7,
  rolling90DayComplaints: 11
};

const MANAGEMENT_WATCHES = [
  { domain: 'finance_summary_ops', area: 'Commercial', note: 'Knitted products are low margin against repair work and must not be used for casual discounting. Combined standard repair plus throw has workable contribution but drops quickly below GBP 165. No equipment spend above GBP 2,500 without owner approval and an affordability case. Overdue trade accounts are the main cash-quality concern, not the headline bank balance.' },
  { domain: 'jobs_ops', area: 'Operations', note: 'On-time performance at 88.4 per cent is below the 93 per cent target. Causes: supplier delay, prior over-promising, a week of overtime pressure and rework. Ravi is away next week. Two repair slots should stay protected for urgent rework and inspection findings where possible.' },
  { domain: 'customers_contact', area: 'Customers', note: 'Jane Fletcher needs proactive delay communication. Helen Price needs technical assessment. Moorland needs service recovery without mixing it with debt collection. Alan Reeves response is ready for review. Lucy Ford is a positive recovery example who moved to five stars.' },
  { domain: 'hr_full', area: 'People', note: 'No long-term sickness. Ravi leave is the main short-term capacity issue. Jo Bell probation due 4 September. Mike Evans route overrun should be reviewed operationally and not treated as conduct. Chloe Reed flexible-working request undecided.' },
  { domain: 'marketing_performance', area: 'Marketing', note: 'Cost per qualified lead GBP 98.38, seven accepted jobs from decided Ads leads with three still open. Before and after content is strongest. No cream-knitting push until stock receipt. The Moorland two-star review needs a complaint-grounded response.' }
];

const APPROVAL_QUEUE = [
  { domain: 'complaints_workflow', item: 'Helen Price complaint remedy', ready: false, reason: 'needs Operations evidence first' },
  { domain: 'complaints_workflow', item: 'Moorland goodwill credit proposal GBP 35', ready: true },
  { domain: 'quotes', item: 'Woolly Badger extra arm-cover quote GBP 64', ready: true, reason: 'Operations capacity check required before timing' },
  { domain: 'marketing_performance', item: 'Google Ads negative-keyword change proposal', ready: true },
  { domain: 'po_status', item: 'Mustard yarn reorder', ready: true },
  { domain: 'hr_full', item: 'Chloe Reed flexible-working request', ready: false, reason: 'needs a business-impact assessment' },
  { domain: 'staffing_capacity', item: 'New repair technician recruitment', ready: false, reason: 'not approved, the trigger threshold has not been met for three consecutive months' }
];

// ------------------------------------------------------------
// 07M SCOTT'S SUPPLIER RESILIENCE & MATERIAL USAGE LEDGER
// ------------------------------------------------------------
// Split across three domains that fall out of who actually does the work.
// Alternate suppliers and the scorecard are `suppliers_ops` (Scott, Tony,
// Leah). The material usage and wastage ledger is `materials`, which the
// workshop operatives hold: Ellie and Ravi are the people drawing and
// cutting the stuff, and foam wastage running above assumption is their
// evidence before it is anyone else's. The purchasing and expedite
// analysis is finance_summary_ops.
const SUPPLIER_RESILIENCE_PRINCIPLE = {
  domain: 'suppliers_ops',
  rule: 'The business should know which materials have a credible second source before a failure occurs.',
  notAutomatic: 'The existence of an alternative supplier does not permit substitution. Quality, batch consistency, price and the customer commitment must be checked first.',
  humanReview: 'Where a substitute would materially alter quality, colour, specification or cost, the change needs human review and any necessary customer agreement.'
};

const SUPPLIER_ALTERNATES = [
  { domain: 'suppliers_ops', material: 'Standard foam', primary: 'South Devon Foam & Webbing Ltd, 2 working days', alternate: 'Exeter Upholstery Materials, 3 working days, about 6 per cent higher, equivalent standard density', risk: 'LOW', note: 'dual source exists' },
  { domain: 'suppliers_ops', material: 'Webbing kits', primary: 'South Devon Foam & Webbing Ltd, 2 working days', alternate: 'Exeter Upholstery Materials, 3 working days, equivalent kits', risk: 'LOW' },
  { domain: 'suppliers_ops', material: 'Common springs', primary: 'South Devon Foam & Webbing Ltd', alternate: 'Newton Fixings & Timber, 2 to 3 working days, smaller range', risk: 'LOW, AMBER for unusual sizes' },
  { domain: 'suppliers_ops', material: 'Standard yarn colours', primary: 'Tor Yarn Collective, 3 to 4 working days', alternate: 'Dartmoor Wool & Yarn, 4 to 5 working days', risk: 'AMBER', note: 'batch continuity can make alternate stock unsuitable for an in-progress item. Shade and batch must be physically checked before mixing with an existing order: a nominally matching colour is not automatically acceptable.' },
  { domain: 'suppliers_ops', material: 'Cream yarn', primary: 'Tor Yarn Collective', alternate: 'Dartmoor Wool & Yarn list an equivalent cream, but the current batch has NOT been physically verified against the standard', risk: 'AMBER to RED for existing work', note: 'may be useful for new work after a sample check. Cannot be treated as an approved batch substitute yet.' },
  { domain: 'suppliers_ops', material: 'Forest green yarn', primary: 'Tor Yarn Collective', alternate: 'Dartmoor Wool & Yarn sample approved for new standalone orders only', risk: 'AMBER', note: 'do not mix with an existing Tor Yarn batch on the same item. Free stock is critically low.' },
  { domain: 'suppliers_ops', material: 'Heritage and special-order fabric', primary: 'Heritage Fabrics South West', alternate: 'no blanket alternate: design and dye lot are job-specific. Bristol Upholstery Textiles is a potential secondary, subject to customer and specification match.', risk: 'HIGH for active special-order jobs', note: 'each substitution needs job-level review' },
  { domain: 'suppliers_ops', material: 'Timber and fixings', primary: 'Newton Fixings & Timber', alternate: 'South Devon Trade Timber, same or next day for common sizes', risk: 'LOW' }
];

const SUPPLIER_ESCALATION_TRIGGERS = {
  domain: 'suppliers_ops',
  triggers: 'a confirmed delivery moving more than two working days on material linked to a promised job; a second late delivery in a rolling 60 days; a damaged or incorrect delivery affecting usable stock; a price increase above 10 per cent on a normally stocked material; an account placed on stop; a supplier failing to acknowledge a time-sensitive order within one working day; a quality issue affecting multiple jobs; a single-source critical item with less than one lead time of cover',
  thenWhat: 'Operations assesses the alternate source, the customer impact, the price impact, and whether Commercial or Finance input is needed.'
};

const SUPPLIER_SCORECARD_6M = [
  { domain: 'suppliers_ops', supplier: 'South Devon Foam & Webbing', onTimePct: 96, qualityAcceptancePct: 98, responsiveness: 'GOOD', status: 'GREEN' },
  { domain: 'suppliers_ops', supplier: 'Tor Yarn Collective', onTimePct: 91, qualityAcceptancePct: 99, responsiveness: 'GOOD', status: 'AMBER', note: 'several standard colours are currently tight and batch dependency matters' },
  { domain: 'suppliers_ops', supplier: 'Heritage Fabrics South West', onTimePct: 84, qualityAcceptancePct: 98, responsiveness: 'AVERAGE', status: 'AMBER overall, RED on the active SAKS-1047 delay' },
  { domain: 'suppliers_ops', supplier: 'Newton Fixings & Timber', onTimePct: 97, qualityAcceptancePct: 99, responsiveness: 'GOOD', status: 'GREEN' },
  { domain: 'suppliers_ops', supplier: 'Dartmoor Wool & Yarn', onTimePct: null, qualityAcceptancePct: null, responsiveness: 'limited history', status: 'AMBER', note: 'alternate supplier, trial quality acceptable on forest green, AMBER until more batches are validated' },
  { domain: 'suppliers_ops', supplier: 'Exeter Upholstery Materials', onTimePct: null, qualityAcceptancePct: null, responsiveness: 'two prior emergency orders on time', status: 'GREEN as a fallback' }
];

const MATERIAL_USAGE_AUGUST = [
  { domain: 'materials', material: 'Standard foam', planned: '34 chair-equivalents', actual: '36.2 consumed', wastage: '3.4 equivalents, about 10.0 per cent of gross drawn', planningAssumption: '8 per cent', status: 'AMBER', note: 'wastage about 25 per cent above the planning rate. Review cutting and layout practice and the job mix before changing the assumption.' },
  { domain: 'materials', material: 'Webbing kits', planned: '21 kits', actual: '22 used or damaged', wastage: '1 kit, 4.5 per cent', planningAssumption: '3 per cent', status: 'AMBER', note: 'low financial impact, keep monitoring' },
  { domain: 'materials', material: 'Navy yarn', planned: '31 balls', actual: '33 issued, 1.2 returned usable, net 31.8', wastage: '1.2 balls, 3.6 per cent', planningAssumption: '5 per cent', status: 'GREEN' },
  { domain: 'materials', material: 'Mustard yarn', planned: '18 balls', actual: '19 issued, 0.4 returned', wastage: '0.6, 3.2 per cent', planningAssumption: '5 per cent', status: 'GREEN', note: 'stock level is RED, but that is demand and reorder timing rather than waste' },
  { domain: 'materials', material: 'Forest green yarn', planned: '8 balls', actual: '9 issued, 0.3 returned', wastage: '0.7, 7.8 per cent', planningAssumption: '5 per cent', status: 'AMBER', note: 'small sample, do not change the planning rate yet' },
  { domain: 'materials', material: 'Cream yarn', planned: '24 balls', actual: '25.5 before stockout', wastage: '1.5 balls, about 5.9 per cent', planningAssumption: '5 per cent', status: 'AMBER', note: 'the stockout was driven mostly by demand and reorder timing, not excessive waste' },
  { domain: 'materials', material: 'Standard stock upholstery fabric', planned: '118m gross including a 12 per cent waste allowance', actual: '121.6m drawn, 5.3m usable offcuts returned', wastage: '13.1m, 10.8 per cent of gross drawn', planningAssumption: '12 per cent', status: 'GREEN' },
  { domain: 'materials', material: 'Timber repair stock', planned: '11 repair-equivalents', actual: '12.1 drawn, 0.5 returned', wastage: '0.6, about 5 per cent', planningAssumption: '10 per cent', status: 'GREEN' }
];

const MATERIAL_VARIANCE_RULES = {
  domain: 'materials',
  green: 'actual usage and wastage within 15 per cent of the planning assumption, with no repeated unexplained variance',
  amber: 'usage more than 15 per cent above forecast, or wastage more than 25 per cent above the planning assumption, or a repeated two-period drift',
  red: 'material loss or usage creating stockout risk, suggesting a quality, theft or process failure, or materially exposing promised work',
  caution: 'Small samples should be treated cautiously. Do not rewrite a planning assumption because one unusual job created a temporary spike.',
  watchpoints: 'Foam wastage is above the 8 per cent assumption and has crossed the AMBER rule: review the last ten foam-cut jobs for a common cause before changing anything. Forest green waste is slightly high but the volume is too small for a conclusion. The cream stockout was replenishment timing, not waste. There is no evidence of broad unexplained stock loss.'
};

const PURCHASING_OPPORTUNITY = {
  domain: 'finance_summary_ops',
  supplier: 'South Devon Foam & Webbing Ltd',
  rolling12MonthNetPurchasesGbp: 46800,
  terms: '30 days, with a 2 per cent settlement discount on a complete undisputed invoice paid within 10 calendar days',
  capturedGbp: 212,
  capturedOnValueGbp: 10600,
  missedGbp: 638,
  missedOnValueGbp: 31900,
  excludedGbp: 4300,
  warning: 'This does not mean Finance should automatically pay every invoice early. The 2 per cent benefit must be weighed against the cash buffer, VAT and payroll timing, and any borrowing cost. It is a working-capital optimisation, not free money.'
};

const EXPEDITE_HISTORY = {
  domain: 'finance_summary_ops',
  rolling12MonthChargesGbp: 1420,
  recharedToCustomersGbp: 210,
  absorbedGbp: 1210,
  avoidableGbp: 690,
  avoidableCause: 'late internal ordering, or an optimistic customer date agreed before a stock and lead-time check',
  remainder: 'genuine customer-requested urgency, supplier recovery or unusual job conditions',
  opportunityRange: 'GBP 450 to GBP 650 a year from better ordering and promise discipline, after allowing for unavoidable urgent events'
};

const SLOW_MOVING_MATERIAL = {
  domain: 'finance_summary_ops',
  origin: 'a 2023 speculative upholstery-fabric purchase above normal policy, GBP 6,400',
  after12MonthsGbp: 2100,
  currentResidualGbp: 620,
  status: 'most has now been consumed or cleared. Three low-demand fabric lines remain. No new speculative replenishment is approved for those patterns.',
  lesson: 'The historic incident is the evidence for why the system should distinguish booked-job demand from speculative owner enthusiasm.'
};

// ------------------------------------------------------------
// 07K SCOTT'S SAFETY, COMPLIANCE, PRIVACY & INSURANCE
// ------------------------------------------------------------
// The safety baseline and the incident procedure are `safety_baseline`,
// which every persona holds. That is the one universal grant in this
// model and it is deliberate: 07K requires a staff member who believes
// there is an immediate serious safety risk to stop and escalate, and
// that is not a rule anyone can follow if their clearance hides it.
//
// Everything else here is narrower. The incident LOG names individuals
// and is safety_incidents. Insurance cover and the renewal comparison are
// finance_full. Privacy, retention and data-rights handling are
// compliance_privacy, which Chloe holds because she is the one handling
// customer records day to day.
const SAFETY_BASELINE = {
  domain: 'safety_baseline',
  equipment: 'Only trained staff may use the powered workshop equipment listed in the asset register.',
  ppe: 'Safety glasses for cutting, drilling, grinding or spring work.',
  handling: 'Two-person lift or an approved handling aid for heavy or bulky chairs where one-person handling is unsafe.',
  solvents: 'Solvents and adhesives used per the product instructions, in a ventilated area.',
  access: 'Fire exits and access routes must remain clear.',
  firstAid: 'First-aid kit in the workshop office. Tony Marsh is the current trained first aider.',
  stopWork: 'No staff member should continue work where they believe there is an immediate serious safety risk. Stop the task and escalate.'
};

const INCIDENT_PROCEDURE = {
  domain: 'safety_baseline',
  steps: '1. Make the area safe and give first aid or emergency response as needed. 2. Record date and time, people involved, location, a factual description, injury or damage, witnesses and photographs where appropriate. 3. Preserve relevant equipment or materials where a malfunction may be involved. 4. Notify Scott Mercer for any injury needing external medical treatment, significant customer-property damage, fire, a vehicle collision, or anything with material insurance potential. 5. Operations investigates immediate cause and corrective action. 6. Record the preventive action and verify completion before closure.',
  doNotInvent: 'Do not invent statutory reporting obligations. Where a real legal reporting question would arise, flag that specialist human or legal advice is required.'
};

const INCIDENT_LOG = [
  { domain: 'safety_incidents', ref: 'I-260702-01', date: '2026-07-02', detail: 'minor staple-gun finger puncture, no lost time, first aid only', cause: 'hand positioning', action: 'refresher toolbox talk completed 3 July', status: 'CLOSED' },
  { domain: 'safety_incidents', ref: 'I-260811-02', date: '2026-08-11', detail: 'customer chair leg lightly marked during workshop movement. Customer informed before return, finish repaired, no claim', cause: 'inadequate temporary protection on a crowded bench', action: 'protective moving blankets now mandatory for in-workshop transfers', status: 'CLOSED' }
];

const CUSTOMER_PROPERTY_RULES = {
  domain: 'safety_baseline',
  photos: 'Condition photos at collection or intake and at return are required for repair jobs.',
  logging: 'Suspected damage while in the workshop must be logged immediately and linked to the job.',
  evidence: 'Do not alter or delete condition evidence after a dispute begins.',
  admissions: 'Any customer-facing admission, compensation or insurance position must be human-reviewed and based on established facts.'
};

const INSURANCE_COVER = {
  domain: 'finance_full',
  publicLiabilityGbp: 2000000,
  employersLiabilityGbp: 10000000,
  contentsAndEquipmentGbp: 120000,
  customerGoodsPerIncidentGbp: 15000,
  vehicle: 'comprehensive for the current van and authorised drivers',
  businessInterruption: 'up to 12 months following an insured material-loss event',
  renewalDate: '2026-09-18',
  expectedPremiumGbp: 3850,
  rule: 'No AI worker may state that a claim is covered merely because a policy category exists. Claims need human review of the actual circumstances.'
};

const INSURANCE_RENEWAL_COMPARISON = {
  domain: 'finance_full',
  currentPremiumGbp: 3850,
  alternativeQuoteGbp: 3330,
  alternativeFrom: 'Granite Coast Commercial Insurance, quoted 27 August 2026',
  headlineGapGbp: 520,
  sameHeadlineCover: 'public liability GBP 2m, employers liability GBP 10m, contents GBP 120,000, customer goods GBP 15,000 per incident, business interruption 12 months, commercial vehicle included',
  principalDifference: 'the customer-goods excess is GBP 750 instead of GBP 250, plus slightly narrower accidental-damage wording pending broker clarification',
  warning: 'Intentionally not an automatic saving. Finance may identify the premium gap. Governance is not the decision-maker. Scott must compare cover, excess and claims implications with human insurance advice before any switch, and the portal must not present the cheaper quote as the same cover until the wording difference is resolved.'
};

const PRIVACY_PRINCIPLES = {
  domain: 'compliance_privacy',
  collection: 'Collect only what is needed for enquiries, quotes, jobs, customer service, trade-account administration and consented marketing.',
  consent: 'Service-contact data is not automatically marketing consent. A website service enquiry includes consent to be contacted about that enquiry, not promotional marketing.',
  publicResponses: 'Do not expose private customer, employee, financial or complaint details in a public review response.',
  fictionOnly: 'No real personal data from Arrington Consultancy goes into this demonstration. It uses fictional data only.'
};

const RETENTION_RULES = {
  domain: 'compliance_privacy',
  unconvertedEnquiries: '12 months after last contact, unless a complaint, dispute or explicit marketing consent justifies another controlled record',
  transactionRecords: '7 years for quotes, jobs and invoices',
  complaintsAndIncidents: '6 years after closure, unless an active dispute needs longer',
  marketingConsent: 'while the consent or basis exists, plus an audit record of withdrawal',
  employeeRecords: 'during employment plus 6 years after leaving, with unnecessary sensitive detail minimised',
  conversationLogs: '12 months, unless a material decision has been written to a proper controlled record',
  caveat: 'These are fictional internal rules and must not be presented as legal advice.'
};

const DATA_REQUEST_WORKFLOW = {
  domain: 'compliance_privacy',
  steps: '1. Verify the requester before disclosing or materially changing personal information. 2. Log the request and the affected records. 3. Correct demonstrably inaccurate factual data promptly, preserving an audit note where material. 4. For a deletion request, separate records that can leave ordinary operational use from records the business still needs for transaction, dispute or audit reasons. 5. Do not promise blanket deletion before checking the record category. 6. Route uncertain legal questions to human review rather than inventing statutory deadlines or exemptions.',
  breach: 'If information goes to the wrong customer, is exposed in a public response, or is accessed unexpectedly: contain it, preserve the facts, identify what was affected, notify Scott Mercer, record corrective action, and get specialist human advice if a legal notification question arises. AI must never quietly delete evidence to make a breach disappear.'
};

const COMPLIANCE_WATCHPOINTS = [
  { domain: 'finance_full', item: 'Insurance renewal due 18 September 2026' },
  { domain: 'safety_baseline', item: 'Tony Marsh manual-handling refresher due November 2026' },
  { domain: 'safety_baseline', item: 'No open safety incident' },
  { domain: 'compliance_privacy', item: 'No open data breach' },
  { domain: 'compliance_privacy', item: 'Before and after marketing imagery needs a traceable permission record' }
];

// ------------------------------------------------------------
// 07R SCOTT'S PREMISES, FACILITIES & UTILITIES
// ------------------------------------------------------------
// Two new domains. `premises_ops` is the working picture of the building:
// where things are stored, what is due for service, what is broken, how
// many chairs fit. `premises_access` is the key and fob register, which
// is narrower because it is a list of who can get into the building
// unaccompanied. The lease money sits in finance_full.
//
// 07R is also explicit that no AI output may contain alarm codes or
// keysafe information, and that a worker cannot declare a building safe
// or certify electrical or fire systems. Both are carried as data.
const PREMISES = {
  domain: 'premises_ops',
  site: 'Unit 4, Brunel Craft Estate, Newton Abbot, Devon (fictional address, demonstration use only)',
  use: 'workshop, small customer and admin office, material storage, collection and return loading area',
  landlord: 'Newton Commercial Estates Ltd (fictional)',
  leaseCommenced: '2021-04-01',
  leaseEnds: '2028-03-31',
  breakDate: '2027-03-31',
  breakNotice: 'six months written notice',
  internalDecisionDeadline: '2026-09-30 is the internal latest safe date to record a break decision before the notice process, subject to human lease review',
  rentReview: '2027-04-01',
  totalFloorAreaSqFt: 4850,
  areas: 'Workshop A structural and repair 1,550 sq ft; Workshop B upholstery, sewing and finishing 1,050; knitting and soft goods 500; material store and quarantine 650; customer and admin office 500; welfare, kitchen and toilets 250; internal loading and circulation 350',
  disputes: 'No current landlord dispute, arrears or dilapidations claim.'
};

const PREMISES_LEASE_COSTS = {
  domain: 'finance_full',
  baseRentMonthlyGbp: 3750,
  businessRatesMonthlyGbp: 900,
  combinedMonthlyGbp: 4650,
  serviceCharge: 'none currently billed. Estate common-area maintenance is inside the rent assumption for this demonstration.',
  depositHeldGbp: 11250,
  depositNote: 'three months base rent, held by the landlord as a long-term prepaid deposit outside ordinary monthly profit and loss. Finance must not treat it as available cash.'
};

const PREMISES_STORAGE = {
  domain: 'premises_ops',
  currentChairsOnSite: 17,
  comfortableCeiling: 20,
  hardCeiling: 24,
  status: 'GREEN',
  rule: 'Above 20 is AMBER for congestion and handling risk. Above 24 needs Operations to create an explicit safe temporary storage plan. The layout supports 24 but becomes inefficient above 20 because circulation and staged-work separation tighten.',
  positions: 'Chair intake IN-01 to IN-06 beside the condition-photo zone. Structural work in progress A-WIP-01 to A-WIP-06. Upholstery work in progress B-WIP-01 to B-WIP-05. Ready to return OUT-01 to OUT-04. Controlled overflow OF-01 to OF-03, only under a safe storage plan. Quarantine cage Q-01 in the material store for suspect foam or fabric labelled HOLD.',
  materials: 'Yarn shelves Y-A to Y-D separated by SKU and batch. Foam rack F-A and F-B. Webbing and spring bins W-1, W-2, S-1 to S-3. Timber and fixings T-1 to T-4. Welfare consumables on Facilities Shelf F3. Cleaning chemicals in locked cupboard C-1 with product instructions retained. First-aid cabinet FA-1 at the workshop and admin threshold.',
  loadingRule: 'Single-van access. A maximum of two customer chairs staged outside the secure workshop at one time, and only during active collection or return handling.'
};

const PREMISES_UTILITIES = {
  domain: 'premises_ops',
  electricity: 'Moorland Business Energy, variable business tariff since 1 June 2026. 28,900 kWh rolling consumption. Highest month January 2026 at 3,140 kWh, lowest June 2026 at 1,820 kWh.',
  electricitySpendGbp: 8760,
  water: 'South Devon Business Water, about GBP 96 a month, 164 cubic metres over 12 months, no abnormal leak pattern',
  broadband: 'WestNet Fibre Business 500, GBP 89 a month, with a 4G failover SIM',
  telephone: 'Coastline Cloud Voice, GBP 96 a month',
  gas: 'no production gas supply',
  status: 'Electricity, water, internet and telephone all GREEN. Last power outage 17 July 2026, 48 minutes, no customer deadline missed. Last internet outage 7 August 2026, 55 minutes. Internet availability 99.7 per cent over 90 days.',
  costFinding: 'No unexplained utility spike is RED. Electricity tariff price, not consumption growth, is the cost opportunity.',
  fieldDomains: { electricitySpendGbp: 'finance_summary_ops' }
};

const PREMISES_SERVICE_CALENDAR = [
  { domain: 'premises_ops', date: '2026-08-31', item: 'fire-alarm weekly functional check' },
  { domain: 'premises_ops', date: '2026-09-04', item: 'electrician visit, material-store LED fitting' },
  { domain: 'premises_ops', date: '2026-09-30', item: 'emergency-light test, South Hams Industrial Electrical' },
  { domain: 'premises_ops', date: '2026-10-14', item: 'quarterly pest monitoring visit' },
  { domain: 'premises_ops', date: '2026-11-21', item: 'roller and loading door service, Moorland Doors Ltd, typically GBP 245' },
  { domain: 'premises_ops', date: '2027-01-14', item: 'fire extinguisher service, Devon Fire & Safety Ltd, GBP 310 annual' },
  { domain: 'premises_ops', date: '2027-02-06', item: 'alarm system annual service, Westmoor Security Systems' },
  { domain: 'premises_ops', date: '2027-05-31', item: 'electrical fixed-installation inspection' }
];

const PREMISES_DEFECTS = [
  { domain: 'premises_ops', item: 'Loading-door bottom seal, minor wear noted 12 August', severity: 'low', action: 'price and replace at the scheduled November service rather than an emergency callout, unless the condition worsens', safetyImpact: 'no safety or security failure' },
  { domain: 'premises_ops', item: 'Office rear blind mechanism stiff', severity: 'low', action: 'no operational impact', safetyImpact: 'none' },
  { domain: 'premises_ops', item: 'One material-store LED fitting flickers intermittently', severity: 'low', action: 'electrician booked for 4 September', safetyImpact: 'lighting remains adequate. If failure creates unsafe visibility, stop affected storage handling.' }
];

const PREMISES_ACCESS = {
  domain: 'premises_access',
  keyholders: 'K-01 Scott Mercer, workshop, office and loading fob, alarm admin. K-02 Tony Marsh, same, alarm authorised. K-03 Chloe Reed, office and customer and admin access, alarm authorised for normal open and close. K-04 Ellie Park, workshop opening fob, no alarm-admin authority. K-SPARE-01 sealed spare controlled by Scott, issue must be logged.',
  noKeys: 'Mike, Ravi, Leah and Jo do not hold permanent premises keys in the current record.',
  hardRule: 'No alarm code or keysafe information may ever appear in AI output. A lost key or fob must be reported, the access risk assessed, and the replacement or cancellation recorded.',
  opening: 'Normal first keyholder Tony Marsh, 07:50 to 08:00 weekdays, with Scott or Chloe as backup. Ellie may open for pre-arranged early work but does not administer alarm permissions.'
};

// The opening and closing checks are safety_baseline, not
// premises_access, and the split is deliberate. Ellie opens the workshop
// for pre-arranged early work without being on the alarm-admin list, so
// she needs the checks without needing the key register. Reading who else
// holds a fob is a different thing from knowing to check the fire exits
// are clear before starting.
const PREMISES_OPENING_CHECKS = {
  domain: 'safety_baseline',
  opening: 'External and loading door visually secure with no obvious damage. Alarm unset by an authorised keyholder. Fire exits and routes clear. Check for any obvious water or electrical issue. Confirm workshop ventilation and extraction status is appropriate before relevant work. Review the day schedule and any urgent holds. Check customer-property staging before powered work starts.',
  closing: 'Powered production equipment isolated or switched down. Adhesives and controlled products stored correctly. Customer chairs and materials secured inside. Loading and customer doors checked. Customer information removed from open view. Windows and doors checked. Alarm set by an authorised keyholder. Overnight equipment and utility exceptions recorded.',
  hardRule: 'No AI output contains alarm codes or keysafe information.'
};

const PREMISES_INCIDENT_RULE = {
  domain: 'safety_baseline',
  rule: 'Fire, flood, structural damage, electrical danger, water ingress or any other unsafe condition: make people safe, stop affected work, protect customer property where safe, create an incident record, invoke the continuity and insurance processes, then recalculate jobs and capacity before promising any recovery date.',
  aiLimit: 'AI may identify affected records and draft communications. It cannot declare a building safe or certify electrical or fire systems.'
};

const FACILITIES_CONSUMABLES = [
  { domain: 'premises_ops', item: 'Toilet roll', supplier: 'Devon Workplace Supplies Ltd', pack: 'case of 48, GBP 31.20 plus VAT', currentStock: '82 rolls on Shelf F3', usage: '31 rolls a month over 12 weeks', finding: 'ordered by habit as one case a month regardless of stock, which is about 2.6 months of cover in hand. At current usage no new case is likely to be needed until November.', proposedReorderPoint: '24 rolls, for analysis only. No standing order should change until the facilities owner confirms the count.' },
  { domain: 'premises_ops', item: 'Hand soap', supplier: 'Devon Workplace Supplies Ltd', pack: '5-litre refill, GBP 12.80 plus VAT', currentStock: '2 sealed plus one in use', usage: '0.8 container a month', proposedReorderPoint: '1 sealed container' },
  { domain: 'premises_ops', item: 'Paper towels', supplier: 'Devon Workplace Supplies Ltd', pack: 'case of 12, GBP 24.60 plus VAT', currentStock: '9 rolls', usage: '7 rolls a month' },
  { domain: 'premises_ops', item: 'Bin bags', supplier: 'Devon Workplace Supplies Ltd', pack: '200 heavy duty, GBP 29.40 plus VAT', currentStock: '118', usage: '52 a month' }
];

const FACILITIES_COST_WATCH = {
  domain: 'finance_summary_ops',
  electricity: 'GBP 8,760 over 12 months. The tariff rolled onto a higher variable rate on 1 June 2026 after a fixed term ended. A comparable 12-month fixed quote from South West Business Energy, 24 August 2026, is about GBP 7,420 at the same consumption. Potential gross reduction about GBP 1,340 a year. Finance must compare standing charges, contract terms and actual consumption before any recommendation.',
  tradeWaste: 'Weekly general waste costs GBP 118 a month and the bin averaged 46 per cent full across the last eight collections. A fortnightly option is GBP 78 a month with recycling unchanged. Potential GBP 480 a year, subject to seasonal volume and safe hygienic storage.',
  cleaning: 'External cleaner Tuesday and Friday evenings, two hours each, GBP 18 an hour, about GBP 312 a month. Quality is good and there is no evidence this is waste.',
  doNotDo: 'Do not label a cost avoidable merely because it is discretionary.'
};

// ------------------------------------------------------------
// 07J SCOTT'S POLICIES, TERMS, PAYMENTS & CUSTOMER COMMITMENTS
// ------------------------------------------------------------
// One new domain, `customer_terms`: the rules a person needs in front of
// them when a customer asks what they owe, whether they can cancel, or
// whether a fault is still covered. Chloe holds it because it is her
// daily reference, Tony because Operations makes the date promises the
// terms constrain.
//
// The recurring instruction across this record is that a worker may not
// invent a term, waive a deposit, promise a broader guarantee or invent a
// legal right. Each is carried on the record it applies to rather than
// summarised once, because a worker reading only the payment rules
// should still see the payment rule's own limit.
const OPENING_HOURS = {
  domain: 'customer_terms',
  admin: 'Monday to Friday, 08:30 to 17:00',
  workshopVisits: 'Monday to Friday, 09:00 to 16:30 by arrangement',
  saturday: 'collections and returns only, where pre-booked by Operations',
  sunday: 'closed',
  webForms: 'Website lead forms may be submitted at any time. Submitting a form does not create an accepted booking or a promised date.'
};

const SERVICE_AREA = {
  domain: 'customer_terms',
  standard: 'Standard local collection and return within approximately 15 road miles of Newton Abbot town centre.',
  outside: 'Addresses outside that area need an Operations route check and a Commercial collection-charge review before any commitment.',
  limit: 'No free collection outside the approved standard area.'
};

const PAYMENT_RULES = {
  domain: 'customer_terms',
  under300: 'Householder repair under GBP 300: no routine deposit, payment due before or at return after completion.',
  band300to750: 'GBP 300 to GBP 750: a 25 per cent deposit may be requested where special-order material is required, otherwise payment at completion.',
  over750: 'Above GBP 750, or involving custom or special-order material: 25 per cent deposit normally required before the material order, unless Scott Mercer approves otherwise.',
  knittedStandard: 'Standard knitted items under GBP 100: payment due before dispatch or collection.',
  knittedCustom: 'Custom knitting and special-order colours: 50 per cent deposit before the material order where the material cannot reasonably be reused.',
  trade: 'Trade accounts: 30-day terms only where an approved account exists. A new or materially overdue account needs Finance or owner review before further credit exposure.',
  methods: 'Card, bank transfer, and cash at the workshop up to GBP 250 where a receipt is issued. No cheque unless specifically approved for an existing trade customer.',
  hardRule: 'No worker may invent a payment term or waive a deposit without the correct commercial authority.'
};

const CANCELLATION_RULES = {
  domain: 'customer_terms',
  beforeCollection: 'Before collection or material order: cancel without charge, except genuinely incurred non-refundable special-order material cost where that was made clear and approved in the quote.',
  afterCollection: 'After collection but before work starts: normal collection and transport cost may remain payable if already incurred.',
  afterStart: 'After work starts: the customer remains liable for work reasonably completed and committed non-returnable materials, subject to the agreed quote.',
  missedByCustomer: 'A first reasonable rebooking is normally free where route impact is minimal. Repeated missed arrangements may need a revised collection charge after Commercial review.',
  causedByUs: 'Business-caused rescheduling: tell the customer promptly, offer a realistic revised date, and do not charge for the change.',
  hardRule: 'AI must not invent legal rights, and should route an unclear dispute for human review.'
};

const QUOTE_VALIDITY = {
  domain: 'quotes',
  validity: 'Standard quote validity is 30 calendar days unless the quote says otherwise.',
  supplierPrices: 'Special-order material prices may be subject to supplier-price confirmation at acceptance, where the quote states that.',
  noStart: 'No work begins until the quote is accepted.',
  scopeChange: 'If inspection reveals work outside the quoted scope, stop and issue a revised quote before any extra work begins.'
};

const WARRANTY = {
  domain: 'customer_terms',
  standard: 'Six-month workmanship commitment from the return date, for defects directly attributable to the completed repair work.',
  excluded: 'Not covered: unrelated new damage, misuse, normal wear, pre-existing defects outside the quoted scope, pet damage, moisture damage, or customer alterations after return.',
  rework: 'Replacement work under an accepted workmanship complaint is covered for the remainder of the original six months or 90 days from the rework, whichever is longer.',
  knitted: 'Knitted items: an obvious manufacturing or measurement defect should be reported within 30 days where practical. Fair wear, misuse and damage after use are not automatically a manufacturing defect.',
  hardRule: 'No worker may promise a broader guarantee than this without owner approval and a controlled update to this record.'
};

const COMPLAINT_ESCALATION = {
  domain: 'complaints_workflow',
  stage1: 'Initial complaint handling, aiming for a substantive response within 5 working days.',
  stage2: 'If the customer rejects the proposed resolution, a second human review by Scott Mercer considers the original evidence, the investigation and whether the remedy is proportionate.',
  stage3: 'If still unresolved, issue a final-response note explaining the position and any remaining practical route, such as independent mediation or formal consumer advice.',
  hardRule: 'The AI must not invent a specific regulator, ombudsman or legal entitlement unless a controlled source supports it. No complaint may be closed merely because the customer disagrees: record the final status and the unresolved position accurately.'
};

const REFUND_AUTHORITY = {
  domain: 'customer_terms',
  rework: 'Routine correction or rework inside the original agreed scope may be recommended by Operations.',
  needsCommercial: 'A refund, partial refund, goodwill credit, free collection or free accessory needs Commercial assessment.',
  needsOwner: 'Goodwill above GBP 75, or a refund above 20 per cent of invoice, needs Scott Mercer approval.',
  fullRefund: 'A full refund is exceptional: owner approval plus clear evidence of why rework or a partial remedy is not appropriate.'
};

const COMMUNICATION_COMMITMENTS = {
  domain: 'customer_terms',
  atRisk: 'A customer should be told when a promised date becomes materially at risk, not only after it has been missed.',
  noPromises: 'Do not promise availability or timing until Operations confirms it from current evidence. Do not promise a price exception until Commercial confirms the authority.',
  humanReview: 'Serious complaint responses, review responses and AI-drafted lead replies stay human-reviewed before any simulated send.'
};

// ------------------------------------------------------------
// 07O SCOTT'S BUSINESS CONTINUITY & DISRUPTION PLAN
// ------------------------------------------------------------
// `continuity` for the plan itself (Scott, Tony, Chloe: the three who
// would actually be running the response and talking to customers). The
// opening principle is safety_baseline, because "protect people and
// customer property first" is a rule everyone should be able to read.
//
// The line worth putting in front of a client is in the AI-outage
// section: do not pretend the AI is working if the provider is
// unavailable. A demonstration of an AI system that includes its own
// failure mode is a more honest thing to sell than one that does not.
const CONTINUITY_PRINCIPLE = {
  domain: 'safety_baseline',
  rule: 'Protect people and customer property first, then protect existing customer commitments, recover critical records, and communicate early.',
  neverDo: 'Do not preserve a bad promise by reducing product quality or hiding a delay.'
};

const CONTINUITY_PRIORITY_ORDER = {
  domain: 'continuity',
  order: '1. Safety. 2. Customer property already in our care. 3. Existing promised jobs. 4. Urgent complaint and incident communication. 5. Accepted work not yet started. 6. New enquiries. 7. Marketing activity.',
  advertising: 'Paid advertising should be reduced or paused by human decision if capacity is materially unavailable, rather than continuing to generate demand the business cannot serve.'
};

const CONTINUITY_SCENARIOS = [
  { domain: 'continuity', scenario: 'Power outage', response: 'Stop powered-equipment work safely, preserve chairs and materials, secure the workshop. Operations identifies which jobs need powered equipment and recalculates capacity. Hand work may continue only where quality is not compromised. After two hours, review same-day collection and return impact. If the outage is expected to exceed one working day, surface every promised date at risk and prepare proactive customer updates.', planningAssumption: 'A full two-day power loss reduces that week output by roughly 5 to 7 jobs depending on mix.', limit: 'Do not promise catch-up overtime until staffing and cost are checked.' },
  { domain: 'continuity', scenario: 'Internet, website or AI outage', response: 'The business continues core workshop and telephone operations without AI. The customer coordinator uses the telephone and a local job list. No new AI-generated sends or automated routing until service is restored. Existing accepted jobs, the local schedule and essential contacts take priority. On restoration, reconcile manual events into the portal with clear timestamps.', limit: 'Do not pretend the AI is working if the provider is unavailable. Do not rewrite history when reconciling.' },
  { domain: 'continuity', scenario: 'Phone or email outage', response: 'Use the other approved channel and record the temporary method.', limit: 'For an outage lasting more than half a working day, update the website notice only after human approval.' },
  { domain: 'continuity', scenario: 'Workshop unavailable', response: 'Fire, flood, structural damage or any unsafe condition: do not enter or work until safe. Secure customer property where that does not increase risk. Create an incident record and notify Scott Mercer. Operations identifies jobs and material at risk. The insurance process applies where relevant.', limit: 'Customer updates must state what is known and must avoid unsupported recovery dates.' },
  { domain: 'continuity', scenario: 'Vehicle breakdown', response: 'The van is a single-vehicle dependency. If unavailable for more than one working day: identify the collections and returns affected, price short-term hire against the rescheduling impact, Operations proposes the option, Finance checks affordability where the cost is material, and a human approves any hire.', limit: 'Customers must be updated before a missed collection window where possible.' },
  { domain: 'continuity', scenario: 'Supplier failure', response: 'Check the approved alternate for standard materials, including quality and specification. Surface promised jobs at risk immediately.', limit: 'For special-order fabric or yarn, do not substitute without job-specific review and a customer impact assessment.' },
  { domain: 'continuity', scenario: 'Data or system failure', response: 'The website database and the controlled Drive brain are separate. If isolated demo state is restored from a snapshot, record the recovery event in Activity.', limit: 'A website outage or data issue must never be represented as loss or change to the controlled Drive brain, and website conversation history is never written into Drive automatically.' },
  { domain: 'continuity', scenario: 'Cash or payment disruption', response: 'A human may record a bank-transfer or cash arrangement only where the payment rules permit it. Finance identifies the issue and routes human action.', limit: 'No worker invents a successful payment. Payroll, tax and supplier commitments are never silently delayed by AI.' }
];

const KEY_PERSON_ABSENCE = [
  { domain: 'staffing_capacity', person: 'Tony Marsh', effect: 'structural and final-quality capacity materially reduced. Ellie and Ravi cover standard work within their authorisation.', limit: 'No one should self-authorise beyond their training.' },
  { domain: 'staffing_capacity', person: 'Ellie Park', effect: 'upholstery refresh capacity reduced' },
  { domain: 'staffing_capacity', person: 'Ravi Singh', effect: 'field inspection and repair capacity reduced, as already recorded for 31 August to 4 September' },
  { domain: 'staffing_capacity', person: 'Leah Morgan', effect: 'knitting quality and custom-pattern capacity reduced. Jo remains standard-pattern only unless separately signed off.' },
  { domain: 'staffing_capacity', person: 'Scott Mercer', effect: 'routine workers continue within their authority. Owner-level exceptions wait.' }
];

const RECOVERY_CHECKLIST = {
  domain: 'continuity',
  before: 'Before declaring normal operation restored: the safety or asset issue is resolved, manual records are reconciled, current capacity is recalculated, the stock and supplier position is refreshed, customer promises are reviewed, missed or late communications are identified, the approvals queue is current, and the dashboard risk list is regenerated.'
};

// ------------------------------------------------------------
// 07P SCOTT'S MARKETING ASSET & CONSENT REGISTER
// ------------------------------------------------------------
// `marketing_consent`, held by Scott, Tony and Chloe. This is the record
// that stops a plausible marketing suggestion being an unlawful one, and
// it is the best demonstration in the dataset of a worker being made to
// check before it speaks: several assets here are attractive, publishable
// images that are permanently prohibited because of what the source file
// is, not what it looks like.
const CONSENT_RULE = {
  domain: 'marketing_consent',
  rule: 'No customer-identifiable story, image, quote or testimonial may be used in public marketing unless the permitted use is recorded here, or the asset is fully anonymised and non-identifying.',
  notAutomatic: 'Service consent is not automatically marketing consent.',
  withdrawal: 'Withdrawal stops future use while preserving a minimal audit record. Do not rewrite history to pretend a prior authorised use never happened.',
  testimonials: 'A public review may be responded to in the review channel, but reusing review wording as a separate marketing testimonial needs its own recorded permission. Never fabricate review text, star ratings or customer quotes.',
  staff: 'Staff photos need recorded permission where the person is identifiable. Never use an HR, disciplinary or health detail in marketing.',
  scheduling: 'Before a post moves from draft to ready for human review, the asset reference must be checked against current permission status. If an asset becomes withdrawn after scheduling but before publication, the content is held automatically for redraft.'
};

const MARKETING_ASSETS = [
  { domain: 'marketing_consent', ref: 'A-260601-01', subject: 'SAKS-0998, customer name withheld', asset: 'before and after wingback photos, identifiable home background removed', status: 'APPROVED', channels: 'website, social, Google Business Profile', permissionDate: '2026-06-03', restriction: 'no customer name' },
  { domain: 'marketing_consent', ref: 'A-260722-02', subject: 'Peter Wynne, SAKS-1022', asset: 'workshop before and after images plus a short customer quote', status: 'APPROVED', channels: 'Facebook, Instagram, website', permissionDate: '2026-07-25', restriction: 'do not publish address or telephone', currentUse: 'the 21 August green wingback post is based on this' },
  { domain: 'marketing_consent', ref: 'A-260815-03', subject: 'Lucy Ford', asset: 'knitting replacement resolution story', status: 'APPROVED FOR REVIEW QUOTE ONLY', channels: 'website, review-response case study', permissionDate: '2026-08-20', restriction: 'no complaint detail beyond what the customer has publicly stated' },
  { domain: 'marketing_consent', ref: 'A-260818-04', subject: 'Alan Reeves', asset: 'fabric-refresh photos', status: 'NOT GRANTED FOR MARKETING', channels: 'none', restriction: 'retained only as service and complaint evidence. Use prohibited.' },
  { domain: 'marketing_consent', ref: 'A-260824-05', subject: 'Leah Morgan', asset: 'workshop yarn-batch explainer, staff image', status: 'APPROVED', channels: 'Instagram, Facebook, website', permissionDate: '2026-08-22', currentUse: 'the 24 August yarn-batch post' },
  { domain: 'marketing_consent', ref: 'A-260826-06', subject: 'SAKS-1045', asset: 'frame-repair process close-ups, chair only, no identifiable customer detail', status: 'APPROVED ANONYMISED', channels: 'social, website', currentUse: 'not yet published' },
  { domain: 'marketing_consent', ref: 'A-260828-07', subject: 'Helen Price', asset: 'complaint photo', status: 'SERVICE EVIDENCE ONLY', channels: 'complaint and internal evidence', restriction: 'marketing use PROHIBITED' },
  { domain: 'marketing_consent', ref: 'A-250610-08', subject: 'Harbour View Guest House', asset: 'two restored lounge chairs, premises signage cropped', status: 'APPROVED ANONYMISED', channels: 'website, Facebook, Instagram', permissionDate: '2025-06-12', currentUse: 'archived but reusable' },
  { domain: 'marketing_consent', ref: 'A-250719-09', subject: 'Sue Barrett', asset: 'customer-written thank-you email, identifiable quote', status: 'APPROVED for short testimonial only', permissionDate: '2025-07-23', restriction: "surname abbreviated to 'Sue B.', no address or job value" },
  { domain: 'marketing_consent', ref: 'A-250831-10', subject: 'discounted knitting campaign', asset: 'product-only photos, no customer identity', status: 'COMPANY ASSET, unrestricted', restriction: 'the historic promotion price must not be repeated without current Commercial approval' },
  { domain: 'marketing_consent', ref: 'A-251015-11', subject: 'Riviera Reading Rooms', asset: 'venue chair set, venue identifiable', status: 'APPROVED', channels: 'Facebook, website trade example', permissionDate: '2025-10-20', restriction: 'no invoice or payment data' },
  { domain: 'marketing_consent', ref: 'A-251122-12', subject: 'archived complaint returns', asset: 'service evidence photographs', status: 'NOT APPROVED FOR MARKETING', restriction: 'evidence channels only, prohibited' },
  { domain: 'marketing_consent', ref: 'A-251208-13', subject: 'Leah Morgan', asset: 'hands demonstrating a cable-knit pattern', status: 'APPROVED', channels: 'Instagram, Facebook, website', permissionDate: '2025-12-08' },
  { domain: 'marketing_consent', ref: 'A-260114-14', subject: 'Green Tor Lodges', asset: 'three-chair refresh, venue identifiable', status: 'APPROVED', channels: 'website, social, Google Business Profile', permissionDate: '2026-01-18', currentUse: 'trade portfolio rotation' },
  { domain: 'marketing_consent', ref: 'A-260202-15', subject: 'Tony Marsh', asset: 'using the foam saw, staff image', status: 'APPROVED WITH SAFETY CONTEXT', channels: 'internal training and external process content', permissionDate: '2026-02-02', restriction: 'must show correct PPE and must not be used if the image would imply unsupported machine practice' },
  { domain: 'marketing_consent', ref: 'A-260305-16', subject: 'Claire Donnelly', asset: 'cream throw product photo in a customer home', status: 'APPROVED ANONYMISED', channels: 'social, website', permissionDate: '2026-03-07', restriction: 'crop the family photograph visible in the original frame before use' },
  { domain: 'marketing_consent', ref: 'A-260407-17', subject: 'Green Tor Lodges', asset: 'customer manager video testimonial', status: 'APPROVED', channels: 'website, social', permissionDate: '2026-04-09', reviewDate: '2027-04-09', restriction: 'no pricing or credit discussion' },
  { domain: 'marketing_consent', ref: 'A-260512-18', subject: 'SAKS-1016', asset: 'finish-defect rework photo', status: 'INTERNAL QUALITY EVIDENCE ONLY', restriction: 'prohibited even though the chair looks attractive after correction, because the source file contains defect evidence' },
  { domain: 'marketing_consent', ref: 'A-260602-19', subject: 'CUST-0035 Sophie Grant', asset: 'standard refresh before and after', status: 'APPROVED ANONYMISED', channels: 'website, social, Google Business Profile', permissionDate: '2026-06-05', currentUse: 'safe candidate, matching the customer-master consent' },
  { domain: 'marketing_consent', ref: 'A-260624-20', subject: 'Mike Evans', asset: 'collection loading process, staff identifiable', status: 'APPROVED', channels: 'website, social', permissionDate: '2026-06-24', restriction: 'do not show a customer address or route sheet in frame' },
  { domain: 'marketing_consent', ref: 'A-260710-21', subject: 'Jo Bell', asset: 'first-month standard throw batch, staff and product', status: 'APPROVED', permissionDate: '2026-07-11', restriction: 'do not present Jo as authorised for custom patterns' },
  { domain: 'marketing_consent', ref: 'A-260719-22', subject: 'Seabreeze Holiday Cottages', asset: 'two chairs in a guest room', status: 'WITHDRAWN', permissionDate: '2026-07-19', withdrawnDate: '2026-08-19', restriction: 'customer withdrew during a normal account review. Remove from future scheduled marketing. The prior authorised July use remains in historic activity and must not be rewritten away.' },
  { domain: 'marketing_consent', ref: 'A-260801-23', subject: 'Newton House Antiques', asset: 'structural repair process close-up', status: 'APPROVED ANONYMISED', channels: 'website, social', permissionDate: '2026-08-02', restriction: 'no customer name or client resale detail' },
  { domain: 'marketing_consent', ref: 'A-260811-24', subject: 'I-260811-02', asset: 'customer-property incident photos', status: 'INCIDENT EVIDENCE ONLY', restriction: 'marketing use PROHIBITED' },
  { domain: 'marketing_consent', ref: 'A-260817-25', subject: 'CUST-0031 Yasmin Chowdhury', asset: 'completed repair photo', status: 'NOT AVAILABLE FOR MARKETING', restriction: 'the service photo exists but marketing permission was never requested' },
  { domain: 'marketing_consent', ref: 'A-260821-26', subject: 'Peter Wynne', asset: 'five-star public review screenshot', status: 'PENDING TESTIMONIAL PERMISSION', restriction: 'the public review channel is permitted, but separate testimonial reuse is not yet approved' },
  { domain: 'marketing_consent', ref: 'A-260827-27', subject: 'workshop-wide staff photograph', asset: 'Tony, Ellie, Ravi, Leah, Jo, Mike and Chloe', status: 'HOLD FOR EXTERNAL USE', restriction: 'permissions recorded for Tony, Ellie, Leah, Mike and Chloe. Ravi and Jo are not yet recorded. Hold until every identifiable person has a permission, or crop the unapproved people out.' }
];

const CONSENT_COUNTS = {
  domain: 'marketing_consent',
  approvedForExternalUse: 15,
  approvedAnonymisedOnly: 6,
  evidenceOnlyOrProhibited: 5,
  pendingOrIncomplete: 2,
  withdrawn: 1,
  companyOwned: 1,
  watchpoints: 'The Alan Reeves and Helen Price assets are evidence-only and must never enter a marketing suggestion. Peter Wynne and the anonymous wingback are safe before-and-after candidates. The Leah Morgan yarn-batch asset supports the currently strong process and skills theme.'
};

// ------------------------------------------------------------
// 07Q/07S RECORD OWNERSHIP REGISTER
// ------------------------------------------------------------
// Who, among the fictional HUMANS, owns correcting each controlled
// source. This exists so that a Brain Gap can be routed to a named person
// rather than to whichever worker happened to notice it.
//
// Two rules hold this together and both are enforced by tests rather than
// by care:
//
// 1. Every owner is a PERSONA id, meaning Scott or one of his staff with
//    a real login. Never a worker id. An AI worker is not a person and
//    cannot be the responsible party for correcting a record, however
//    convenient that would be for closing a queue.
// 2. An owner must hold clearance for the domain they own. Routing a gap
//    to someone who cannot read the evidence it concerns produces an
//    email they can do nothing with, and would be a leak if the email
//    quoted the evidence.
//
// Ownership follows who actually does the work, on the same reasoning
// used for the domain tags themselves: the material waste ledger belongs
// to the operatives drawing and cutting the stuff, the van belongs to the
// person who drives it and reports its defects, yarn belongs to the
// knitting team lead. Where the person who holds the evidence is not the
// person who authorises the decision, `decisionOwner` names the second
// one, because "Mike can confirm the mileage, Tony decides about the
// hire" is the true answer and one field cannot carry it.
// A first draft of this register put Tony on stock_qty, materials,
// complaints_ops and equipment_authorised and Chloe on debtor_risk_flag,
// on the reasonable-sounding basis that a manager owns those areas. The
// clearance model disagreed on all five: those particular domains are
// held by the operatives and, for the debtor risk view, by management
// rather than by admin. The owners below were corrected to people who
// genuinely hold the domain, rather than the clearances widened to match
// the guess. That correction is the whole reason rule 2 is a test.
const RECORD_OWNERSHIP = [
  { domain: 'dashboard', source: '07H Daily Priorities & Attention List', owner: 'scott_mercer' },
  { domain: 'jobs_ops', source: '07B Live Job Board', owner: 'tony_marsh' },
  { domain: 'job_margin', source: '07C Job Cost & Margin Record', owner: 'scott_mercer', decisionOwner: 'scott_mercer' },
  { domain: 'quality_ops', source: '07N Quality & Rework Ledger', owner: 'tony_marsh' },
  { domain: 'quality_full', source: '07N Quality & Rework Ledger', owner: 'tony_marsh' },
  { domain: 'staffing_capacity', source: '07J People, Capacity & Training Record', owner: 'tony_marsh' },
  { domain: 'leave_training', source: '07J People, Capacity & Training Record', owner: 'tony_marsh' },
  { domain: 'overtime_totals', source: '07J People, Capacity & Training Record', owner: 'tony_marsh' },
  { domain: 'hr_full', source: '07J People, Capacity & Training Record (private HR section)', owner: 'scott_mercer' },
  { domain: 'stock_ops', source: '07I Stock & Supply Live Feed', owner: 'tony_marsh' },
  { domain: 'stock_qty', source: '07I Stock & Supply Live Feed (bench quantities)', owner: 'ellie_park', decisionOwner: 'scott_mercer' },
  // Yarn sits with the knitting team lead rather than with general stock:
  // Leah is the person who knows what has physically arrived and what a
  // pattern will actually consume.
  { domain: 'yarn_stock', source: '07I Stock & Supply Live Feed (yarn section)', owner: 'leah_morgan', decisionOwner: 'tony_marsh' },
  { domain: 'suppliers_ops', source: '07M Supplier Resilience Ledger', owner: 'tony_marsh' },
  { domain: 'po_status', source: '07I Purchase Order Register', owner: 'tony_marsh' },
  { domain: 'materials', source: '07M Material Usage & Waste Ledger', owner: 'ellie_park', decisionOwner: 'scott_mercer' },
  { domain: 'leads', source: '07D Pipeline & Enquiry Record', owner: 'chloe_reed' },
  { domain: 'quotes', source: '07D Quote Register', owner: 'scott_mercer', decisionOwner: 'scott_mercer' },
  { domain: 'customers_contact', source: '07G Customer Master', owner: 'chloe_reed' },
  { domain: 'customer_terms', source: '07S Customer Commitments & Terms', owner: 'scott_mercer' },
  { domain: 'trade_terms', source: '07G Trade Account Rules', owner: 'scott_mercer' },
  { domain: 'debtor_flag', source: '07G Trade Account Ledger (debtor flags)', owner: 'chloe_reed', decisionOwner: 'scott_mercer' },
  { domain: 'debtor_risk_flag', source: '07G Trade Account Ledger (management debtor risk view)', owner: 'tony_marsh', decisionOwner: 'scott_mercer' },
  { domain: 'complaints_ops', source: '07 Complaint Register (operational view)', owner: 'tony_marsh', decisionOwner: 'scott_mercer' },
  { domain: 'complaints_workflow', source: '07 Complaint Register & Remedy Authority', owner: 'chloe_reed', decisionOwner: 'scott_mercer' },
  { domain: 'review_status', source: '07E Review & Reputation Position', owner: 'chloe_reed' },
  { domain: 'marketing_performance', source: '07E Marketing & Advertising Performance', owner: 'scott_mercer' },
  { domain: 'marketing_consent', source: '07P Marketing Asset & Consent Register', owner: 'scott_mercer' },
  { domain: 'dept_budget', source: '07E Marketing Spend Record', owner: 'scott_mercer' },
  { domain: 'kpi_trend', source: '07H Executive KPI Set (operational)', owner: 'tony_marsh' },
  { domain: 'finance_summary_ops', source: '07F Management Financial Summary', owner: 'tony_marsh', decisionOwner: 'scott_mercer' },
  { domain: 'finance_full', source: '07F Financial Position', owner: 'scott_mercer' },
  { domain: 'director_position', source: '07F Director & Shareholder Position', owner: 'scott_mercer' },
  { domain: 'assets_ops', source: '07L Asset & Maintenance Register', owner: 'tony_marsh' },
  // The van's condition is reported by the person who drives it. The
  // hire-versus-reschedule decision is explicitly Operations' in 07L, so
  // the two owners are genuinely different people here.
  { domain: 'vehicle_status', source: '07L Vehicle Record', owner: 'mike_evans', decisionOwner: 'tony_marsh' },
  { domain: 'equipment_authorised', source: '07L Asset Authorisation Register', owner: 'ellie_park', decisionOwner: 'scott_mercer' },
  { domain: 'premises_ops', source: '07R Premises & Facilities Record', owner: 'tony_marsh' },
  { domain: 'premises_access', source: '07R Key & Access Register', owner: 'scott_mercer' },
  { domain: 'safety_baseline', source: '07K Safety Baseline', owner: 'tony_marsh' },
  { domain: 'safety_incidents', source: '07K Incident Log', owner: 'tony_marsh', decisionOwner: 'scott_mercer' },
  { domain: 'compliance_privacy', source: '07 Privacy & Retention Rules', owner: 'scott_mercer' },
  { domain: 'continuity', source: '07U Continuity Plan', owner: 'scott_mercer' }
];

module.exports = {
  CONSENT_RULE,
  MARKETING_ASSETS,
  CONSENT_COUNTS,
  CONTINUITY_PRINCIPLE,
  CONTINUITY_PRIORITY_ORDER,
  CONTINUITY_SCENARIOS,
  KEY_PERSON_ABSENCE,
  RECOVERY_CHECKLIST,
  OPENING_HOURS,
  SERVICE_AREA,
  PAYMENT_RULES,
  CANCELLATION_RULES,
  QUOTE_VALIDITY,
  WARRANTY,
  COMPLAINT_ESCALATION,
  REFUND_AUTHORITY,
  COMMUNICATION_COMMITMENTS,
  PREMISES,
  PREMISES_LEASE_COSTS,
  PREMISES_STORAGE,
  PREMISES_UTILITIES,
  PREMISES_SERVICE_CALENDAR,
  PREMISES_DEFECTS,
  PREMISES_ACCESS,
  PREMISES_OPENING_CHECKS,
  PREMISES_INCIDENT_RULE,
  FACILITIES_CONSUMABLES,
  FACILITIES_COST_WATCH,
  SAFETY_BASELINE,
  INCIDENT_PROCEDURE,
  INCIDENT_LOG,
  CUSTOMER_PROPERTY_RULES,
  INSURANCE_COVER,
  INSURANCE_RENEWAL_COMPARISON,
  PRIVACY_PRINCIPLES,
  RETENTION_RULES,
  DATA_REQUEST_WORKFLOW,
  COMPLIANCE_WATCHPOINTS,
  SUPPLIER_RESILIENCE_PRINCIPLE,
  SUPPLIER_ALTERNATES,
  SUPPLIER_ESCALATION_TRIGGERS,
  SUPPLIER_SCORECARD_6M,
  MATERIAL_USAGE_AUGUST,
  MATERIAL_VARIANCE_RULES,
  PURCHASING_OPPORTUNITY,
  EXPEDITE_HISTORY,
  SLOW_MOVING_MATERIAL,
  DASHBOARD_SOURCE_RULE,
  ATTENTION_TODAY,
  EXECUTIVE_KPIS_FINANCIAL,
  EXECUTIVE_KPIS_OPERATIONAL,
  MANAGEMENT_WATCHES,
  APPROVAL_QUEUE,
  IMPROVEMENT_CONTROL_PRINCIPLE,
  IMPROVEMENT_REGISTER,
  IMPROVEMENT_TOTALS,
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
  CUSTOMER_VALUE_METRICS,
  // 07E extended to the four social platforms (30/08/2026). Re-exported
  // from lib/scott/social/fictionalSocial.js rather than duplicated, so
  // there is one copy of the fictional social data and it inherits
  // everything the rest of this module gets: clearance filtering, the
  // Company Brain, worker context and the untagged-export test. No new
  // clearance domain was invented for it; the existing 07E tags carry
  // it, which is what makes Chloe seeing the comments while not seeing
  // the paid performance a real demonstration rather than a mock-up.
  ...require('./social/fictionalSocial'),
  // Six years of social memory (30/08/2026): what was posted, what it
  // cost, what it produced, which directory entries earn their renewal,
  // and what is worth repeating. Same 07E domains, same firewall.
  ...require('./social/socialMemory'),
  // Banking (01/09/2026). Re-exported from lib/scott/banking.js rather
  // than duplicated, exactly as the social data is, so it inherits the
  // clearance filter, the Company Brain and the worker context with
  // nothing new to keep in step. Only the data collections are spread
  // here: the refusal guard and the connection-state helper are behaviour,
  // not records, and belong to the module rather than the brain.
  //
  // The domains are the point. Balances and transactions are finance_full,
  // the "can we pay the suppliers" summary is finance_summary_ops so an
  // operations lead can plan work without seeing the company's cash
  // position, and the owner's personal guarantee is director_position.
  BANK_ACCOUNTS: require('./banking').BANK_ACCOUNTS,
  PAYMENT_CAPACITY_SUMMARY: require('./banking').PAYMENT_CAPACITY_SUMMARY,
  SCHEDULED_PAYMENTS: require('./banking').SCHEDULED_PAYMENTS,
  RECENT_TRANSACTIONS: require('./banking').RECENT_TRANSACTIONS,
  OWNER_BANKING_EXPOSURE: require('./banking').OWNER_BANKING_EXPOSURE,
  BANKING_CONTROLS: require('./banking').BANKING_CONTROLS,
  RECORD_OWNERSHIP
};
