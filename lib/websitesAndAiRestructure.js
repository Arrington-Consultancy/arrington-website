/**
 * Pure-logic helpers for the Websites and AI page restructure migration.
 *
 * These are extracted so they can be unit-tested without a database
 * (the same pattern as lib/usefulThinkingSeed.js).
 *
 * New section order after the migration:
 *   [newHeroId, existingHeroId, wsaId, ...remaining sections]
 *
 * The existing biography "bespoke offer" (A genuinely bespoke website — from
 * £999) is removed from the page order (it becomes an orphaned section and
 * can be reused via the CMS "Reuse existing" tab if needed). Everything else
 * stays in its current relative order.
 */

'use strict';

/**
 * Content for the new hero section (the primary £999 commercial headline).
 * @param {string} iid  Allocated instance ID (e.g. 'hero__6')
 * @returns {Array<[string, string]>}
 */
function newHeroContent(iid) {
  return [
    [`${iid}.heading`, 'A genuinely bespoke website for £999.'],
    [`${iid}.subtext`, 'Built around your business, not a template. Built in days, not months. Properly bespoke, commercially focused and designed around what your business actually needs.'],
    [`${iid}.cta`, 'Tell us what you\'re looking to build'],
    [`${iid}.whatsapp`, ''],
  ];
}

/**
 * Content for the World Student Advisors proof section.
 * @param {string} iid  Allocated instance ID (e.g. 'websitecase')
 * @returns {Array<[string, string]>}
 */
function wsaContent(iid) {
  const features = [
    'Completely bespoke design',
    'Responsive mobile build',
    'Pipedrive CRM integration',
    'Microsoft 365 integration',
    'Google Reviews integration',
    'AI interview practice',
    'AI visa interview simulator',
    'SEO ready',
    'CMS editable',
    'Fast loading',
    'Built around the client\'s business',
  ].join('\n');

  return [
    [`${iid}.label`, 'BUILT FOR £999'],
    [`${iid}.heading`, 'Built for World Student Advisors.'],
    [`${iid}.intro`, 'Built for £999. Here is exactly what was delivered.'],
    [`${iid}.features`, features],
  ];
}

/**
 * Compute the new section order for the Websites and AI page.
 *
 * Rules applied:
 * 1. Strip any biography instance whose heading is the old bespoke offer
 *    text (identified by the caller via offerIds).
 * 2. Keep the first hero instance (existingHeroId) in its current position.
 * 3. Prepend newHeroId before existingHeroId.
 * 4. Insert wsaId immediately after existingHeroId.
 *
 * @param {string[]} currentOrder  Current section_order for the page
 * @param {string}   newHeroId     Newly allocated hero instance ID
 * @param {string}   wsaId         Newly allocated websitecase instance ID
 * @param {string[]} offerIds      Instance IDs of the biography "£999 offer" to remove
 * @returns {string[]}  New section order
 */
function buildNewPageOrder(currentOrder, newHeroId, wsaId, offerIds) {
  const offerSet = new Set(offerIds);
  // Strip the old offer from the order
  const stripped = currentOrder.filter(id => !offerSet.has(id));

  // Find the index of the first hero in the stripped order
  const heroIdx = stripped.findIndex(id => /^hero(__\d+)?$/.test(id));

  if (heroIdx === -1) {
    // No existing hero found — prepend new hero and wsa then keep the rest
    return [newHeroId, wsaId, ...stripped];
  }

  const before = stripped.slice(0, heroIdx);     // sections before the existing hero
  const heroId = stripped[heroIdx];              // the existing hero
  const after  = stripped.slice(heroIdx + 1);   // sections after the existing hero

  return [...before, newHeroId, heroId, wsaId, ...after];
}

module.exports = { newHeroContent, wsaContent, buildNewPageOrder };
