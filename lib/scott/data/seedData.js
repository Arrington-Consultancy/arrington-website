// Scott AI Demonstration — fictional dataset seed.
//
// Everything below is invented for this demonstration, built consistently
// with "02 SCOTT'S CURRENT OPERATING POSITION" (Mrs Patel, The Woolly Badger
// Cafe and Mr Gibbons are the three customer commitments already named
// there — reused here rather than duplicated under different names) and
// with the Pressure Test Suite's own named scenario (Mrs Jenkins' 14
// knitted armchair covers). Job ref SAKS-1047 is the specific delayed job
// asked for in the implementation brief: a structural repair that turned up
// more damage than the original quote covered, mid-job — the same shape of
// problem the Master Rulebook's "quality vs bad promise" rule and Pressure
// Test T12 already describe, given a concrete, queryable record here.
//
// Idempotent: guarded on scott_customers being empty, so this only ever
// seeds once and never fights a later change made through the demo itself.

async function seedScottData(db) {
  const { rows: existing } = await db.query('SELECT COUNT(*)::int AS n FROM scott_customers');
  if (existing[0].n > 0) {
    return { seeded: false };
  }

  const customer = async (name, kind, location, notes) => {
    const { rows } = await db.query(
      'INSERT INTO scott_customers (name, kind, location, notes) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, kind, location, notes || '']
    );
    return rows[0].id;
  };

  const patelId = await customer('Mrs Patel', 'householder', 'Newton Abbot', 'Long-standing customer, chair has a sentimental history (wedding gift).');
  const badgerId = await customer('The Woolly Badger Cafe', 'business', 'Newton Abbot', 'Repeat business customer, orders arm covers in batches for the cafe seating.');
  const gibbonsId = await customer('Mr Gibbons', 'householder', 'Kingsteignton', 'Accepted a repair quote, has not yet agreed a collection date.');
  const jenkinsId = await customer('Mrs Jenkins', 'householder', 'Newton Abbot', 'Was previously promised free delivery by Scott directly. Wants 14 knitted armchair covers in the usual cream wool.');
  const whitlockId = await customer('Mr Whitlock', 'householder', 'Bovey Tracey', 'Wing-back armchair, structural repair. Wants it back for a family visit.');
  const fletcherId = await customer('Karen Fletcher', 'householder', 'Teignmouth', 'Enquired about a footstool cover to match an existing throw.');
  const bridgesId = await customer('Two Bridges Holiday Cottages', 'business', 'Dartmoor', 'Small holiday-let operator, occasional repair and knitted-accessory orders for guest lounges.');

  const job = async (ref, customerId, kind, description, status, pricePence, promisedDate, collectionDate, atRisk, riskNote) => {
    const { rows } = await db.query(
      `INSERT INTO scott_jobs (ref, customer_id, kind, description, status, price_pence, promised_date, collection_date, at_risk, risk_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [ref, customerId, kind, description, status, pricePence, promisedDate, collectionDate, atRisk, riskNote || '']
    );
    return rows[0].id;
  };

  const patelJobId = await job('SAKS-1041', patelId, 'repair', 'Standard armchair repair and refresh.', 'scheduled', 14500, '2026-09-12', '2026-08-29', false, '');
  const badgerJobId = await job('SAKS-1042', badgerId, 'knitting', 'Six knitted arm-cover pairs, navy, for cafe seating.', 'in_progress', 19200, '2026-09-05', null, false, '');
  const gibbonsJobId = await job('SAKS-1043', gibbonsId, 'repair', 'Repair quote accepted; collection date not yet agreed.', 'quoted', 14500, null, null, false, '');
  const jenkinsJobId = await job('SAKS-1044', jenkinsId, 'knitting', '14 knitted armchair covers, cream wool requested, wants confirmation today.', 'enquiry', null, null, null, true, 'Cream yarn is at 0 balls (replenishment due 2 September, not yet confirmed received). Knitting capacity this week is also tight: only 8 of 30 slots free against a 22-item backlog.');
  const whitlockJobId = await job('SAKS-1047', whitlockId, 'repair', 'Wing-back armchair structural repair and refresh.', 'in_progress', 21000, '2026-09-01', '2026-08-18', true, 'Inspection found additional frame damage beyond the original quoted scope. The approved repair timber needs re-ordering; a faster but non-approved lower-grade material was considered and rejected to protect quality. Original promised date is now at risk.');
  const bridgesJobId = await job('SAKS-1048', bridgesId, 'combined', 'Repair plus standard knitted throw for the guest lounge armchair.', 'awaiting_parts', 18000, '2026-09-10', null, false, '');

  const enquiry = async (customerId, customerName, channel, subject, message, status, assignedWorkerId, relatedJobId, createdAt) => {
    await db.query(
      `INSERT INTO scott_enquiries (customer_id, customer_name, channel, subject, message, status, assigned_worker_id, related_job_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [customerId, customerName, channel, subject, message, status, assignedWorkerId, relatedJobId, createdAt]
    );
  };

  await enquiry(jenkinsId, 'Mrs Jenkins', 'phone', '14 cream armchair covers by Friday', "Mrs Jenkins called wanting 14 knitted armchair covers in the usual cream wool by Friday. Says Scott promised free delivery previously. The regular fitter is off. She said she will order elsewhere unless somebody confirms today.", 'new', null, jenkinsJobId, new Date());
  await enquiry(fletcherId, 'Karen Fletcher', 'email', 'Footstool cover to match an existing throw', 'Karen asked whether we could knit a single footstool cover in forest green to match a throw we made her last year.', 'closed', 'customers_marketing', null, new Date(Date.now() - 6 * 24 * 3600 * 1000));
  await enquiry(null, 'Dave Kowalski', 'website', 'General repair enquiry', "Dave found the site and wants to know if we can look at a chaise longue, not just armchairs.", 'new', null, null, new Date(Date.now() - 3 * 3600 * 1000));

  const activity = async (actor, eventType, summary, relatedJobId, relatedEnquiryId, createdAt) => {
    await db.query(
      `INSERT INTO scott_activity (actor, event_type, summary, related_job_id, related_enquiry_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actor, eventType, summary, relatedJobId || null, relatedEnquiryId || null, createdAt || new Date()]
    );
  };

  await activity('operations', 'job_note', 'Maggie logged the inspection finding on SAKS-1047: extra frame damage found, approved timber needs re-ordering, original date at risk.', whitlockJobId, null, new Date(Date.now() - 20 * 3600 * 1000));
  await activity('customers_marketing', 'enquiry_response', 'Bob replied to Karen Fletcher confirming a forest green footstool cover is possible once yarn stock allows, quoted from the standard price list.', null, null, new Date(Date.now() - 6 * 24 * 3600 * 1000));
  await activity('company_brain', 'record_note', "Derek flagged that the Woolly Badger Cafe order (SAKS-1042) is the cafe's third repeat order this year.", badgerJobId, null, new Date(Date.now() - 2 * 24 * 3600 * 1000));
  await activity('system', 'seed', 'Demonstration dataset seeded — v0.1 snapshot.', null, null, new Date());

  return {
    seeded: true,
    customerIds: { patelId, badgerId, gibbonsId, jenkinsId, whitlockId, fletcherId, bridgesId },
    jobIds: { patelJobId, badgerJobId, gibbonsJobId, jenkinsJobId, whitlockJobId, bridgesJobId }
  };
}

module.exports = { seedScottData };
