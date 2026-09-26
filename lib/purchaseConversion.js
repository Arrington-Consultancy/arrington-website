// Decides whether the Where to Start confirmation page sends the Google Ads
// "Paid offer purchase" conversion, and with what (added 26/09/2026).
//
// Pure, so the rule can be tested without a database or a browser. Three
// conditions, all required:
//
// 1. A label is configured (GOOGLE_ADS_PURCHASE_CONVERSION_LABEL). Without
//    one nothing is sent, which is what keeps this inert until Tom sets it.
// 2. The purchase row is 'paid'. Only the verified Stripe webhook writes
//    that status, so a visitor who lands on the success URL for a session
//    that has not been paid, or types a session id, is never counted. A
//    'pending' page reloads itself every few seconds and fires once the
//    webhook has landed.
// 3. The amount is a real non-negative whole number of pence.
//
// The transaction id is our own purchase row id, not the Stripe session id,
// so Google receives a stable reference it can de-duplicate on without being
// handed a Stripe identifier. Value is what was actually charged, so a
// £2,500 review bought with the £500 credit reports £2,000.
function purchaseConversionFor(purchase, label) {
  if (!label || !/^[A-Za-z0-9_-]+$/.test(label)) return null;
  if (!purchase || purchase.status !== 'paid') return null;
  const id = Number(purchase.id);
  const pence = Number(purchase.amount_pence);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!Number.isInteger(pence) || pence < 0) return null;
  const currency = String(purchase.currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  return {
    sendTo: 'AW-18129914078/' + label,
    transactionId: 'wts-' + id,
    value: Number((pence / 100).toFixed(2)),
    currency
  };
}

module.exports = { purchaseConversionFor };
