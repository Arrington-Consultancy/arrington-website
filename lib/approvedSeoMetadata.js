// SEO metadata approved by Tom on 11/10/2026 (SEO Metadata Implementation
// Brief, from the Website & Hosting SEO sweep proposal of the same day).
// Search result titles and descriptions only, on four pages. The three code
// pages carry theirs in their own views; the homepage is a CMS page, so its
// title and description live on its row in `pages` and are moved here by a
// guarded migration, the same pattern as the SEO metadata pass of 18/08/2026:
// a field changes only while it still holds the exact live value inspected
// on 11/10/2026, so a CMS edit made since always wins. A sharing tag
// (og_title, og_description) moves only when it is a copy of that old value;
// blank, it already follows the page's title and description.
'use strict';

const APPROVED = Object.freeze({
  home: Object.freeze({
    title: 'Business Consultant Devon & Cornwall, Arrington Consultancy',
    description: 'Business consultancy for established owner run businesses across Devon and Cornwall. An outside view on decisions, structure and what to deal with next.'
  }),
  readyToSell: Object.freeze({
    title: 'Get Your Business Ready to Sell',
    description: 'Make your business stronger and less reliant on you, so somebody else could take it over. Start with a free conversation or the £500 Commercial Review.'
  }),
  taxi: Object.freeze({
    title: 'Independent Taxi Dispatch System Advice | Arrington',
    description: 'Choosing or changing a taxi dispatch system? Independent advice from Tom Arrington, a former operator who ran on iCabbi for around eight years. No supplier pays us.'
  }),
  ownerCheck: Object.freeze({
    title: 'Owner Check | Arrington Consultancy', // preserved, as approved
    description: 'Short self-assessment checks for owners of established, owner run businesses. A practical read on how the business runs, in a few minutes.'
  })
});

// The homepage's live values on 11/10/2026, read from the production page
// (inspection run 20261011T183927Z-seo-audit).
const HOME_LIVE_2026_10_11 = Object.freeze({
  title: 'Business Consultancy Devon & Cornwall | Arrington Consultancy',
  description: 'Business consultancy for established owner run businesses across Devon and Cornwall. Outside perspective on decisions, structure and what deserves attention next.'
});

// Fixed list, so the column names interpolated below are never input.
const HOME_FIELDS = [
  ['meta_title', HOME_LIVE_2026_10_11.title, APPROVED.home.title, false],
  ['meta_description', HOME_LIVE_2026_10_11.description, APPROVED.home.description, false],
  ['og_title', HOME_LIVE_2026_10_11.title, APPROVED.home.title, true],
  ['og_description', HOME_LIVE_2026_10_11.description, APPROVED.home.description, true]
];

async function applyHomeSeoMetadata(db) {
  const { rows } = await db.query(
    `SELECT meta_title, meta_description, og_title, og_description FROM pages WHERE slug = 'main'`
  );
  if (!rows.length) return [{ field: 'page', status: 'no homepage row, nothing to do' }];
  const report = [];
  for (const [col, oldValue, newValue, followsWhenBlank] of HOME_FIELDS) {
    const { rowCount } = await db.query(
      `UPDATE pages SET ${col} = $1 WHERE slug = 'main' AND ${col} = $2`,
      [newValue, oldValue]
    );
    const live = rows[0][col] || '';
    let status;
    if (rowCount) status = 'updated';
    else if (live === newValue) status = 'already approved value';
    else if (followsWhenBlank && live === '') status = 'blank, follows the page';
    else status = `left alone, live value differs: ${JSON.stringify(live)}`;
    report.push({ field: col, status });
  }
  return report;
}

module.exports = { APPROVED, HOME_LIVE_2026_10_11, applyHomeSeoMetadata };
