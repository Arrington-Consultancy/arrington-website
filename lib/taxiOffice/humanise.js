'use strict';

// A last pass over what the AI writes, so a draft reads like a person in a
// small office wrote it (Tom, 16/10/2026: "this has to sound human"). The
// prompts ask for the same; this catches what slips through. It never
// rewords a sentence, so a time, a price, a name or a reference can't
// change: it only takes out the habits that give machine writing away.
//
//   - dashes (the site has none, Tom 06/10/2026) become commas
//   - markdown (bold, headings, bullet markers) comes out of an email
//   - stock lines ("I hope this email finds you well", "Please do not
//     hesitate to contact us", "We apologise for any inconvenience") are
//     dropped when they stand as their own sentence
//   - runs of blank lines collapse to one, and a sign-off sits on the line
//     directly above the name
//
// Hashtags are left alone: a social post may carry them on purpose.

const STOCK = [
  /^i hope (this|my) (email|message) finds you well[.!]?$/i,
  /^i hope you('re| are) (well|keeping well|having a good (day|week))[.!]?$/i,
  /^thank you for (reaching out|getting in touch|your email|contacting us)[.!]?$/i,
  /^thanks for (reaching out|getting in touch|your email|your message)[.!]?$/i,
  /^(we|i) apologi[sz]e for any inconvenience( (this|that) (may have|has) caused)?[.!]?$/i,
  /^(please )?(do not|don't) hesitate to (contact|get in touch with) us( if you have any (further )?questions)?[.!]?$/i,
  /^if you have any (further |other )?questions,? (please )?(feel free to|do not hesitate to|don't hesitate to) (contact|get in touch with) us[.!]?$/i,
  /^rest assured[^.]*[.!]$/i,
  /^we value your (custom|business)[.!]?$/i
];

function humanise(text) {
  let s = String(text || '').replace(/\r/g, '');
  s = s.replace(/\s*[–—]\s*/g, ', ').replace(/ -- /g, ', ');
  s = s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1');
  s = s.split('\n').map((line) => line.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*•]\s+/, '')).join('\n');
  // Line breaks inside a paragraph (a sign-off under "Thanks,") are kept:
  // stock sentences are taken out line by line.
  const paras = s.split(/\n{2,}/).map((p) => p.split('\n').map((line) => {
    const sentences = line.split(/(?<=[.!?])[ \t]+/);
    return sentences.filter((x) => !STOCK.some((re) => re.test(x.trim()))).join(' ').trim();
  }).filter(Boolean).join('\n')).filter(Boolean);
  // A sign-off sits on the line above the name, not a paragraph above it:
  // "Kind regards,\n\nTidewell Cars" becomes "Kind regards,\nTidewell Cars".
  for (let i = paras.length - 2; i >= 0; i--) {
    if (/^(kind regards|best wishes|many thanks|thanks|thank you|regards|cheers|all the best),?$/i.test(paras[i]) && paras[i + 1].split('\n').length <= 2 && paras[i + 1].length <= 60) {
      paras.splice(i, 2, `${paras[i]}\n${paras[i + 1]}`);
    }
  }
  return paras.join('\n\n').replace(/,\s*,/g, ',').replace(/[ \t]+$/gm, '').trim();
}

module.exports = { humanise, STOCK };
