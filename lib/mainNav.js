// The main navigation, from Tom's decision of
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

module.exports = { OFFER_LINKS, CONTACT_LINK, buildNavPages };
