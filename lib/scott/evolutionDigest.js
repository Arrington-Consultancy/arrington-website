// Scott AI Demonstration — what the company has invented lately.
//
// Autofill (see brainCandidates.js) lets the fictional company answer
// questions it holds no record for, and keep the answer. That is what
// makes the demonstration feel deep rather than empty, and it runs
// unattended, which means nobody is reading what it makes up. A system
// that invents things nobody reviews is not a governed system, it is just
// an unsupervised one with good manners.
//
// This builds the briefing that closes that hole: what was added, what was
// estimated rather than recorded, what it was reasoned from, and whether
// the invented money still adds up against the company's own economics.
//
// Pure. No database, no mail, no clock beyond what it is handed, so the
// wording and the arithmetic can be tested without either.

const ECONOMIC_KEYS = /turnover|salesrunrate|sales_run_rate|runrate/i;

// Anything the invented costs are measured against. Derived from the
// canon rather than stated here, for the same reason the drift envelope
// is: a hardcoded figure describes a company that stops existing the
// moment the fiction grows.
// Walks nested objects and arrays, not just a record's top-level keys.
//
// The first version looked only at top level and therefore never found the
// overheads figure, which lives inside FINANCE_SUMMARY's
// monthlyManagementAccounts array. The briefing consequently reported "no
// overheads figure on record to weigh them against" while the records held
// five of them, so the one aggregate check that a per-answer rule cannot
// make was silently not running. It failed honestly, which is why it was
// visible at all, but the honesty was covering a defect rather than a gap
// in the data.
function walkNumbers(value, visit, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v) => walkNumbers(v, visit, depth + 1));
    return;
  }
  Object.keys(value).forEach((k) => {
    const v = value[k];
    if (typeof v === 'number' && Number.isFinite(v)) visit(k, v);
    else if (v && typeof v === 'object') walkNumbers(v, visit, depth + 1);
  });
}

function companyEconomics(canonRecords = []) {
  let annualTurnoverGbp = 0;
  // The LATEST overheads figure rather than the largest: overheads drift
  // upward, and measuring this month's invented costs against a number
  // from five months ago flatters them.
  let monthlyOverheadsGbp = 0;
  let overheadsAsOf = '';
  let headcount = 0;

  canonRecords.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    walkNumbers(r, (k, v) => {
      if (ECONOMIC_KEYS.test(k) && v > annualTurnoverGbp) annualTurnoverGbp = v;
    });
    if (r.domain === 'staffing_capacity' && typeof r.name === 'string') headcount += 1;
  });

  // Overheads come from the monthly management accounts where they exist,
  // taking the most recent month, and fall back to any overhead-shaped
  // number elsewhere.
  canonRecords.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const months = Array.isArray(r.monthlyManagementAccounts) ? r.monthlyManagementAccounts : null;
    if (months) {
      months.forEach((m) => {
        if (m && typeof m.overheadsGbp === 'number' && String(m.month || '') >= overheadsAsOf) {
          monthlyOverheadsGbp = m.overheadsGbp;
          overheadsAsOf = String(m.month || '');
        }
      });
    }
  });
  if (!monthlyOverheadsGbp) {
    canonRecords.forEach((r) => {
      if (!r || typeof r !== 'object') return;
      walkNumbers(r, (k, v) => {
        if (/overhead/i.test(k) && v > monthlyOverheadsGbp) monthlyOverheadsGbp = v;
      });
    });
  }

  return { annualTurnoverGbp, monthlyOverheadsGbp, overheadsAsOf, headcount };
}

function moneyIn(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  const re = /(-)?\s*(?:£|\bGBP\s*)\s*(-)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(String(m[3]).replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(m[1] || m[2] ? -n : n);
  }
  return out;
}

const gbp = (n) => `GBP ${Number(n).toLocaleString('en-GB')}`;

// The one aggregate check that a per-fact rule cannot make: every invented
// cost can be individually believable while the pile of them stops being
// so. Reported as a proportion of the company's own overheads rather than
// as a pass or fail, because the right threshold is a judgement and this
// briefing exists to put that judgement in front of a person.
function recurringCostPressure(rows, economics) {
  const monthly = rows
    .filter((r) => /budget|spend|cost|fee|subscription|premium|rent/i.test(r.fact_key || ''))
    .flatMap((r) => moneyIn(r.fact_value || ''))
    .filter((n) => n > 0);
  const total = monthly.reduce((a, b) => a + b, 0);
  const share = economics.monthlyOverheadsGbp > 0 ? total / economics.monthlyOverheadsGbp : null;
  return { count: monthly.length, totalGbp: total, shareOfOverheads: share };
}

