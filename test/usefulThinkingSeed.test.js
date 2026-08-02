const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { publishedArticles } = require('../lib/usefulThinkingArticles');
const {
  FIRST_BATCH_PAGES,
  HELD_ARTICLE_INSTANCE_ID,
  LIBRARY_INSTANCE_ID,
  FIFTH_PUBLISHED_ARTICLE,
  SIXTH_PUBLISHED_ARTICLE,
  buildUsefulThinkingPageOrder
} = require('../lib/usefulThinkingSeed');

describe('usefulThinkingSeed', () => {
  test('first batch matches the published article manifest for the original four pages', () => {
    const manifestSubset = publishedArticles()
      .slice(0, FIRST_BATCH_PAGES.length)
      .map(({ slug, instanceId }) => ({ slug, instanceId }));

    assert.deepEqual(
      FIRST_BATCH_PAGES.map(({ slug, instanceId }) => ({ slug, instanceId })),
      manifestSubset
    );
  });

  test('reserved and later article instance ids stay fixed', () => {
    assert.equal(HELD_ARTICLE_INSTANCE_ID, 'article__5');
    assert.equal(FIFTH_PUBLISHED_ARTICLE.instanceId, 'article__6');
    assert.equal(SIXTH_PUBLISHED_ARTICLE.instanceId, 'article__7');
  });

  test('inserts the library exactly once before assessment and removes approach__2', () => {
    const order = ['insights', 'utlibrary', 'approach__2', 'intervention', 'assessment', 'utlibrary'];

    assert.deepEqual(
      buildUsefulThinkingPageOrder(order),
      ['insights', 'intervention', LIBRARY_INSTANCE_ID, 'assessment']
    );
  });

  test('appends the library when there is no assessment section', () => {
    assert.deepEqual(
      buildUsefulThinkingPageOrder(['insights', 'intervention', 'approach__2']),
      ['insights', 'intervention', LIBRARY_INSTANCE_ID]
    );
  });
});
