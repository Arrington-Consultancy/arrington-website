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
