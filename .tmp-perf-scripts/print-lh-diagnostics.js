// Prints the specific Lighthouse audits needed to explain WHY TBT/LCP are
// what they are (not just the headline numbers) directly to stdout, so the
// data can be read from the GitHub Actions job log with no artifact
// download needed at all.
const path = process.argv[2];
const r = require(path);
const a = r.audits;

console.log('\n========', path, '========');
console.log('Performance:', Math.round((r.categories.performance.score || 0) * 100));
console.log('LCP:', a['largest-contentful-paint']?.displayValue, '| TBT:', a['total-blocking-time']?.displayValue, '| CLS:', a['cumulative-layout-shift']?.displayValue);

console.log('\n--- LCP element ---');
const lcpEl = a['largest-contentful-paint-element'];
console.log(JSON.stringify((lcpEl?.details?.items || []).map(i => ({
  node: i.node?.snippet, url: i.items?.[0]?.url
})), null, 2));

console.log('\n--- Third-party summary (blocking time by domain) ---');
const tps = a['third-party-summary'];
console.log(JSON.stringify((tps?.details?.items || []).map(i => ({
  entity: i.entity?.text || i.entity,
  blockingTime: i.blockingTime,
  mainThreadTime: i.mainThreadTime,
  transferSize: i.transferSize
})), null, 2));

console.log('\n--- Main-thread work breakdown ---');
const mtwb = a['mainthread-work-breakdown'];
console.log(JSON.stringify((mtwb?.details?.items || []).map(i => ({
  group: i.groupLabel, duration: i.duration
})), null, 2));

console.log('\n--- Bootup time (script evaluation by URL) ---');
const bootup = a['bootup-time'];
console.log(JSON.stringify((bootup?.details?.items || []).map(i => ({
  url: i.url, total: i.total, scripting: i.scripting, scriptParseCompile: i.scriptParseCompile
})), null, 2));

console.log('\n--- Render-blocking resources ---');
const rbr = a['render-blocking-resources'];
console.log(JSON.stringify((rbr?.details?.items || []).map(i => ({
  url: i.url, wastedMs: i.wastedMs
})), null, 2));

console.log('\n--- Network requests (top 15 by transfer size) ---');
const nr = a['network-requests'];
const items = (nr?.details?.items || []).slice().sort((x, y) => (y.transferSize || 0) - (x.transferSize || 0)).slice(0, 15);
console.log(JSON.stringify(items.map(i => ({
  url: i.url, transferSize: i.transferSize, resourceType: i.resourceType, startTime: Math.round(i.startTime), endTime: Math.round(i.endTime)
})), null, 2));

console.log('\n--- Unused JavaScript ---');
const unused = a['unused-javascript'];
console.log(JSON.stringify((unused?.details?.items || []).map(i => ({
  url: i.url, wastedBytes: i.wastedBytes, totalBytes: i.totalBytes
})), null, 2));
