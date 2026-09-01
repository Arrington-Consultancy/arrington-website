// Arrington AI Workspace: the boundary between what the finance
// connector may do and what it may never do.
//
// Tom's ANNA MONEY BANKING INTEGRATION DECISION (1 September 2026):
// "Initial finance permission is read-only only... No payment
// initiation, transfer, beneficiary creation, card control or other
// money movement is approved."
//
// This module is small and deliberately has no equivalent of
// lib/workspace/social/actions.js's requestHumanAction: social prepares
// a consequential action for a person to then carry out by hand, and
// that is a legitimate future step for banking too, but it is NOT this
// decision. Building an approval-queue path for a payment instruction
// would mean this system knows how to construct one, which read-only
// access must never be able to do. If Tom later approves a genuinely
// human-executed payment-preparation workflow, that is a separate,
// explicitly-approved change with its own Governance & Assurance route,
// not an extension of this file.

const { MONEY_ACTION_CLASS_NEVER_BUILT, connectorMayDo } = require('./registry');

class MoneyMovementError extends Error {
  constructor(action, provider) {
    super(`"${action}" on ${provider} is money movement. This connector is read-only finance data only; no code path in this system performs it, prepares it, or queues it for approval.`);
    this.name = 'MoneyMovementError';
    this.action = action;
    this.provider = provider;
  }
}

function isMoneyMovement(action) {
  return MONEY_ACTION_CLASS_NEVER_BUILT.includes(action);
}

// Called before anything the finance layer is asked to do. Throws rather
// than returning false, so a caller that forgets to check the result
// still cannot proceed.
function assertReadOnlyAllowed(provider, action) {
  if (isMoneyMovement(action)) throw new MoneyMovementError(action, provider);
  if (!connectorMayDo(provider, action)) {
    throw new Error(`"${action}" is not a capability of the ${provider} finance connector.`);
  }
  return true;
}

module.exports = {
  MoneyMovementError,
  isMoneyMovement,
  assertReadOnlyAllowed
};
