// The gate every social post passes before it can be queued.
//
// Tom's instruction (31/08/2026): the social chat is "an expert in
// advertising and sniffing anything made from ai", with "a gate for -
// and — and anything over polished and silly paragraphs".
//
// Nothing here is invented. Every rule traces to an authority this
// business already holds:
//
//   - dashes come from the GLOBAL WRITING RULE in Drive (00A MASTER AI
//     RULEBOOK), which test/noEmDashes.test.js already enforces across
//     the repository. All four ways an em dash reaches a reader are
//     checked, because a grep for the literal character once reported
//     three rendered em dashes as clean.
//   - the banned words are the Brand Operating System's own list.
//   - the machine-tell patterns are the findings of the copy review at
//     review/copy-review-2026-07-20.pdf, which counted the "not X, it is
//     Y" construction fourteen times across the live site and called it
//     one of the strongest machine-written tells.
//
// Two severities, and the difference matters. BLOCK is a rule the
// business has already decided; the post cannot be queued until it is
// gone. WARN is a tell: usually worth rewriting, occasionally the right
// words anyway, and never something a machine should overrule a person
// on. A post with warnings can be queued deliberately.

const EM_DASH_FORMS = /—|&mdash;|&#8212;|&#x2014;/g;
const EN_DASH_FORMS = /–|&ndash;|&#8211;|&#x2013;/g;
// A hyphen doing a dash's job: spaced, or doubled. A hyphenated word
// (well-run, half-time) is left alone, which is why this is not simply
// /-/.
const HYPHEN_AS_DASH = /(?:\s+-\s+|\s+--+\s*|--+)/g;

// The Brand Operating System's banned list, as recorded in CLAUDE.md.
const BANNED_WORDS = [
  'solutions', 'synergy', 'leverage', 'empower', 'empowering', 'journey',
  'holistic', 'tailored', 'coach', 'transformational', 'world class',
  'world-class'
];

// Machine tells. These are the vocabulary that marks copy as generated,
// over and above the brand's own banned list.
const AI_VOCABULARY = [
  'delve', 'unlock', 'unlocking', 'elevate', 'seamless', 'seamlessly',
  'robust', 'cutting-edge', 'game-changer', 'game changer', 'testament',
  'landscape', 'realm', 'navigate the', 'foster', 'harness', 'pivotal',
  'myriad', 'plethora', 'in today\'s', 'fast-paced', 'ever-evolving',
  'dive into', 'unpack', 'supercharge', 'turbocharge', 'revolutionise',
  'revolutionize', 'transformative', 'best-in-class', 'thought leader',
  'move the needle', 'circle back', 'at the end of the day'
];

// American spellings that give away a model writing for a UK business.
const US_SPELLINGS = [
  ['organize', 'organise'], ['organized', 'organised'], ['optimize', 'optimise'],
  ['optimized', 'optimised'], ['realize', 'realise'], ['recognize', 'recognise'],
  ['specialize', 'specialise'], ['color', 'colour'], ['favorite', 'favourite'],
  ['center', 'centre'], ['program', 'programme'], ['analyze', 'analyse'],
  ['fulfill', 'fulfil'], ['practicing', 'practising'], ['catalog', 'catalogue']
];

// The Brand OS bans fire metaphors outright: the site's own worst line
// was "constant firefighting", and the review that removed it is the
// reason this list exists.
const FIRE_METAPHORS = /\b(firefight\w*|putting out fires|fires? to put out|burning platform|on fire)\b/gi;

function findAll(text, regex) {
  const out = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ match: m[0], index: m.index });
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

function excerptAround(text, index, length) {
  const start = Math.max(0, index - 34);
  const end = Math.min(text.length, index + length + 34);
  return (start > 0 ? '...' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '...' : '');
}

