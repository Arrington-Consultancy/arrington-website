// The social platforms the demonstration knows about, in one place.
//
// This list is deliberately CLOSED and matches the connector layer's
// declared platforms exactly. Adding an entry here is not a presentation
// change: the approved v0.1 source map named Facebook, Instagram,
// LinkedIn and X, and Tom's approval of the social expansion was bounded
// to that reviewed scope. A fifth platform would be a new source, and
// would need to go to Governance rather than be added because a logo was
// available.
//
// Colour is the platform's own brand colour, used for the glyph on a
// light chip. X is near-black rather than pure black so it does not read
// as a hole punched in the page.
const PLATFORMS = [
  { id: 'facebook', name: 'Facebook', colour: '#1877F2' },
  { id: 'instagram', name: 'Instagram', colour: '#E4405F' },
  { id: 'linkedin', name: 'LinkedIn', colour: '#0A66C2' },
  { id: 'x', name: 'X', colour: '#14171A' }
];

// What the sidebar renders for this viewer.
//
// The connection state is `marketing_performance` data, so it is only
// resolved for a viewer cleared to see it. For anyone else `connected`
// is null, which the view renders as no claim at all rather than as
// "not connected" - the difference between "you may not see this" and
// "there is nothing here" is the leak this demonstration exists to show.
//
// Nothing here asserts a successful retrieval. A connected account is
// not a retrieval, which is why the sidebar links to the page that
// carries the retrieval state instead of summarising it.
function platformsForViewer({ canSee, accounts }) {
  const cleared = typeof canSee === 'function' && canSee('marketing_performance');
  const byName = new Map(
    (cleared && Array.isArray(accounts) ? accounts : []).map((a) => [String(a.platform).toLowerCase(), a])
  );
  return PLATFORMS.map((p) => {
    const account = byName.get(p.name.toLowerCase());
    return {
      id: p.id,
      name: p.name,
      colour: p.colour,
      connected: cleared ? Boolean(account && account.status === 'CONNECTED') : null
    };
  });
}

module.exports = { PLATFORMS, platformsForViewer };
