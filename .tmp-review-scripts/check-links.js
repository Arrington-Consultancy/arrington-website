const fs = require('fs');
const BASE = 'https://www.arringtonconsultancy.com';
const links = JSON.parse(fs.readFileSync('review-output/internal-links.json', 'utf8'));

(async () => {
  const out = [];
  for (const link of links) {
    const url = link.startsWith('http') ? link : BASE + link;
    try {
      const resp = await fetch(url, { method: 'GET', redirect: 'manual' });
      out.push({ link, status: resp.status, location: resp.headers.get('location') || null });
    } catch (e) {
      out.push({ link, status: 'ERROR', error: String(e).slice(0, 200) });
    }
  }
  fs.writeFileSync('review-output/link-check.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
