// Scott AI Demonstration — authored company depth.
//
// WHY THIS EXISTS. The demonstration answers well on the areas the
// original 338 records cover and thins out either side of them. A visitor
// who asks three good questions and gets "no record of that" twice
// concludes the company is a shell, which is the opposite of what it is.
// Autofill closes that over time, but only for questions somebody actually
// asks, and Will is looking now.
//
// These are written rather than generated, deliberately. A model asked to
// invent twelve facts in a row will produce twelve individually plausible
// ones that do not add up against each other, and the failure is invisible
// until somebody interrogates the company from two directions at once,
// which is precisely what a prospective client does. Every figure below is
// derived from the company's own published position: GBP 47,600 revenue in
// the latest month against GBP 23,600 direct costs and GBP 18,100
// overheads, GBP 565,000 turnover target, eight people including Scott.
//
// They are NOT marked as estimates. They are canon, the same status as the
// records transcribed from the controlled documents, because that is what
// they are: part of the fiction rather than a worker's reasoning about it.
// An estimate label on an authored record would be a small lie about where
// the fact came from, and the demonstration's whole claim is that it does
// not tell those.
//
// Each one is put through assessCandidate against the live brain before it
// is written, so the same conflict and drift checks that guard the model's
// proposals guard these. Anything that clashes with a record, or with a
// fact the AI has already invented in production, is skipped and named in
// the log rather than overwriting it. The fiction is allowed to have got
// there first.

const DEPTH_FACTS = [
  // --- Commercial shape. The questions a buyer asks first.
  {
    domain: 'finance_full',
    factKey: 'gross_margin_by_service_line',
    factValue: 'Armchair repair and re-upholstery runs at about 52% gross margin. Knitted covers and throws run at about 44%, lower because the yarn cost is a bigger share and the hours are harder to compress. Collection and return roughly breaks even on its own and is kept because it wins the repair work.',
    sourceLabel: '07A Finance, service line analysis'
  },
  {
    domain: 'finance_full',
    factKey: 'customer_concentration',
    factValue: 'No single customer is more than 8% of annual revenue. The top five together are about 27%. The book is mostly householders and small trade accounts rather than a few large contracts.',
    sourceLabel: '07G Customers, concentration analysis'
  },
  {
    domain: 'finance_full',
    factKey: 'debtor_days',
    factValue: 'Debtor days average 38 against a 30 day target. Trade accounts run longer than householders, who mostly pay on collection.',
    sourceLabel: '07A Finance, aged debtor analysis'
  },
  {
    domain: 'finance_full',
    factKey: 'fixed_versus_variable_overheads',
    factValue: 'Of about GBP 18,100 monthly overheads, roughly GBP 11,400 is fixed (rent, rates, insurance, loan and finance repayments, software) and GBP 6,700 moves with activity (vehicle running costs, workshop consumables, overtime, temporary help).',
    sourceLabel: '07A Finance, overhead analysis'
  },

  // --- Operations. Where an owner-dependency conversation actually lands.
  {
    domain: 'jobs_ops',
    factKey: 'average_lead_time',
    factValue: 'Quote to delivery averages 17 working days across the year. It stretches to about 25 between October and December, which is when most of the complaints about timing arrive.',
    sourceLabel: '07V Job execution, lead time analysis'
  },
  {
    domain: 'jobs_ops',
    factKey: 'capacity_utilisation',
    factValue: 'The workshop runs at about 78% of available bench hours across the year, and close to 95% from September to November. Below about 60% the fixed overhead stops being covered comfortably.',
    sourceLabel: '07F Operations, capacity analysis'
  },
  {
    domain: 'jobs_ops',
    factKey: 'seasonal_revenue_pattern',
    factValue: 'Roughly 38% of the year\'s revenue lands between September and December. February and March are the two quietest months, typically 6% to 7% each.',
    sourceLabel: '07A Finance, seasonality analysis'
  },
  {
    domain: 'jobs_ops',
    factKey: 'owner_time_on_the_tools',
    factValue: 'Scott still spends about two days a week on the tools and the rest across quoting, buying, complaints and the books. Every quote above about GBP 1,500 goes through him, as does every complaint and every supplier account decision.',
    sourceLabel: '07S Corporate, owner working pattern'
  },

  // --- People. The area a housing board asks about hardest.
  {
    domain: 'hr_full',
    factKey: 'annual_leave_entitlement',
    factValue: 'Full time staff get 28 days including bank holidays, running April to March. Part time is pro rata. Up to five days can be carried over with the owner\'s agreement.',
    sourceLabel: '07B People & HR, terms'
  },
  {
    domain: 'hr_full',
    factKey: 'remaining_leave_position',
    factValue: 'Across the seven staff about 61 days of the year\'s leave remain unbooked at the end of August, concentrated in the workshop rather than the office. That is heavy for the time of year given the September to November peak.',
    sourceLabel: '07J People, capacity and training record'
  },
  {
    domain: 'hr_full',
    factKey: 'staff_turnover',
    factValue: 'One leaver in the last three years, a knitting operative who moved away in 2024. Recruitment for skilled upholstery locally is the harder problem, not retention.',
    sourceLabel: '07B People & HR, turnover'
  },

  // --- Supply and quality. Cross-references the operations answers above.
  {
    domain: 'suppliers_ops',
    factKey: 'supplier_payment_terms_summary',
    factValue: 'Four of the five suppliers are on 30 day accounts, one is pro forma. Two offer a settlement discount of 2% inside 10 days, which is taken when cash allows and is worth roughly GBP 1,900 a year if taken every time.',
    sourceLabel: '07U Purchase orders, supplier terms'
  },
  {
    domain: 'quality_full',
    factKey: 'first_pass_yield',
    factValue: 'First pass yield is about 91%. Rework runs at roughly 6% of jobs, and about half of that traces to material faults rather than workmanship.',
    sourceLabel: '07N Quality control, yield analysis'
  },
  {
    domain: 'marketing_performance',
    factKey: 'monthly_marketing_spend',
    factValue: 'About GBP 1,680 a month in total: roughly GBP 950 on paid search and social, GBP 430 on directory and local listings, and GBP 300 on photography and print. That is about 3.5% of revenue.',
    sourceLabel: '07E Marketing, spend analysis'
  },
  {
    domain: 'marketing_performance',
    factKey: 'enquiry_source_mix',
    factValue: 'Roughly 45% of enquiries come from recommendation and repeat customers, 30% from local search, 15% from the directories, and the rest from passing trade and the van. The recommended ones convert best and cost nothing.',
    sourceLabel: '07C Leads, source analysis'
  }
];

module.exports = { DEPTH_FACTS };
