'use strict';

// Where a complaint came in (Tom, 10 November 2026: "Complaints should have
// a text box we can put a complaint into, some could come through other
// ways, through google reviews, Facebook, email or other. The AI needs to
// know what channel so maybe have a drop down menu"). The channel changes
// the reply: a public review gets a short public answer that takes it
// offline, a private message or email gets a full reply, and a phone call
// or a word in person gets a follow-up for staff to send or read from.

const CHANNELS = {
  google_review: { label: 'Google review', public: true, send: 'Copy it and post it as the reply under their review on Google.' },
  facebook_public: { label: 'Facebook review or comment', public: true, send: 'Copy it and post it as the reply under their review or comment on Facebook.' },
  social_message: { label: 'Facebook or Instagram message', public: false, send: 'Copy it and send it as a reply in the same conversation.' },
  email: { label: 'Email', public: false, send: 'Copy it into your email and reply to them from there.' },
  phone: { label: 'Phone call', public: false, send: 'Send it to them, or use it as your notes when you ring them back.' },
  in_person: { label: 'In person', public: false, send: 'Send it to them, or use it as your notes when you speak to them.' },
  other: { label: 'Other', public: false, send: 'Copy it and send it to them the way they got in touch.' }
};

const isChannel = (c) => Object.prototype.hasOwnProperty.call(CHANNELS, c);

// A complaint typed in by staff, as opposed to one that arrived in the
// connected mailbox. Its message id is made up here and can never be a
// real email's.
const isLogged = (kase) => /^<logged-/.test(String((kase && kase.message_id) || ''));

// What the AI is told about the channel, beside the complaint itself.
function channelRules(channel) {
  const c = CHANNELS[channel];
  if (!c) return '';
  if (c.public) {
    return [
      `WHERE IT CAME IN: a ${c.label}. Anyone can read it, and anyone can read the reply.`,
      '- The reply is public, so keep it short: two to four sentences in one paragraph.',
      '- Thank them for the feedback, say sorry once only if the firm got something wrong, and invite them to get in touch directly so the office can look into it properly (by the office number if you have one, otherwise "send us a message").',
      '- Never put a booking reference, a time, an address, a phone number of theirs, a driver, or what the office found in a public reply. That is for the private conversation.',
      '- Start with their first name if the review shows one ("Hi Sarah,"), otherwise no greeting. End with the firm\'s name on its own line, no "Thanks," or "Cheers,".'
    ].join('\n');
  }
  if (channel === 'phone' || channel === 'in_person') {
    return [
      `WHERE IT CAME IN: ${c.label === 'In person' ? 'in person, to a member of staff' : 'a phone call to the office'}. Staff have typed up what the customer said.`,
      '- Draft a short follow-up message to the customer that confirms what they told the office and what happens next. Staff may send it, or read from it when they ring back.'
    ].join('\n');
  }
  return `WHERE IT CAME IN: ${c.label === 'Other' ? 'another way, as staff describe it' : `a ${c.label.toLowerCase()}`}. Reply in the same private conversation.`;
}

module.exports = { CHANNELS, isChannel, isLogged, channelRules };
