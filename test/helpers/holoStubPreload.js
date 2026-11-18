'use strict';
// Test only (node -r): stands in for Holo's server, which the build sandbox
// cannot reach. A request for Holo's embed script is answered from the file
// named in HOLO_STUB_FILE (the script as Holo serves it); HOLO_STUB_DOWN=1
// makes Holo unreachable. Every other request goes to the real fetch.
const fs = require('fs');
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://prod-api-holo-ai.fly.dev/')) {
    if (process.env.HOLO_STUB_DOWN === '1' || !process.env.HOLO_STUB_FILE) throw new Error('Holo unreachable (stub)');
    return new Response(fs.readFileSync(process.env.HOLO_STUB_FILE, 'utf8'), { status: 200, headers: { 'content-type': 'application/javascript; charset=utf-8' } });
  }
  return realFetch(url, opts);
};
