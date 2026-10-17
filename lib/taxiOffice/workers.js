'use strict';

// The office's six AI workers (Tom, 16/10/2026: customer emails as a worker
// of their own, the Bookings worker booking in through dispatch, and a
// separate worker for complaints; 17/10/2026: a Checker, a second AI that
// checks each booking before a person signs it off). The Checker is never
// routed an email: it checks the Bookings worker's work. Presentation and routing only: what each
// is called, what it does, where it lives in the office, and which one an
// email goes to once it has been read.
//
// Complaints is its own worker rather than part of Licensing. A complaint is
// a customer to put right, and most never concern the council; the few that
// do (a driver on the phone at the wheel, a car that is not safe) are passed
// from Complaints to Licensing, which keeps them with the driver's or the
// vehicle's record.
//
// Routing is plain code on the AI's reading of the email, never the AI
// choosing a worker for itself.

const WORKERS = [
  {
    id: 'bookings',
    name: 'Bookings',
    path: '/inbox',
    does: 'Reads booking emails, checks them against the jobs in dispatch, and books, corrects or cancels the job through the dispatch connection. Drafts the reply.'
  },
  {
    id: 'checker',
    name: 'Checker',
    path: '/inbox',
    does: "Checks every booking the Bookings worker makes against the customer's own email, and shows anything that doesn't match. Nothing goes into dispatch until someone in the office signs it off."
  },
  {
    id: 'customer',
    name: 'Customer emails',
    path: '/inbox',
    does: 'Answers everything else customers send: lost property, account enquiries and questions. Looks up the journey in dispatch when the answer is in there.'
  },
  {
    id: 'complaints',
    name: 'Complaints',
    path: '/complaints',
    does: 'Logs every complaint, pulls the job from dispatch so the reply is based on what happened, and drafts it. Passes anything about safety to Licensing.'
  },
  {
    id: 'licensing',
    name: 'Licensing',
    path: '/licensing',
    does: "Keeps every badge, plate, MOT and insurance date in one register, flags what is due, and drafts what goes to the council's licensing team."
  },
  {
    id: 'social',
    name: 'Social media',
    path: '/social',
    does: "Writes the week's posts from what is actually happening at the firm. Nothing goes out until the owner approves it."
  }
];

const byId = Object.fromEntries(WORKERS.map((w) => [w.id, w]));

// Which worker an email belongs to, from the AI's reading of it.
function workerForIntent(intent) {
  switch (intent) {
    case 'new_booking':
    case 'change':
    case 'cancel':
    case 'enquiry':
      return 'bookings';
    case 'complaint':
      return 'complaints';
    case 'council':
      return 'licensing';
    default:
      return 'customer';
  }
}

module.exports = { WORKERS, byId, workerForIntent };
