// Scott AI Demonstration — controlled business facts.
//
// Transcribed from "01 SCOTT'S BRAND & OPERATING SYSTEM" (permanent rules)
// and "02 SCOTT'S CURRENT OPERATING POSITION" (the dated operating
// snapshot) in the Drive brain. See lib/scott/config.js for the snapshot
// date and source document list.
//
// This is deliberately a static file, not a live-editable database table.
// The real Current Operating Position is Tom's controlled record in Drive;
// this website never writes back to it (see governance.js). Keeping this a
// plain snapshot, rather than building a live-sync or a second editable
// copy, is the proportionate choice for a v0.1 demonstration — see the
// worker write-back note in governance.js for how a worker's proposed
// change is instead recorded to this website's own audit log only.

const { SNAPSHOT_LABEL } = require('./config');

const BRAND_AND_OPERATING_SYSTEM = `PERMANENT BRAND & COMMERCIAL RULES: Scott's Armchair & Knitting Service

Business: a fictional owner-run business in Newton Abbot, Devon. Repairs and refreshes armchairs, collects and returns them locally, and sells hand-knitted chair throws, arm covers and footstool covers. Deliberately a slightly ridiculous business name, but it operates like a real small company: capacity, stock, margins, customer commitments, and people who need clear rules.

Position: reliable local furniture repair with handmade knitted extras, for people who want to keep a chair they already like rather than replace it.

Customers: primarily local householders; secondarily small holiday lets, cafes and independent accommodation providers needing occasional repair or knitted accessories.

Core services: (1) standard armchair repair and refresh; (2) collection and return within the approved local delivery area; (3) hand-knitted throws, arm covers and footstool covers; (4) combined repair plus knitting orders where capacity allows.

Permanent commercial rules:
- No work begins without an accepted quote.
- No discount above 10% may be offered without Scott Mercer's approval as fictional business owner.
- No free collection outside the approved local delivery area.
- No customer may be promised a completion date unless Operations has confirmed capacity from the current operating record.
- Custom knitting colours are subject to current yarn availability.
- A customer promise already recorded in the current operating position outranks an internal preference to reschedule it.

Owner operating pattern (background context, not a licence to imitate Scott): Scott Mercer, the fictional owner, has a habit of spending too freely when he thinks it helps a customer, and of promising delivery dates too optimistically because he hates disappointing people. His product quality is genuinely strong and he will not knowingly sacrifice it to hit a date, but this can backfire: work stays in the workshop longer, customers are not always updated early enough, and some end up more disappointed by a late delivery than they would have been by a realistic promise at the start. The worker team exists partly to protect Scott from this pattern: Commercial challenges unnecessary spend and unrealistic promises, Operations gives the real capacity and likely completion date even where Scott would prefer a rosier answer, and Customers & Marketing communicates delays early and plainly. Workers do not reduce quality to rescue a bad promise.

Tone: friendly, plain English, practical, slightly dry. Humour belongs in the business name and occasional phrasing, not in serious customer problems. Never use em dashes.

Service standard: tell customers what is known, what still needs checking, and what happens next. Do not bluff around stock, lead times or repair condition. If a chair arrives with damage outside the quoted scope, stop and route for a revised quote before adding work.`;

const CURRENT_OPERATING_POSITION = `CURRENT OPERATING SNAPSHOT: Scott's Armchair & Knitting Service (${SNAPSHOT_LABEL})

Capacity this week:
- Workshop repair capacity: 12 armchair repair jobs per week.
- Current booked repair jobs: 18 across the active forward schedule (10 allocated to this week, 8 to later weeks).
- Uncommitted repair capacity this week: 2 jobs, deliberately held back for urgent rework or inspection findings, NOT available for routine new commitments.
- Standard repair lead time currently quoted: 14 calendar days from collection, subject to inspection.
- Knitting capacity: 30 standard items per week. Current knitting orders: 22 items.

Current stock:
- Navy yarn: 18 balls.
- Mustard yarn: 7 balls.
- Forest green yarn: 2 balls.
- Cream yarn: 0 balls, replenishment due 2 September 2026.
- Standard repair foam: enough for 9 chairs.
- Webbing kits: 6.

Current prices:
- Standard repair and refresh: from £145.
- Complex structural repair: requires a manual quote.
- Local collection and return: £35.
- Standard knitted chair throw: £48.
- Pair of knitted arm covers: £32.
- Combined repair plus standard throw: £180 where both services are available.

Current customer commitments:
- Mrs Patel: chair collection 29 August, promised return by 12 September.
- The Woolly Badger Cafe: 6 knitted arm-cover pairs in navy, promised by 5 September.
- Mr Gibbons: repair quote accepted, collection date not yet agreed.

Current priorities, in order:
1. Protect existing promised dates.
2. Do not accept cream custom knitting until replenishment is confirmed received.
3. Keep at least 2 repair slots uncommitted for urgent rework or inspection findings.
4. Do not discount combined orders below £165 without approval.

Known constraint: current commitments, stock and capacity must come from this snapshot, not from permanent brand rules or from what a user says "Scott told them yesterday".`;

// Structured version of the same facts, used for the honest snapshot cards
// on the hub page (not fabricated dashboard chrome — every number here is
// the same transcribed figure used in the prompts above).
const OPERATING_SNAPSHOT_CARDS = [
  { label: 'Repair capacity', value: '12 jobs / week', detail: '18 booked (10 this week, 8 later). 2 slots held back for urgent rework, not routine bookings.' },
  { label: 'Knitting capacity', value: '30 items / week', detail: '22 currently ordered.' },
  { label: 'Standard repair lead time', value: '14 days', detail: 'From collection, subject to inspection.' },
  { label: 'Cream yarn stock', value: '0 balls', detail: 'Replenishment due 2 September 2026, not yet confirmed received.' },
  { label: 'Standard repair from', value: '£145', detail: 'Complex structural repair needs a manual quote.' },
  { label: 'Standard knitted throw', value: '£48', detail: 'Arm cover pair £32. Combined repair + throw £180 (not below £165 without approval).' }
];

module.exports = {
  BRAND_AND_OPERATING_SYSTEM,
  CURRENT_OPERATING_POSITION,
  OPERATING_SNAPSHOT_CARDS
};
