'use strict';

// A last pass over what the AI writes. The prompts ask for the same; this
// catches what slips through, and it never rewords a sentence, so a time, a
// price, a name or a reference can't change.
//
// Tom, 16/10/2026: "this has to sound human". Tom, 19/10/2026: "I want Toms
// tone of voice and paragraph and dashes rules to apply to the Ai workers".
// His rules are in 01A TOM VOICE - WORKER SPEC in Drive (read 19/10/2026,
// last reviewed 14/10/2026), which is the authority and is still evolving.
// The two that code can hold are held here:
//
//   - no dashes. An em or en dash, a double dash, or a hyphen standing on its
//     own between words becomes a comma; between two figures ("£29–£32.50")
//     it becomes "to". A hyphen inside a word ("8-seater") stays.
//   - paragraphs follow on the next line with no blank line between them. In
//     an email: greeting, one blank line, every body paragraph on consecutive
//     lines, one blank line, sign-off. Anything else (a social post) has no
//     blank lines at all.
//
// It also takes out markdown (bold, headings, bullet markers) and stock lines
// ("I hope this email finds you well", "Please do not hesitate to contact
// us"), when they stand as their own sentence. Hashtags are left alone: a
// social post may carry them on purpose.

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

const GREETING = /^(hi|hello|hey|dear|morning|afternoon|evening|good (morning|afternoon|evening))\b[^\n.!?]{0,60},?$/i;
const SIGN_OFF = /^(kind regards|best wishes|many thanks|thanks|thank you|regards|cheers|all the best)[,!.]?$/i;

function dashesOut(text) {
  return String(text || '')
    .replace(/(\d)\s*(?:[–—]|--)\s*(£?\d)/g, '$1 to $2')
    .replace(/(\d) - (£?\d)/g, '$1 to $2')
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/\s*--+\s*/g, ', ')
    .replace(/ - /g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/^,\s*/gm, '');
}

// A sign-off block: "Thanks" and the name under it, or the name alone.
function isSignOff(para) {
  const lines = para.split('\n');
  if (lines.length > 3 || lines.some((l) => l.length > 60)) return false;
  if (SIGN_OFF.test(lines[0].trim())) return true;
  return lines.length === 1 && !/[.!?#:]/.test(lines[0]) && lines[0].split(/\s+/).length <= 6;
}

// Tom's paragraph rule, on text already split into paragraphs.
function layout(paras) {
  if (!paras.length) return '';
  let greeting = '';
  const first = paras[0].split('\n');
  if (GREETING.test(first[0].trim())) {
    greeting = first[0].trim();
    if (first.length > 1) paras[0] = first.slice(1).join('\n');
    else paras.shift();
  }
  // A sign-off typed straight under the last paragraph comes off it.
  if (paras.length && !isSignOff(paras[paras.length - 1])) {
    const lines = paras[paras.length - 1].split('\n');
    let k = lines.findIndex((l, i) => i > 0 && SIGN_OFF.test(l.trim()));
    if (k < 0 && greeting && lines.length > 1 && /^(office manager, )?tidewell cars$/i.test(lines[lines.length - 1].trim())) k = lines.length - 1;
    if (k > 0 && lines.length - k <= 3) paras.splice(paras.length - 1, 1, lines.slice(0, k).join('\n'), lines.slice(k).join('\n'));
  }
  let signOff = '';
  const last = paras[paras.length - 1];
  if (paras.length > 1 && isSignOff(last) && (greeting || SIGN_OFF.test(last.split('\n')[0].trim()))) signOff = paras.pop();
  const body = paras.join('\n');
  return [greeting, body, signOff].filter(Boolean).join('\n\n');
}

function humanise(text) {
  // A "Subject:" line is the email's header, never part of its body.
  let s = String(text || '').replace(/\r/g, '').replace(/^\s*subject:[^\n]*\n+/i, '');
  s = s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1');
  s = s.split('\n').map((line) => line.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*•]\s+/, '')).join('\n');
  s = dashesOut(s);
  // Line breaks inside a paragraph (a sign-off under "Thanks,") are kept:
  // stock sentences are taken out line by line.
  const paras = s.split(/\n{2,}/).map((p) => p.split('\n').map((line) => {
    const sentences = line.split(/(?<=[.!?])[ \t]+/);
    return sentences.filter((x) => !STOCK.some((re) => re.test(x.trim()))).join(' ').trim();
  }).filter(Boolean).join('\n')).filter(Boolean);
  // A sign-off sits on the line above the name, not a paragraph above it:
  // "Kind regards,\n\nTidewell Cars" becomes "Kind regards,\nTidewell Cars".
  for (let i = paras.length - 2; i >= 0; i--) {
    if (SIGN_OFF.test(paras[i]) && paras[i + 1].split('\n').length <= 2 && paras[i + 1].length <= 60) {
      paras.splice(i, 2, `${paras[i]}\n${paras[i + 1]}`);
    }
  }
  return layout(paras).replace(/,\s*,/g, ',').replace(/[ \t]+$/gm, '').trim();
}

// True when a draft already keeps Tom's paragraph and dash rules, so a test
// can hold every prepared draft to them.
function keepsTheRules(text) {
  return humanise(text) === String(text || '').replace(/\r/g, '').trim();
}

module.exports = { humanise, dashesOut, keepsTheRules, STOCK };
