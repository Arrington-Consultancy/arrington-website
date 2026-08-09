const FIRST_BATCH_PAGES = [
  {
    slug: 'being-certain-isnt-the-same-as-being-right',
    instanceId: 'article',
    title: "Being Certain Isn't the Same as Being Right"
  },
  {
    slug: 'the-customer-who-messaged-me-at-4am',
    instanceId: 'article__2',
    // Title corrected 08/08/2026 (was "The Customer Who Messaged Me at
    // 4am") — every other title/index_summary in the library refers to
    // Tom in the third person; this was the one place a first-person
    // "Me" had crept in. Slug is untouched (published URL, per the
    // site's own "URLs stay put" convention — see the mismatch already
    // tolerated on article__3's slug vs its current title).
    title: 'The Customer Who Messaged at 4am'
  },
  {
    slug: 'you-dont-get-to-decide-when-youve-made-things-right',
    instanceId: 'article__3',
    title: "You Don't Get to Decide When You've Made Things Right"
  },
  {
    slug: 'the-tightrope-between-staff-loyalty-and-damage-control',
    instanceId: 'article__4',
    title: 'The Tightrope Between Staff Loyalty and Damage Control'
  }
];

const HELD_ARTICLE_INSTANCE_ID = 'article__5';
const LIBRARY_INSTANCE_ID = 'utlibrary';

// Marker content key for the one-time editorial-index restructure
// (08/08/2026): guards the migration that rewrites the useful-thinking
// page's section_order down to just [library, commercial bridge],
// dropping the pre-library philosophy/marketing sections and the shared
// "Honest questions" assessment block that had accumulated on this page
// via the CMS. The bridge's own instance ID isn't a fixed constant here
// because it's allocated dynamically (an `intervention` instance, and
// that template is already heavily used elsewhere) - this marker is the
// only thing later boots need to check to know the restructure already
// ran, so a redeploy never clobbers whatever Tom has since edited on
// this page himself.
const EDITORIAL_INDEX_MARKER_KEY = 'useful-thinking.editorial_index_v1';

const FIFTH_PUBLISHED_ARTICLE = {
  slug: 'a-profitable-job-is-not-necessarily-good-business',
  instanceId: 'article__6',
  title: 'A Profitable Job Is Not Necessarily Good Business'
};

const SIXTH_PUBLISHED_ARTICLE = {
  slug: 'every-rule-changes-behaviour',
  instanceId: 'article__7',
  title: 'Every Rule Changes Behaviour'
};

const SEVENTH_PUBLISHED_ARTICLE = {
  slug: 'the-turning-that-never-came',
  instanceId: 'article__8',
  title: 'The Turning That Never Came'
};

const EIGHTH_PUBLISHED_ARTICLE = {
  slug: 'serendipity-is-not-a-system',
  instanceId: 'article__9',
  title: 'Serendipity Is Not a System'
};

const NINTH_PUBLISHED_ARTICLE = {
  slug: 'some-people-are-worth-the-risk',
  instanceId: 'article__10',
  title: 'Some People Are Worth the Risk'
};

const TENTH_PUBLISHED_ARTICLE = {
  slug: 'the-connection-isnt-the-sale',
  instanceId: 'article__11',
  title: "The Connection Isn't the Sale"
};

const ELEVENTH_PUBLISHED_ARTICLE = {
  slug: 'the-monument-to-wasted-money',
  instanceId: 'article__12',
  title: 'The Monument to Wasted Money'
};

const TWELFTH_PUBLISHED_ARTICLE = {
  slug: 'you-build-a-business-one-problem-at-a-time',
  instanceId: 'article__13',
  title: 'You Build a Business One Problem at a Time'
};

function buildUsefulThinkingPageOrder(sectionOrder, libId = LIBRARY_INSTANCE_ID) {
  const baseOrder = Array.isArray(sectionOrder)
    ? sectionOrder.filter((iid) => iid !== 'approach__2' && iid !== libId)
    : [];
  const assessmentIndex = baseOrder.indexOf('assessment');
  if (assessmentIndex === -1) return [...baseOrder, libId];
  return [
    ...baseOrder.slice(0, assessmentIndex),
    libId,
    ...baseOrder.slice(assessmentIndex)
  ];
}

module.exports = {
  FIRST_BATCH_PAGES,
  HELD_ARTICLE_INSTANCE_ID,
  LIBRARY_INSTANCE_ID,
  EDITORIAL_INDEX_MARKER_KEY,
  FIFTH_PUBLISHED_ARTICLE,
  SIXTH_PUBLISHED_ARTICLE,
  SEVENTH_PUBLISHED_ARTICLE,
  EIGHTH_PUBLISHED_ARTICLE,
  NINTH_PUBLISHED_ARTICLE,
  TENTH_PUBLISHED_ARTICLE,
  ELEVENTH_PUBLISHED_ARTICLE,
  TWELFTH_PUBLISHED_ARTICLE,
  buildUsefulThinkingPageOrder
};