// Groups by clearance domain, because that is how the company itself is
// organised and it makes an odd addition obvious: a finance figure filed
// under stock is worth seeing.
function byDomain(rows) {
  const out = new Map();
  rows.forEach((r) => {
    const key = r.domain || '(none)';
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(r);
  });
  return [...out.entries()].sort((a, b) => b[1].length - a[1].length);
}

// Builds the briefing. `added` are approved rows, `queued` are the ones
// waiting on a person, and both are reported: a queue nobody mentions is
// how items sit in it for a month.
function buildDigest({ added = [], queued = [], canon = [], since = null, now = new Date() } = {}) {
  const economics = companyEconomics(canon);
  const estimates = added.filter((r) => r.estimated === true);
  const recorded = added.filter((r) => r.estimated !== true);
  const pressure = recurringCostPressure(added, economics);

  const window = since
    ? `since ${since.toLocaleString('en-GB', { timeZone: 'Europe/London' })}`
    : 'since the demonstration started';

  const lines = [];
  lines.push(`Scott's Armchair & Knitting Service has added ${added.length} thing${added.length === 1 ? '' : 's'} to what it knows ${window}.`);
  lines.push('');

  if (!added.length && !queued.length) {
    lines.push('Nothing new. Either nobody has asked it anything it did not already know, or everything asked was already on file.');
  }

  if (added.length) {
    lines.push(`${estimates.length} of those are ESTIMATES it reasoned out, and ${recorded.length} are stated as records.`);
    lines.push('');
    lines.push('WHAT IT ADDED');
    byDomain(added).forEach(([domain, rows]) => {
      lines.push(`  ${domain} (${rows.length})`);
      rows.forEach((r) => {
        lines.push(`    - ${r.fact_key}: ${r.fact_value}`);
        if (r.estimated) lines.push(`      estimated, reasoned from: ${r.basis || 'no basis recorded'}`);
      });
    });
    lines.push('');
  }

  lines.push('DO THE NUMBERS STILL MAKE SENSE');
  if (economics.annualTurnoverGbp) {
    lines.push(`  The company turns over ${gbp(economics.annualTurnoverGbp)} a year with ${economics.headcount} staff on record.`);
  } else {
    lines.push('  No turnover figure on record, so none of the new money could be measured against anything.');
  }
  if (pressure.count === 0) {
    lines.push('  No recurring cost or budget figures were invented, so there is nothing to add up.');
  } else if (pressure.shareOfOverheads === null) {
    lines.push(`  ${pressure.count} invented cost figure${pressure.count === 1 ? '' : 's'} totalling ${gbp(pressure.totalGbp)}, but there is no overheads figure on record to weigh them against.`);
  } else {
    const pct = Math.round(pressure.shareOfOverheads * 100);
    lines.push(`  ${pressure.count} invented cost figure${pressure.count === 1 ? '' : 's'} totalling ${gbp(pressure.totalGbp)} a month, which is ${pct}% of the monthly overheads the company reports (${gbp(economics.monthlyOverheadsGbp)}).`);
    if (pressure.shareOfOverheads > 1) {
      lines.push('  That is more than the whole overhead line. Individually each of these passed, which is exactly the failure a per-answer check cannot catch. Worth reading.');
    } else if (pressure.shareOfOverheads > 0.5) {
      lines.push('  Over half the overhead line is now made up of invented figures. Not wrong, but worth a look before it goes further.');
    }
  }
  lines.push('');

  if (queued.length) {
    lines.push(`WAITING ON YOU (${queued.length})`);
    lines.push('  These were refused automatically and need a person. They are not in the company brain.');
    queued.forEach((r) => {
      const why = [...(r.conflict_flags || []), ...(r.drift_flags || [])].map((f) => f.detail).filter(Boolean);
      lines.push(`    - ${r.domain}/${r.fact_key}: ${r.fact_value}`);
      if (why.length) lines.push(`      held because: ${why.join('; ')}`);
    });
    lines.push('');
  }

  lines.push('Anything here that reads wrong can be removed at /scott/gaps, and the whole behaviour stops by setting SCOTT_BRAIN_AUTOFILL to anything other than true.');

  return {
    subject: `Scott's Armchair & Knitting: ${added.length} new thing${added.length === 1 ? '' : 's'}, ${queued.length} waiting on you`,
    text: lines.join('\n'),
    stats: {
      added: added.length,
      estimates: estimates.length,
      queued: queued.length,
      costPressure: pressure,
      economics
    },
    generatedAt: now
  };
}

module.exports = {
  companyEconomics,
  recurringCostPressure,
  buildDigest
};
