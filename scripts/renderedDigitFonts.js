'use strict';

// Which typefaces a page ACTUALLY draws its numerals in (Tom, 16/10/2026:
// "checking times numeral is not on the site anywhere?"). The stylesheets
// name only sans serif faces, and test/sansSerifOnly.test.js keeps them that
// way, but a browser falls back to its default serif (Times on an iPhone)
// wherever text ends up with no font of ours: an element that sets none, a
// page without the stylesheet, or a font that never loaded. Only the browser
// knows what it drew, so this asks it through the DevTools protocol, element
// by element, for every visible element whose own text holds a digit.
//
// Returns { glyphs: { family: count }, serif: [{ family, text }] }. "serif"
// lists any element drawn in a serif face, with a sample of its text, so a
// report can name where it is.

const SERIF = /serif|times|tinos|georgia|garamond|playfair|fraunces/i;
const isSerif = (family) => SERIF.test(family) && !/sans/i.test(family);

async function renderedDigitFonts(page, limit = 400) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));
  const count = await page.evaluate((max) => {
    let i = 0;
    for (const el of document.body.querySelectorAll('*')) {
      if (i >= max) break;
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|svg)$/i.test(el.tagName)) continue;
      const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('');
      if (!/\d/.test(own)) continue;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
      el.setAttribute('data-digit-probe', String(i));
      el.setAttribute('data-digit-text', own.replace(/\s+/g, ' ').trim().slice(0, 60));
      i += 1;
    }
    return i;
  }, limit);
  const cdp = await page.context().newCDPSession(page);
  const glyphs = {};
  const serif = [];
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    for (let k = 0; k < count; k++) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-digit-probe="${k}"]` });
      if (!nodeId) continue;
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      for (const f of fonts) {
        glyphs[f.familyName] = (glyphs[f.familyName] || 0) + f.glyphCount;
        if (isSerif(f.familyName) && serif.length < 10) {
          const { attributes } = await cdp.send('DOM.getAttributes', { nodeId });
          const at = attributes.indexOf('data-digit-text');
          serif.push({ family: f.familyName, text: at >= 0 ? attributes[at + 1] : '' });
        }
      }
    }
  } finally {
    await cdp.detach().catch(() => {});
  }
  return { elements: count, glyphs, serif };
}

function describeDigitFonts(d) {
  if (!d) return 'not checked';
  if (d.error) return `ERROR ${d.error}`;
  const faces = Object.entries(d.glyphs).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ') || 'none';
  const serif = d.serif.length ? `SERIF FOUND: ${d.serif.map((s) => `${s.family} in "${s.text}"`).join(' | ')}` : 'no serif';
  return `${d.elements} element(s) with numerals; faces drawn (glyphs): ${faces}; ${serif}`;
}

module.exports = { renderedDigitFonts, describeDigitFonts, isSerif };
