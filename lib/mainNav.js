// The main navigation and the home page offers, from Tom's decision of
// 21/10/2026 ("DECISION AND PLAN - Simplify to three offers", Drive
// 1_63u0CLmytc0Iz8GOjkeJGDB9WP4-g_qBQbVUYAVW6g): Arrington leads with three
// offers, the menu is those three plus About and Contact, and everything else
// is parked: out of the menu and off the home page, still live at its URL.
//
// Until that day the menu was the CMS pages with "Show in nav" on plus three
// code-route entries (Owner Check, Ready to Sell, Product Guide). Those three
// are gone. The offers are code routes, so they are listed here; About is the
// About Us CMS page, still governed by its own Show in nav setting; Contact
// goes to the enquiry form, which the shared footer puts on every page.
//
// server.js (renderPage) and lib/navShell.js (the standalone pages) both
// build the menu from this one list, so the two cannot drift apart again.
//
// Order: Commercial Review first. The decision lists the website first, but
// the Brand OS still names the Commercial Review as the main offer and the
// home page's paid traffic is the Leads campaign's consultant searches; the
// website and taxi ads land on their own pages. Put to Tom with the build.
'use strict';

const { OFFERS } = require('./whereToStartOffers');

const OFFER_LINKS = Object.freeze([
  { slug: 'where-to-start/commercial-review', title: 'Commercial Review' },
  { slug: 'where-to-start/website-build', title: 'Website' },
  { slug: 'taxi-and-private-hire-operators/office-workspace', title: 'Taxi office workspace' }
]);

// A slug no page can have, so Contact is never marked as the page you are on.
const CONTACT_LINK = Object.freeze({ slug: '#contact', href: '#conversation', title: 'Contact' });

const entry = (e) => ({ nav_label: '', hidden: false, show_in_nav: true, ...e });

// cmsPages: the CMS page rows this viewer may see in the menu, already
// filtered by role and Show in nav. The home page row is dropped by the
// header itself (the logo goes home).
function buildNavPages(cmsPages) {
  return [...OFFER_LINKS.map(entry), ...(cmsPages || []), entry(CONTACT_LINK)];
}

// The three home page boxes. Every line of copy is already approved and live
// on the page the box leads to: the Commercial Review's catalogue
// description, the Website Build page's lede and the office workspace page's
// lede. Prices come from the offer catalogue and the workspace route, never
// typed here.
function homeOffers(workspacePricePence) {
  const pounds = (p) => `£${(p / 100).toLocaleString('en-GB')}`;
  const review = OFFERS.commercial_review;
  const website = OFFERS.website_build;
  return [
    {
      id: 'commercial-review',
      audience: 'For owner run businesses',
      name: review.name,
      price: pounds(review.pricePence),
      line: 'We spend a day in the business with you, then produce a written assessment, recommendations and next steps within 4 business days.',
      href: '/where-to-start/commercial-review',
      button: 'See the Commercial Review'
    },
    {
      id: 'website',
      // "For owner run businesses" since 22/10/2026 (Tom's decision on the
      // homepage review): the Website Build page's own search description
      // already said so, and "for any business" pulled against the Brand OS
      // audience. Nothing else on the card changed.
      audience: 'For owner run businesses',
      name: website.name,
      price: pounds(website.pricePence),
      line: 'A fixed-price website build shaped around what your business needs to do. Built from scratch, not from a template, and completely customisable.',
      href: '/where-to-start/website-build',
      button: 'See the Website Build'
    },
    {
      id: 'taxi-office-workspace',
      audience: 'For taxi and private hire operators',
      name: 'Taxi office workspace',
      price: pounds(workspacePricePence),
      line: 'Take the emails and admin off your controllers. Catch booking mistakes before they cost you a job.',
      href: '/taxi-and-private-hire-operators/office-workspace',
      button: 'See the taxi office workspace'
    }
  ];
}

module.exports = { OFFER_LINKS, CONTACT_LINK, buildNavPages, homeOffers };
