'use strict';

// A small reader for one email exactly as a mail server hands it over (the
// IMAP driver, ./imap.js). Written here rather than installed because the
// usual libraries need Node 20 and production runs Node 18.
//
// It does what the office needs and no more: the headers, with encoded
// words (=?UTF-8?B?...?=) decoded, and the readable text of the message,
// from its text/plain part if it has one, otherwise its HTML with the tags
// taken out. Attachments are never decoded.

const { stripHtml } = require('./gmail');

// Bytes to text in the named character set. A label the runtime does not
// know falls back to UTF-8; UTF-8 that does not decode cleanly is read as
// Windows-1252, which is what an unlabelled 8-bit email almost always is.
function decodeBytes(buf, charset) {
  let cs = String(charset || '').trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (!cs || cs === 'utf8' || cs === 'us-ascii' || cs === 'ascii') cs = 'utf-8';
  if (cs === 'utf-8') {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { cs = 'windows-1252'; }
  }
  try { return new TextDecoder(cs).decode(buf); } catch (e) { return new TextDecoder('utf-8').decode(buf); }
}

function qpDecode(s) {
  const t = String(s || '').replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < t.length; i++) {
    const hex = t.substr(i + 1, 2);
    if (t[i] === '=' && /^[0-9a-f]{2}$/i.test(hex)) { bytes.push(parseInt(hex, 16)); i += 2; } else bytes.push(t.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes);
}

// A raw header value (one byte per character) as text: UTF-8 if the bytes
// are UTF-8, as some phones send, then any encoded words decoded. Adjacent
// encoded words in one character set are joined before decoding, so a
// character split across two of them comes out whole.
function headerText(raw) {
  const s = decodeBytes(Buffer.from(String(raw || ''), 'latin1'), 'utf-8');
  const re = /=\?([^?*\s]+)(?:\*[^?\s]*)?\?([bBqQ])\?([^?\s]*)\?=/g;
  let out = '';
  let last = 0;
  let pending = null;
  const flush = () => { if (pending) { out += decodeBytes(Buffer.concat(pending.bytes), pending.cs); pending = null; } };
  let m;
  while ((m = re.exec(s))) {
    const cs = m[1].toLowerCase();
    const between = s.slice(last, m.index);
    if (pending && /^[ \t]*$/.test(between)) {
      if (pending.cs !== cs) flush();
    } else {
      flush();
      out += between;
    }
    const bytes = m[2].toUpperCase() === 'B' ? Buffer.from(m[3], 'base64') : qpDecode(m[3].replace(/_/g, ' '));
    if (!pending) pending = { cs, bytes: [] };
    pending.bytes.push(bytes);
    last = re.lastIndex;
  }
  flush();
  return (out + s.slice(last)).replace(/\s+/g, ' ').trim();
}

function splitHeadBody(raw) {
  const m = /\r?\n\r?\n/.exec(raw);
  return m ? { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) } : { head: raw, body: '' };
}

// Header lines, unfolded, as [lower-case name, raw value] pairs in order.
function parseHeaders(head) {
  const out = [];
  for (const line of head.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && out.length) out[out.length - 1][1] += ' ' + line.trim();
    else {
      const i = line.indexOf(':');
      if (i > 0) out.push([line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()]);
    }
  }
  return out;
}

// "text/plain; charset=utf-8" -> { value: 'text/plain', params: { charset: 'utf-8' } }
function parseParams(v) {
  const parts = [];
  let cur = '';
  let quoted = false;
  for (const ch of String(v || '')) {
    if (ch === '"') quoted = !quoted;
    if (ch === ';' && !quoted) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  const value = parts.shift().trim().toLowerCase();
  const params = {};
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    let val = p.slice(i + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\(.)/g, '$1');
    params[p.slice(0, i).trim().toLowerCase().replace(/\*$/, '')] = val;
  }
  return { value, params };
}

function splitMultipart(body, boundary) {
  const open = '--' + boundary;
  const parts = [];
  let cur = null;
  for (const line of body.split(/\r?\n/)) {
    const t = line.replace(/[ \t]+$/, '');
    if (t === open + '--') { if (cur) parts.push(cur.join('\r\n')); cur = null; return parts; }
    if (t === open) { if (cur) parts.push(cur.join('\r\n')); cur = []; continue; }
    if (cur) cur.push(line);
  }
  // A message cut short (the driver reads only its first part) has no
  // closing boundary; what arrived of the last part is kept.
  if (cur) parts.push(cur.join('\r\n'));
  return parts;
}

function parsePart(raw, depth = 0) {
  const { head, body } = splitHeadBody(raw);
  const headers = parseHeaders(head);
  const get = (n) => { const h = headers.find((x) => x[0] === n); return h ? h[1] : ''; };
  const ct = parseParams(get('content-type') || 'text/plain');
  const node = {
    headers, get, body,
    type: ct.value || 'text/plain',
    params: ct.params,
    attachment: parseParams(get('content-disposition')).value === 'attachment',
    children: []
  };
  if (node.type.startsWith('multipart/') && ct.params.boundary && depth < 8) {
    node.children = splitMultipart(body, ct.params.boundary).map((p) => parsePart(p, depth + 1));
  }
  return node;
}

function leafText(node) {
  const cte = node.get('content-transfer-encoding').trim().toLowerCase();
  let bytes;
  if (cte === 'base64') bytes = Buffer.from(node.body.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  else if (cte === 'quoted-printable') bytes = qpDecode(node.body);
  else bytes = Buffer.from(node.body, 'latin1');
  return decodeBytes(bytes, node.params.charset);
}

// The readable text: the first text/plain part that is not an attachment,
// otherwise the first such HTML part with the tags taken out.
function bodyText(root) {
  const leaves = [];
  const walk = (n) => {
    if (n.children.length) n.children.forEach(walk);
    else if (!n.attachment && (n.type === 'text/plain' || n.type === 'text/html')) leaves.push(n);
  };
  walk(root);
  const plain = leaves.find((n) => n.type === 'text/plain');
  if (plain) return leafText(plain).replace(/\r/g, '').trim();
  const html = leaves.find((n) => n.type === 'text/html');
  return html ? stripHtml(leafText(html)) : '';
}

// A whole message (a Buffer, or a string with one byte per character).
function parseMessage(input) {
  const raw = Buffer.isBuffer(input) ? input.toString('latin1') : String(input || '');
  const root = parsePart(raw);
  return {
    header: (n) => headerText(root.get(String(n).toLowerCase())),
    headerAll: (n) => root.headers.filter((h) => h[0] === String(n).toLowerCase()).map((h) => headerText(h[1])),
    text: bodyText(root)
  };
}

module.exports = { parseMessage, headerText, decodeBytes, qpDecode, parseParams };
