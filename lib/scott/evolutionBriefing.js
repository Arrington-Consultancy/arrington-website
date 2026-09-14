// Scott AI Demonstration — sending the evolution briefing.
//
// The join between the pure builder (evolutionDigest.js), the repository
// and the authorised mail path. Kept separate from all three so the
// decision of WHETHER to send is testable without a database or a mailbox,
// and so nothing here has to know how a digest is worded.
//
// Two properties matter and both are structural rather than careful:
//
//   The window is only consumed by a send that actually happened. A
//   failure leaves the marker untouched, so the next run tries again
//   rather than the briefing going quiet for a day because one SMTP call
//   failed. That is governance finding H2's mistake and it is not repeated
//   here.
//
//   The clock is the database. The marker row is read from
//   scott_activity, so a container restart cannot reset the schedule and
//   re-send a briefing already delivered. This app restarts on every push.

const repo = require('./data/repository');
const contextBuilders = require('./data/contextBuilders');
const { buildDigest } = require('./evolutionDigest');
const { digestIsDue, sendEvolutionDigest, digestIntervalHours } = require('./gapNotifier');

// Activity event types that mean the settlement machinery itself failed,
// as opposed to a proposal being refused by it. Only these reach the
// NEEDS YOU block. Written once here and asserted by test, so a new fault
// type cannot be logged and silently never escalated.
const ESCALATION_EVENTS = ['brain_settlement_error', 'brain_cache_reload_failed'];

// Runs one briefing cycle. Never throws: this is called on a timer and a
// failure must not take the process down or stop the next attempt.
// Returns what it did, in words a log line can use without inventing
// anything.
async function runEvolutionBriefing({ force = false, now = new Date() } = {}) {
  try {
    const lastSentAt = await repo.getLastDigestAt();
    if (!force && !digestIsDue(lastSentAt, now)) {
      return { sent: false, reason: 'not due yet', lastSentAt };
    }

    const [added, rejected, retracted, superseded, gapsClosed, pendingCount, faults] = await Promise.all([
      repo.getBrainFactsSince(lastSentAt),
      repo.getBrainRejectionsSince(lastSentAt),
      repo.getBrainRetractionsSince(lastSentAt),
      // What the company's state actually changed to, and what closed
      // itself. Both are reported rather than asked about: neither needs a
      // person, and a briefing that only listed what needs deciding would
      // be the approval queue again under a different heading.
      repo.getBrainSupersessionsSince(lastSentAt),
      repo.getGapsClosedAutomaticallySince(lastSentAt),
      repo.countPendingBrainCandidates(),
      repo.getScottSystemEventsSince(lastSentAt, ESCALATION_EVENTS)
    ]);

    // Escalations are system faults only. A proposal the code rejected is
    // not one; a proposal the code failed to settle at all is.
    const escalations = [];
    if (pendingCount > 0) {
      escalations.push(`${pendingCount} proposed fact${pendingCount === 1 ? ' is' : 's are'} stuck as pending, which should never happen since settlement became automatic. A restart settles them; if it recurs, something in the settlement path is failing.`);
    }
    faults.forEach((f) => {
      escalations.push(`${String(f.event_type).replace(/_/g, ' ')} at ${new Date(f.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}: ${f.summary}`);
    });

    // Nothing learned, nothing rejected, nothing retracted and no fault:
    // send nothing. A briefing that arrives every day saying "no change"
    // is one that stops being read, and the point of this is that it gets
    // read.
    if (!force && added.length === 0 && rejected.length === 0 && retracted.length === 0
      && superseded.length === 0 && gapsClosed.length === 0 && escalations.length === 0) {
      return { sent: false, reason: 'nothing has changed', lastSentAt };
    }

    const digest = buildDigest({
      added,
      rejected,
      retracted,
      superseded,
      gapsClosed,
      escalations,
      canon: contextBuilders.allDeepFactRecords(),
      since: lastSentAt ? new Date(lastSentAt) : null,
      now
    });

    const result = await sendEvolutionDigest(digest);
    if (!result.sent) {
      // Deliberately does NOT write the marker. The window belongs to a
      // delivered briefing, not an attempted one.
      return { sent: false, reason: result.reason, added: added.length, superseded: superseded.length, gapsClosed: gapsClosed.length, rejected: rejected.length, escalations: escalations.length };
    }

    await repo.addActivity({
      actor: 'system',
      eventType: 'brain_digest_sent',
      summary: `Evolution briefing sent to ${result.to}: ${added.length} learned, ${superseded.length} changed, ${gapsClosed.length} gaps closed, ${rejected.length} rejected, ${retracted.length} retracted, ${escalations.length} needing a person.`
    });
    return { sent: true, to: result.to, added: added.length, superseded: superseded.length, gapsClosed: gapsClosed.length, rejected: rejected.length, retracted: retracted.length, escalations: escalations.length, stats: digest.stats };
  } catch (err) {
    console.error('Scott evolution briefing could not run:', err.message);
    return { sent: false, reason: err.message };
  }
}

// Starts the timer. Checks hourly regardless of the configured interval,
// because the interval is enforced by digestIsDue against the database
// clock: checking more often than sending costs one cheap query and means
// a briefing is at most an hour late rather than a whole period late after
// a restart.
//
// Returns the timer so a caller can stop it; unref'd so it never holds the
// process open on its own.
function startEvolutionBriefingSchedule({ intervalMs = 3600 * 1000 } = {}) {
  const tick = () => {
    runEvolutionBriefing().then((r) => {
      if (r.sent) console.log(`Scott evolution briefing: sent to ${r.to} (${r.added} learned, ${r.rejected} rejected, ${r.escalations} needing a person).`);
      else if (r.reason && r.reason !== 'not due yet' && r.reason !== 'nothing has changed') {
        console.warn(`Scott evolution briefing: NOT sent, ${r.reason}`);
      }
    });
  };
  const timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  // One check shortly after boot rather than immediately, so a restart
  // during a deploy does not race the seed finishing.
  const first = setTimeout(tick, 60 * 1000);
  if (first.unref) first.unref();
  return { timer, first };
}

module.exports = {
  ESCALATION_EVENTS,
  runEvolutionBriefing,
  startEvolutionBriefingSchedule,
  digestIntervalHours
};
