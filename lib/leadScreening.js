// Screening footer enquiries for sales pitches (Tom, 30/09/2026: "people or
// bots are hitting my Google Ads and completing the lead form to try and sell
// me something, this has to stop").
//
// Pure: no database, no clock. The route decides what to do with the answer.
//
// The harm this exists to stop is not the email, it is the Ads conversion: an
// enquiry is the Primary conversion bidding optimises on, so every pitch that
// reaches /thank-you with a token teaches Google to find more people who fill
// in contact forms to sell things. A screened enquiry is therefore STILL
// STORED and STILL EMAILED (marked), so a genuine enquiry that happens to
// read like a pitch is never lost; it just never counts as a conversion.
//
// Scored by CATEGORY, not by match count, and it takes two categories to
// flag. One category alone is ordinary: a real owner can write "our SEO is
// poor" or "would you be interested in a call". The pitches actually received
// (August to September 2026) score between 2 and 5.
const SIGNALS = [
  {
    id: 'form_filler',
    // The auto-fill tools put the sender's name in every free-text box they
    // do not recognise, including "Preferred day/time". A person never does.
    test: ({ name, preferredTime }) => {
      const t = norm(preferredTime);
      if (!t) return false;
      const full = norm(name);
      const first = full.split(' ')[0];
      return t === full || (first.length > 1 && t === first);
    }
  },
  {
    id: 'reviewed_your_site',
    // Audit-style wording only. "I came across your website" and "I was
    // looking at your website" are how a genuine prospect writes too.
    test: ({ message }) => /\b(after (reviewing|checking|analy[sz]ing|auditing)|i was (checking|going through|reviewing)|i('ve| have)? (reviewed|analy[sz]ed|audited))( out)? your (website|site|web ?site)\b/.test(message)
      || /^(hi|hello|hey|dear)\s+https?:\/\//.test(message)
  },
  {
    id: 'search_marketing',
    test: ({ message }) => /\b(seo|aeo|geo optimi[sz]ation|answer engine optimi[sz]ation|search engine optimi[sz]ation|organic (search|traffic|visibility|rankings?)|google rankings?|first page of google|backlinks?|guest posts?|domain authority)\b/.test(message)
  },
  {
    id: 'selling_a_service',
    test: ({ message }) => /\b(outsourc\w* your|outsourcing (services|partner)|lead generation|prospecting|virtual assistants?|white[- ]label|digital marketing agency|web design services|app development services|estimated investment|free (audit|analysis|report|consultation|mock-?up)|no obligation|our agency|appointment setting)\b/.test(message)
  },
  {
    id: 'cold_close',
    test: ({ message }) => /\bwould you (be )?(interested|open to|like me to|like to see|have (a few|5|five|ten|10) minutes|have time for)\b/.test(message)
      || /\b(reply|respond) (with )?["']?(yes|stop|no|interested)["']?\b/.test(message)
      || /\bunsubscribe\b/.test(message)
  }
];

const THRESHOLD = 2;

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Returns { suspect, reasons }. reasons lists the signal ids that fired, in a
// fixed order, so the stored reason is stable for the same input.
function screenEnquiry({ name, preferredTime, message } = {}) {
  const input = { name, preferredTime, message: norm(message) };
  const reasons = SIGNALS.filter((s) => s.test(input)).map((s) => s.id);
  return { suspect: reasons.length >= THRESHOLD, reasons };
}

module.exports = { screenEnquiry, THRESHOLD, SIGNAL_IDS: SIGNALS.map((s) => s.id) };
