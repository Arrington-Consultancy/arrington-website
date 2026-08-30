// Arrington AI Workspace: the boundary between what the social layer
// may do and what only a person may do.
//
// Tom's requirement of 30/08/2026: "Publishing, deleting, publicly
// replying, account-setting changes, advertising spend and other
// consequential external actions remain human-controlled unless
// separately approved."
//
// This module is that sentence in code. It is small on purpose: every
// caller asks it, and it has exactly one answer for a consequential
// action, so no route can be written that quietly performs one.

const { ACTION_CLASS_HUMAN, connectorMayDo } = require('./registry');
const workspaceRepo = require('../repo');

class ConsequentialActionError extends Error {
  constructor(action, platform) {
    super(`"${action}" on ${platform} is a consequential external action. The workspace prepares it and records it for a person; it does not perform it.`);
    this.name = 'ConsequentialActionError';
    this.action = action;
    this.platform = platform;
  }
}

function isConsequential(action) {
  return ACTION_CLASS_HUMAN.includes(action);
}

// Called before anything the social layer is asked to do. A
// consequential action throws rather than returning false, so a caller
// that forgets to check the result still cannot proceed.
function assertAutonomousAllowed(platform, action) {
  if (isConsequential(action)) throw new ConsequentialActionError(action, platform);
  if (!connectorMayDo(platform, action)) {
    throw new Error(`"${action}" is not a capability of the ${platform} connector.`);
  }
  return true;
}

// The authorised route for a consequential action: write it into the
// existing human approval queue as a RECORD. Approving that row records
// a decision and executes nothing; the person then carries the action
// out on the platform themselves. Returns the queued row so the caller
// can show the person where it went.
async function requestHumanAction({ platform, action, summary, detail = '', requestedBy }) {
  if (!isConsequential(action)) {
    throw new Error(`"${action}" does not need a human decision; it is an ordinary connector capability.`);
  }
  const approval = await workspaceRepo.createApproval({
    title: `${action.replace(/_/g, ' ')} on ${platform}: ${summary}`.slice(0, 300),
    detail: [
      detail,
      '',
      'This is a record, not an instruction the system will carry out. Approving it records your decision; the action itself is performed by a person on the platform.'
    ].join('\n'),
    // Class 4 and above are not authorised for the workspace to
    // execute, which is precisely why this lands in the queue.
    actionClass: 4,
    sensitivity: 'commercial',
    requestedBy: requestedBy || 'workspace_ai'
  });
  await workspaceRepo.addActivity({
    actor: requestedBy || 'workspace_ai',
    eventType: 'social_action_queued',
    summary: `${action} on ${platform} queued for a human decision: ${summary}`.slice(0, 500)
  });
  return approval;
}

module.exports = {
  ConsequentialActionError,
  isConsequential,
  assertAutonomousAllowed,
  requestHumanAction
};
