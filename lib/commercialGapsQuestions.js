// Commercial Gaps Review (AI) — question bank and next-question selection.
//
// This is deliberately NOT an AI-driven conversation. Anthropic interprets
// the finished transcript (see lib/commercialGapsAI.js); it never chooses
// what to ask next. Everything in this file is plain, testable, rule-based
// logic, so the interview can never wander, hallucinate a question, or say
// anything nobody here wrote.
//
// Structure: eleven fixed-order base questions, one per required topic.
// A handful of those questions have a variant phrasing chosen by a simple
// keyword check against an earlier answer — that is what "select the next
// question from earlier answers" means here, not a change in category order.
// On top of the eleven base questions, at most one clarification question is
// inserted the first time an answer looks vague, per the brief ("allow one
// clarification question where genuinely helpful"). So a review is always
// either 11 or 12 questions long — comfortably inside the required 8–15.

const MIN_QUESTIONS = 8;
const MAX_QUESTIONS = 15;

const QUESTION_BANK = [
  {
    id: 'business_model',
    category: 'business_model',
    label: 'Business model',
    text: 'In plain terms, what does the business actually sell, and who buys it?'
  },
  {
    id: 'commercial_priorities',
    category: 'commercial_priorities',
    label: 'Commercial priorities',
    text: 'Right now, what matters most to you commercially: growing revenue, protecting margin, freeing up your own time, or something else?'
  },
  {
    id: 'demand',
    category: 'demand',
    label: 'Demand',
    text: 'Is demand for the business currently something you have to chase, or something that mostly comes to you?',
    variant: {
      // Chosen from the business_model answer, not asked directly — this is
      // the "next question selected from earlier answers" behaviour.
      when: (answers) => /season|summer|winter|christmas|holiday|quiet period/i.test(answers.business_model || ''),
      text: 'How much does demand for the business swing across the year, and how well do you plan around that?'
    }
  },
  {
    id: 'capacity',
    category: 'capacity',
    label: 'Capacity',
    text: 'If demand doubled tomorrow, could the business actually deliver it without everything breaking?'
  },
  {
    id: 'delivery',
    category: 'delivery',
    label: 'Delivery',
    text: 'Once a customer says yes, what actually has to happen for them to get what they paid for, and how much of that depends on any one person?'
  },
  {
    id: 'pricing',
    category: 'pricing',
    label: 'Pricing',
    text: 'How confident are you that current prices reflect what the work is really worth, rather than what has always been charged?',
    variant: {
      when: (answers) => /quote|tender|project|bespoke|per job|each job/i.test(answers.business_model || ''),
      text: 'How are prices for individual jobs actually arrived at: a fixed process, or gut feel each time?'
    }
  },
  {
    id: 'margin',
    category: 'margin',
    label: 'Margin',
    text: 'Do you know which parts of the business make good money and which are quietly losing it, or is that more of a feeling than a number you could show someone?'
  },
  {
    id: 'owner_dependency',
    category: 'owner_dependency',
    label: 'Owner dependency',
    text: 'If you took three weeks away from the business entirely, what would actually happen?'
  },
  {
    id: 'decision_making',
    category: 'decision_making',
    label: 'Decision making',
    text: 'When something important needs deciding, who makes the call, and how does everyone else find out?'
  },
  {
    id: 'missed_opportunities',
    category: 'missed_opportunities',
    label: 'Opportunities being missed',
    text: 'What is the thing you keep meaning to chase, an opportunity, a customer, an idea, that never quite gets your attention?'
  },
  {
    id: 'blind_spots',
    category: 'blind_spots',
    label: 'Commercial blind spots',
    text: 'What would someone who knows the business well, but has no reason to be polite about it, say is being missed?'
  }
];

// Generic, category-aware clarification prompts. Kept short and plain —
// this is the single clarification question the brief allows, so it should
// read as a genuine follow-up, not a second interrogation.
const CLARIFICATION_TEMPLATES = {
  business_model: 'Just to pin that down: in a sentence, who is the paying customer and what are they actually paying for?',
  commercial_priorities: 'Of those, which one would you pick first if you could only fix one this year?',
  demand: 'Roughly speaking, is that demand growing, flat, or shrinking at the moment?',
  capacity: 'What specifically would break first: people, equipment, cash, or something else?',
  delivery: 'Who is the one person that gap would fall on if it went wrong?',
  pricing: 'When did you last actually change a price on purpose, rather than it drifting?',
  margin: 'If you had to guess, which single part of the business is the biggest drag on margin?',
  owner_dependency: 'What is the first thing that would actually go wrong, not just feel uncomfortable?',
  decision_making: 'Is that because nobody else has the authority, or because nobody else has the information?',
  missed_opportunities: 'What has stopped you chasing it so far?',
  blind_spots: 'Who is that person, and when did they last actually say it to you?'
};

const VAGUE_PATTERNS = [
  /^(not sure|don'?t know|no idea|dunno|hard to say|depends|varies|maybe|it's complicated|not really|n\/a)\.?$/i
];

// A short, non-committal answer isn't necessarily vague (some honest answers
// are short), but combined with the hedge-phrase check it's a reasonable,
// conservative trigger for a single clarification — better to miss a
// genuinely useful follow-up than to interrogate every terse answer.
function isVagueAnswer(answerText) {
  const trimmed = String(answerText || '').trim();
  if (!trimmed) return true;
  if (trimmed.length < 12) return true;
  return VAGUE_PATTERNS.some((re) => re.test(trimmed));
}

function getQuestionText(question, answersByCategory) {
  if (question.variant && question.variant.when(answersByCategory)) {
    return question.variant.text;
  }
  return question.text;
}

// transcript: ordered array of { id, category, text, isClarification, answerText }
// already recorded for this review. Returns either
//   { done: true }
// or
//   { done: false, question: { id, category, label, text, isClarification } }
function selectNextStep(transcript) {
  const entries = Array.isArray(transcript) ? transcript : [];
  const answersByCategory = {};
  entries.forEach((e) => { answersByCategory[e.category] = e.answerText; });

  const baseAnswered = entries.filter((e) => !e.isClarification).length;
  const clarificationUsed = entries.some((e) => e.isClarification);
  const lastEntry = entries[entries.length - 1];

  // A clarification can only follow the base question it clarifies, and
  // only once per whole review — never twice, never after a clarification.
  if (
    lastEntry &&
    !lastEntry.isClarification &&
    !clarificationUsed &&
    isVagueAnswer(lastEntry.answerText) &&
    CLARIFICATION_TEMPLATES[lastEntry.category]
  ) {
    return {
      done: false,
      question: {
        id: `${lastEntry.category}_clarify`,
        category: lastEntry.category,
        label: QUESTION_BANK.find((q) => q.category === lastEntry.category).label,
        text: CLARIFICATION_TEMPLATES[lastEntry.category],
        isClarification: true
      }
    };
  }

  if (baseAnswered >= QUESTION_BANK.length) {
    return { done: true };
  }

  const next = QUESTION_BANK[baseAnswered];
  return {
    done: false,
    question: {
      id: next.id,
      category: next.category,
      label: next.label,
      text: getQuestionText(next, answersByCategory),
      isClarification: false
    }
  };
}

function firstQuestion() {
  return selectNextStep([]).question;
}

module.exports = {
  MIN_QUESTIONS,
  MAX_QUESTIONS,
  QUESTION_BANK,
  isVagueAnswer,
  selectNextStep,
  firstQuestion
};