function sentencesOf(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function checkCopy(input) {
  const text = String(input == null ? '' : input);
  const findings = [];
  const add = (rule, severity, why, fix, excerpt) => findings.push({ rule, severity, why, fix, excerpt });

  // --- BLOCK: the rules the business has already decided -------------

  for (const [label, re] of [['em dash', EM_DASH_FORMS], ['en dash', EN_DASH_FORMS]]) {
    for (const hit of findAll(text, re)) {
      add('dash', 'block',
        `An ${label} is banned everywhere by the GLOBAL WRITING RULE, in every form including the HTML entity.`,
        'Use a comma, a full stop, or brackets.',
        excerptAround(text, hit.index, hit.match.length));
    }
  }

  for (const hit of findAll(text, HYPHEN_AS_DASH)) {
    add('dash', 'block',
      'A hyphen is doing a dash’s job here. The rule is about the punctuation, not the character, so a spaced or doubled hyphen breaks it too.',
      'Use a comma, a full stop, or brackets. Hyphenated words like well-run are fine.',
      excerptAround(text, hit.index, hit.match.length));
  }

  for (const word of BANNED_WORDS) {
    for (const hit of findAll(text, new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'))) {
      add('banned word', 'block',
        `"${hit.match}" is on the Brand Operating System's banned list.`,
        'Say the specific thing instead. What actually changes for the customer?',
        excerptAround(text, hit.index, hit.match.length));
    }
  }

  for (const hit of findAll(text, FIRE_METAPHORS)) {
    add('fire metaphor', 'block',
      'Fire and firefighting language is banned by the Brand Operating System.',
      'Name the actual problem: the thing that keeps going wrong, and how often.',
      excerptAround(text, hit.index, hit.match.length));
  }

  // --- WARN: machine tells -------------------------------------------

  // The copy review's headline finding: fourteen instances across the
  // live site, and the single strongest giveaway.
  for (const hit of findAll(text, /\b(?:it'?s|it is|this is|that'?s)\s+not\s+(?:just\s+)?[^.!?,;]{2,60}[,.]?\s*(?:it'?s|it is)\b/gi)) {
    add('not X, it is Y', 'warn',
      'The "not X, it is Y" construction. The copy review counted this fourteen times on the live site and called it one of the strongest machine-written tells.',
      'Make the positive claim on its own. The contrast is usually carrying nothing.',
      excerptAround(text, hit.index, hit.match.length));
  }

  for (const word of AI_VOCABULARY) {
    for (const hit of findAll(text, new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'))) {
      add('machine vocabulary', 'warn',
        `"${hit.match}" is vocabulary that marks copy as generated.`,
        'Use the plainer word you would say out loud to a customer.',
        excerptAround(text, hit.index, hit.match.length));
    }
  }

  for (const [us, uk] of US_SPELLINGS) {
    for (const hit of findAll(text, new RegExp(`\\b${us}\\b`, 'gi'))) {
      add('US spelling', 'warn', `"${hit.match}" is US spelling; the brand is UK English.`,
        `Use "${uk}".`, excerptAround(text, hit.index, hit.match.length));
    }
  }

  // "real", "properly", "actually": the copy review found these in
  // roughly one sentence in three, "usually sitting where a specific fact
  // would be stronger".
  const hedges = findAll(text, /\b(really|real|properly|actually|genuinely|truly|simply)\b/gi);
  const sentences = sentencesOf(text);
  if (sentences.length && hedges.length / sentences.length > 0.34) {
    add('filler emphasis', 'warn',
      `"real", "properly", "actually" and the like appear ${hedges.length} times across ${sentences.length} sentence(s). The copy review found this habit in about one sentence in three, usually where a specific fact would be stronger.`,
      'Delete them, or replace one with the number or the fact it is standing in for.',
      excerptAround(text, hedges[0].index, hedges[0].match.length));
  }

  // Over-polished: sentences of near-identical length. Human writing is
  // lumpy; generated writing tends to even out.
  if (sentences.length >= 4) {
    const lengths = sentences.map((s) => s.split(/\s+/).length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length);
    if (mean > 7 && sd / mean < 0.22) {
      add('over-polished rhythm', 'warn',
        `Every sentence is close to the same length (${lengths.join(', ')} words). Writing that has been evened out like this reads as generated; real writing is lumpier.`,
        'Cut one sentence to three or four words. Let another run long.',
        sentences[0]);
    }
  }

  // The tricolon, and the one-line closer that follows it.
  for (const hit of findAll(text, /\b\w+,\s+\w+,?\s+and\s+\w+\.\s+(?:That'?s|This is|Simple|Every time)\b/gi)) {
    add('advert cadence', 'warn',
      'A list of three followed by a short closing line. It is the rhythm of a generated advert.',
      'Keep the list or keep the closer, not both.',
      excerptAround(text, hit.index, hit.match.length));
  }

  if (findAll(text, /\bwhether you'?re\b/gi).length) {
    add('advert cadence', 'warn',
      '"Whether you are..." opens a sentence that is about to address everybody, which means it addresses nobody.',
      'Name the one kind of business you are talking to.',
      'Whether you are...');
  }

  const emoji = findAll(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
  if (emoji.length > 2) {
    add('emoji', 'warn', `${emoji.length} emoji. More than a couple reads as filler rather than tone.`,
      'Keep at most one, or none.', emoji.map((e) => e.match).join(' '));
  }

  const blocking = findings.filter((f) => f.severity === 'block');
  return {
    ok: blocking.length === 0,
    blocking: blocking.length,
    warnings: findings.length - blocking.length,
    findings
  };
}

module.exports = {
  checkCopy,
  BANNED_WORDS,
  AI_VOCABULARY,
  EM_DASH_FORMS,
  EN_DASH_FORMS,
  HYPHEN_AS_DASH
};
