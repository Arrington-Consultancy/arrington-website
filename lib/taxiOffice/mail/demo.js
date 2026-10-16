'use strict';

// The made-up Tidewell inbox. What the office reads when no real mailbox is
// connected, which on this site is always: the firm is invented and so is
// every email in it (lib/taxiOffice/data.js). A reply "saved as a draft"
// here goes nowhere; the office records it as sent on the page and says so.

const data = require('../data');

function create() {
  return {
    name: 'demo',
    label: 'Demo mailbox',
    configured: () => true,
    missing: () => [],
    listInbox: async ({ today = data.todayLondon() } = {}) => data.seedInbox(today),
    saveReplyDraft: async () => ({ draftId: null })
  };
}

module.exports = { create };
