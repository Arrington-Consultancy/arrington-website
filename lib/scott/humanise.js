// Scott's chat replies: the mechanical tells of machine writing, removed
// after the model has answered (12/10/2026, Tom: "I just want it to sound
// human and no silly paragraphs").
//
// The prompt (lib/scott/governance.js, WRITING STYLE) asks for the same
// things; this is the guarantee for the parts that can be fixed without
// judgement. It is deliberately narrow and pure. It never rewords a
// sentence, so it cannot change a figure, a name, a date or a job
// reference, which is what keeps the company's answers consistent. A
// third-party "humaniser" service was considered and rejected for exactly
// that reason: paraphrasing tools reword freely, cost money per reply,
// slow every answer and would send visitors' conversations to another
// company.
//
// What it does, and nothing else:
//   - em and en dashes become commas (a range like 9–5 becomes "9 to 5");
//   - markdown emphasis and heading markers are removed, because the chat
//     shows text, not markdown, so "**Note**" would appear with asterisks;
//   - a stock opener ("Great question!", "Certainly!") is dropped from the
//     very start, and a stock closer ("I hope this helps", "Let me know if
//     you need anything else") from the very end, never from the middle,
//     and never when it is the whole reply;
//   - paragraphs are kept but blank lines between them are removed, so a
//     reply reads as one message rather than a stack of separate blocks.

const STOCK_OPENER = /^(?:(?:great|good|excellent|fantastic|brilliant) question|certainly|absolutely|sure thing|happy to help|thanks for (?:asking|your question))[!.,:]\s+/i;

// Closers are matched only in their stock, contentless forms. "Let me
// know if you want it and I'll book it in" carries an offer and a next
// step, so it stays; "Let me know if you have any other questions" says
// nothing, so it goes.
const STOCK_CLOSER = new RegExp(
  '(?:^|(?<=[.!?])\\s+)(?:' + [
    "i hope (?:this|that) helps",
    "hope (?:this|that) helps",
    "let me know if (?:you have|there are) any (?:other |more |further )?questions",
    "let me know if (?:you need|there's|there is) anything else",
    "(?:please )?feel free to (?:ask|get in touch|reach out)(?: if [^.!?\\n]*)?",
    "(?:is there )?anything else (?:i|we) can (?:help you with|help with|do for you)",
    "don't hesitate to (?:ask|get in touch|reach out)(?: if [^.!?\\n]*)?"
  ].join('|') + ')[.!?]*\\s*$',
  'i'
);

function cleanDashes(s) {
  return s
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.!?])/g, '$1');
}

function cleanMarkdown(s) {
  return s
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '');
}

function humaniseReply(text) {
  if (typeof text !== 'string') return text;
  let s = text.replace(/\r\n?/g, '\n');
  s = cleanMarkdown(cleanDashes(s));

  const withoutOpener = s.replace(STOCK_OPENER, '');
  if (withoutOpener.trim()) {
    s = withoutOpener.charAt(0).toUpperCase() + withoutOpener.slice(1);
  }
  const withoutCloser = s.replace(STOCK_CLOSER, '');
  if (withoutCloser.trim()) s = withoutCloser;

  return s
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

module.exports = { humaniseReply };
