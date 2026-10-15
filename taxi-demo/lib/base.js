'use strict';

// The path the site is served under. Empty when it has a host of its own;
// '/taxi-demo' when Arrington's main site mounts it on
// www.arringtonconsultancy.com (decided 15/10/2026: the demo is part of the
// main site, with no domain of its own). Every address a page writes, every
// redirect and every asset goes through link(), so the same code works either
// way and a link can never escape to the main site's own pages by accident.
//
// Module state, like the image register beside it: one site per process.

let prefix = '';

function normalise(p) {
  const s = String(p == null ? '' : p).trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^\/[a-z0-9][a-z0-9/_-]*$/i.test(s)) throw new Error(`Base path must look like /taxi-demo, not ${JSON.stringify(p)}`);
  return s;
}

function setBase(p) {
  prefix = normalise(p);
  return prefix;
}

const base = () => prefix;
const link = (p) => prefix + p;

module.exports = { setBase, base, link, normalise };
