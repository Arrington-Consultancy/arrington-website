// The taxi office workspace as an offer: its price and its one approved line.
//
// The workspace is not in the offer catalogue (lib/whereToStartOffers.js)
// because it is sold through the enquiry form with no payment page, so the
// catalogue's checkout machinery never sees it. Until 28/10/2026 the price
// lived in routes/taxiWebsites.js, which routes/taxiOperators.js cannot
// require (taxiWebsites requires taxiOperators for its paths), so the taxi
// operators page could not show the workspace card without a circular
// require. It lives here now; routes/taxiWebsites.js re-exports it, so every
// existing import still works.
//
// WORKSPACE_LEDE is the workspace page's own hero line (Tom's approval of
// 19/10/2026), the one line the home page box and the taxi operators card
// may carry. Prices: Tom's decision of 17/10/2026; 02 Commercial Position
// recording it is Tom's.
'use strict';

const WORKSPACE_PRICE_PENCE = 99900;
const WORKSPACE_NAME = 'Taxi office workspace';
const WORKSPACE_LEDE = 'Take the emails and admin off your controllers. Catch booking mistakes before they cost you a job.';

module.exports = { WORKSPACE_PRICE_PENCE, WORKSPACE_NAME, WORKSPACE_LEDE };
