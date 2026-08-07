const FIRST_BATCH_PAGES = [
  {
    slug: 'being-certain-isnt-the-same-as-being-right',
    instanceId: 'article',
    title: "Being Certain Isn't the Same as Being Right"
  },
  {
    slug: 'the-customer-who-messaged-me-at-4am',
    instanceId: 'article__2',
    title: 'The Customer Who Messaged Me at 4am'
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
  FIFTH_PUBLISHED_ARTICLE,
  SIXTH_PUBLISHED_ARTICLE,
  SEVENTH_PUBLISHED_ARTICLE,
  buildUsefulThinkingPageOrder
};
