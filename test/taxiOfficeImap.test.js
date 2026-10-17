'use strict';

// The free Gmail driver (Tom, 17/10/2026: "lets just make a free one"): the
// demo's live address as a free Gmail account read over IMAP with an app
// password. Run against a small fake IMAP server speaking the commands the
// driver uses, so the bytes on the wire are real: literals, encoded
// headers, multipart bodies, a Drafts folder found by its flag.

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const fs = require('fs');
const path = require('path');

const mail = require('../lib/taxiOffice/mail');
const mime = require('../lib/taxiOffice/mail/mime');
const imap = require('../lib/taxiOffice/mail/imap');
const office = require('../lib/taxiOffice/office');

const ADDRESS = 'tidewellcars.demo@gmail.com';
const APP_PASSWORD = 'abcdefghijklmnop';
const TAG = 'k7m2qa';
const TAGGED = `tidewellcars.demo+${TAG}@gmail.com`;

const crlf = (lines) => Buffer.from(lines.join('\r\n'), 'utf8');

// Four messages a phone or a mail app would really send.
const MESSAGES = {
  // Plain text, sent to a visitor's tagged address.
  101: { date: '17-Oct-2026 08:05:00 +0000', raw: crlf([
    'From: Dan Fry <dan@example.com>', `To: ${TAGGED}`, 'Subject: Taxi to the airport',
    'Message-ID: <m101@example.com>', 'Content-Type: text/plain; charset=utf-8', '',
    'Can I book a car from Exmouth to Exeter Airport tomorrow at 6am?', 'Dan, 07700 900123', '']) },
  // multipart/alternative, quoted-printable UTF-8 with a soft line break, a
  // subject in two encoded words that split a character, a Reply-To, and the
  // tag only on the Cc line.
  102: { date: '17-Oct-2026 09:10:30 +0100', raw: (() => {
    const subj = Buffer.from('Café run to Topsham – 4 of us', 'utf8');
    const a = subj.slice(0, 4).toString('base64');
    const b = subj.slice(4).toString('base64');
    return crlf([
      'From: =?UTF-8?Q?Ren=C3=A9e_Hart?= <renee@example.com>', 'Reply-To: bookings@hart.example', 'To: someone@example.com',
      `Cc: ${TAGGED}`, `Subject: =?UTF-8?B?${a}?=`, ` =?UTF-8?B?${b}?=`, 'Message-ID: <m102@example.com>', 'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="b1"', '', '--b1',
      'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: quoted-printable', '',
      'Caf=C3=A9 at 7pm, then home to Exmouth. It=E2=80=99s four of us and a very long=',
      ' line.', '--b1', 'Content-Type: text/html; charset=UTF-8', '', '<p>HTML version</p>', '--b1--', '']);
  })() },
  // HTML only, base64, in ISO-8859-1 with a pound sign.
  103: { date: '17-Oct-2026 10:00:00 +0000', raw: crlf([
    'From: Ann <ann@example.com>', `To: ${TAGGED}`, 'Subject: Price?', 'Content-Type: text/html; charset=iso-8859-1',
    'Content-Transfer-Encoding: base64', '',
    Buffer.from('<p>Is it \xa345 or \xa328 to the station?</p>', 'latin1').toString('base64'), '']) },
  // multipart/mixed: an attached text file first, the real text after it.
  104: { date: '17-Oct-2026 11:00:00 +0000', raw: crlf([
    'From: Bea <bea@example.com>', `To: ${TAGGED}`, 'Subject: Account booking', 'Content-Type: multipart/mixed; boundary=zz', '',
    '--zz', 'Content-Type: text/plain; name=notes.txt', 'Content-Disposition: attachment; filename=notes.txt', '', 'SECRET ATTACHMENT TEXT',
    '--zz', 'Content-Type: text/plain', '', 'Please book the usual for Monday.', '--zz--', '']) }
};

function fakeImap({ messages = MESSAGES, password = APP_PASSWORD, draftsName = '[Google Mail]/Drafts' } = {}) {
  const state = { connections: 0, logins: [], commands: [], fetched: [], appended: [], sockets: [], messages: { ...messages } };
  const server = net.createServer((sock) => {
    state.connections += 1;
    state.sockets.push(sock);
    sock.write('* OK Gimap ready for requests\r\n');
    let buf = Buffer.alloc(0);
    let appendWait = null;
    sock.on('error', () => {});
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (appendWait) {
          if (buf.length < appendWait.n + 2) return;
          state.appended.push({ box: appendWait.box, flags: appendWait.flags, raw: buf.slice(0, appendWait.n) });
          buf = buf.slice(appendWait.n + 2);
          sock.write(`${appendWait.tag} OK [APPENDUID 9 ${700 + state.appended.length}] (Success)\r\n`);
          appendWait = null;
          continue;
        }
        const i = buf.indexOf('\r\n');
        if (i < 0) return;
        const line = buf.slice(0, i).toString('utf8');
        buf = buf.slice(i + 2);
        const sp = line.indexOf(' ');
        const tag = line.slice(0, sp);
        const cmd = line.slice(sp + 1);
        state.commands.push(/^LOGIN /i.test(cmd) ? 'LOGIN' : cmd);
        let m;
        if ((m = /^LOGIN "([^"]*)" "([^"]*)"$/i.exec(cmd))) {
          state.logins.push(m[1]);
          sock.write(m[2] === password ? `${tag} OK ${m[1]} authenticated (Success)\r\n` : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)\r\n`);
        } else if (/^EXAMINE INBOX$/i.test(cmd)) {
          sock.write(`* ${Object.keys(state.messages).length} EXISTS\r\n* OK [UIDVALIDITY 9]\r\n${tag} OK [READ-ONLY] INBOX selected. (Success)\r\n`);
        } else if (/^UID SEARCH SINCE \d{1,2}-[A-Z][a-z]{2}-\d{4}$/.test(cmd)) {
          sock.write(`* SEARCH ${Object.keys(state.messages).join(' ')}\r\n${tag} OK SEARCH completed (Success)\r\n`);
        } else if ((m = /^UID FETCH ([\d,]+) \(UID INTERNALDATE BODY\.PEEK\[\]<0\.(\d+)>\)$/.exec(cmd))) {
          for (const uid of m[1].split(',')) {
            const msg = state.messages[uid];
            if (!msg) continue;
            state.fetched.push(Number(uid));
            const body = msg.raw.slice(0, Number(m[2]));
            // Gmail does not promise the order of the items; put UID after
            // the literal on one of them.
            if (uid === '102') {
              sock.write(Buffer.concat([Buffer.from(`* 2 FETCH (INTERNALDATE "${msg.date}" BODY[]<0> {${body.length}}\r\n`), body, Buffer.from(` UID ${uid})\r\n`)]));
            } else {
              sock.write(Buffer.concat([Buffer.from(`* 1 FETCH (UID ${uid} INTERNALDATE "${msg.date}" BODY[]<0> {${body.length}}\r\n`), body, Buffer.from(')\r\n')]));
            }
          }
          sock.write(`${tag} OK Success\r\n`);
        } else if (/^LIST "" "\*"$/.test(cmd)) {
          sock.write(`* LIST (\\HasNoChildren) "/" "INBOX"\r\n* LIST (\\HasChildren \\Noselect) "/" "[Google Mail]"\r\n* LIST (\\Drafts \\HasNoChildren) "/" "${draftsName}"\r\n* LIST (\\HasNoChildren \\Sent) "/" "[Google Mail]/Sent Mail"\r\n${tag} OK Success\r\n`);
        } else if ((m = /^APPEND "([^"]+)" \(([^)]*)\) \{(\d+)\}$/.exec(cmd))) {
          appendWait = { tag, box: m[1], flags: m[2], n: Number(m[3]) };
          sock.write('+ go ahead\r\n');
        } else if (/^LOGOUT$/i.test(cmd)) {
          sock.end(`* BYE LOGOUT Requested\r\n${tag} OK 73 good day (Success)\r\n`);
        } else {
          sock.write(`${tag} BAD Unknown command\r\n`);
        }
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    state.port = server.address().port;
    state.connect = () => net.connect(state.port, '127.0.0.1');
    state.dropAll = () => state.sockets.splice(0).forEach((s) => s.destroy());
    state.stop = () => new Promise((r) => { state.dropAll(); server.close(r); });
    resolve(state);
  }));
}

const ENV = { TAXI_OFFICE_DEMO_ADDRESS: ADDRESS, TAXI_OFFICE_IMAP_PASSWORD: 'abcd efgh ijkl mnop' };

test('it reads every message as the office needs it: senders, every recipient, decoded subjects and plain text', async () => {
  const server = await fakeImap();
  const box = mail.createMailbox('imap', { env: ENV, connect: server.connect });
  try {
    const emails = await box.listInbox({ days: 2 });
    const by = Object.fromEntries(emails.map((e) => [e.providerId, e]));
    assert.deepEqual(emails.map((e) => e.providerId), ['104', '103', '102', '101'], 'newest first');

    assert.equal(by[101].from, 'Dan Fry <dan@example.com>');
    assert.deepEqual(by[101].to, [TAGGED]);
    assert.equal(by[101].subject, 'Taxi to the airport');
    assert.equal(by[101].body, 'Can I book a car from Exmouth to Exeter Airport tomorrow at 6am?\nDan, 07700 900123');
    assert.equal(by[101].messageId, '<m101@example.com>');
    assert.equal(by[101].receivedAt, '2026-10-17T09:05', 'London time, BST');
    assert.equal(by[101].id, 'im-9-101');

    assert.equal(by[102].subject, 'Café run to Topsham – 4 of us', 'a character split across two encoded words comes out whole');
    assert.equal(by[102].from, 'bookings@hart.example', 'Reply-To wins, as the Gmail driver does');
    assert.deepEqual(by[102].to, ['someone@example.com', TAGGED]);
    assert.equal(by[102].body, 'Café at 7pm, then home to Exmouth. It’s four of us and a very long line.');
    assert.equal(by[102].receivedAt, '2026-10-17T09:10', 'the +0100 offset is honoured');

    assert.equal(by[103].body, 'Is it £45 or £28 to the station?', 'HTML only, base64, ISO-8859-1');
    assert.equal(by[104].body, 'Please book the usual for Monday.', 'an attached text file is never read as the email');

    for (const e of emails) assert.equal(mail.belongsTo(e, ADDRESS, TAG), true, e.providerId);
    assert.equal(server.logins[0], ADDRESS, 'it signs in as the demo address itself');
    assert.equal(await box.account(), ADDRESS);
  } finally {
    await box.close();
    await server.stop();
  }
});

test('a visitor watching for their email costs one sign-in, and a message already read is not fetched again', async () => {
  const server = await fakeImap();
  const box = mail.createMailbox('imap', { env: ENV, connect: server.connect });
  try {
    await box.listInbox({ days: 2 });
    server.messages[105] = { date: '17-Oct-2026 12:00:00 +0000', raw: crlf(['From: Cal <cal@example.com>', `To: ${TAGGED}`, 'Subject: Later', '', 'Another one', '']) };
    const second = await box.listInbox({ days: 2 });
    assert.equal(second.length, 5);
    assert.deepEqual(server.fetched.sort(), [101, 102, 103, 104, 105], 'each message fetched once');
    assert.equal(server.logins.length, 1, 'the connection is kept between reads');
    assert.ok(server.commands.every((c) => !/STORE|EXPUNGE|COPY|MOVE|SELECT/i.test(c)), 'read only: EXAMINE, never SELECT, nothing marked or moved');
    assert.ok(server.commands.filter((c) => /^UID FETCH/.test(c)).every((c) => /BODY\.PEEK\[\]<0\.100000>/.test(c)), 'only the start of each message, and PEEK so nothing is marked read');

    // The server drops the connection between polls: the next read signs in again.
    server.dropAll();
    await new Promise((r) => setTimeout(r, 30));
    const third = await box.listInbox({ days: 2 });
    assert.equal(third.length, 5);
    assert.equal(server.logins.length, 2);
  } finally {
    await box.close();
    await server.stop();
  }
});

test('a reply is left as a draft in the Drafts folder found by its flag, threaded, and nothing is sent', async () => {
  const server = await fakeImap();
  const box = mail.createMailbox('imap', { env: ENV, connect: server.connect });
  try {
    const emails = await box.listInbox({ days: 2 });
    const email = emails.find((e) => e.providerId === '102');
    const text = 'Hi Renée,\nYes, we can do 7pm from the café. £24.\nTidewell Cars';
    const { draftId } = await box.saveReplyDraft(email, text);
    assert.equal(draftId, 'draft-701');
    const [d] = server.appended;
    assert.equal(d.box, '[Google Mail]/Drafts', 'the older UK folder name, found by its \\Drafts flag');
    assert.equal(d.flags, '\\Draft \\Seen');
    const parsed = mime.parseMessage(d.raw);
    assert.equal(parsed.header('from'), ADDRESS);
    assert.equal(parsed.header('to'), 'bookings@hart.example');
    assert.equal(parsed.header('subject'), 'Re: Café run to Topsham – 4 of us');
    assert.equal(parsed.header('in-reply-to'), '<m102@example.com>');
    assert.equal(parsed.header('references'), '<m102@example.com>');
    assert.equal(parsed.text, text.replace(/\n/g, '\n'), 'the text survives the round trip byte for byte');
    assert.ok(d.raw.toString('latin1').split('\r\n').every((l) => l.length <= 998), 'no line longer than the mail limit');
  } finally {
    await box.close();
    await server.stop();
  }
});

test('the driver cannot send: IMAP only, one connection type, no mail-sending code', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/taxiOffice/mail/imap.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /nodemailer|smtp|\b465\b|\b587\b|\b25\b/i);
  assert.match(src, /port: 993/);
  assert.doesNotMatch(src, /require\('(net|http|https)'\)/, 'TLS to the IMAP server is its only way out');
});

test('it will not sign in to an Arrington mailbox, and says why at boot', async () => {
  let connected = 0;
  const env = { TAXI_OFFICE_DEMO_ADDRESS: 'tom@arringtonconsultancy.com', TAXI_OFFICE_IMAP_PASSWORD: APP_PASSWORD, TAXI_OFFICE_MAIL_DRIVER: 'imap' };
  const box = mail.createMailbox('imap', { env, connect: () => { connected += 1; throw new Error('must not connect'); } });
  assert.equal(box.configured(), false);
  await assert.rejects(box.listInbox(), /Arrington mailbox/);
  assert.equal(connected, 0);
  assert.match(mail.describeMailStatus(env), /REFUSED: tom@arringtonconsultancy\.com is an Arrington mailbox/);
  const co = mail.createMailbox('imap', { env: { ...env, TAXI_OFFICE_DEMO_ADDRESS: 'info@arringtonconsultancy.co.uk' } });
  assert.equal(co.configured(), false);
});

test('a wrong password is reported in the server\'s words, never with the password; missing settings are named', async () => {
  const server = await fakeImap({ password: 'somethingelseentirely' });
  const box = mail.createMailbox('imap', { env: ENV, connect: server.connect });
  try {
    await assert.rejects(box.listInbox(), (e) => {
      assert.match(e.message, /Gmail could not sign in: NO \[AUTHENTICATIONFAILED\] Invalid credentials/);
      assert.doesNotMatch(e.message, /abcd|efgh|ijkl|mnop/);
      return true;
    });
  } finally {
    await box.close();
    await server.stop();
  }
  const line = mail.describeMailStatus({ TAXI_OFFICE_DEMO_ADDRESS: ADDRESS, TAXI_OFFICE_MAIL_DRIVER: 'imap' });
  assert.match(line, /demo inbox plus a live address, tidewellcars\.demo@gmail\.com through Gmail, NOT configured, missing TAXI_OFFICE_IMAP_PASSWORD/);
  const ok = mail.describeMailStatus({ ...ENV, TAXI_OFFICE_MAIL_DRIVER: 'imap' });
  assert.match(ok, /through Gmail, configured/);
  assert.doesNotMatch(ok, /abcd/);
});

test('in the office: a visitor\'s email arrives in their inbox only, and their reply lands in Drafts', async () => {
  const server = await fakeImap({ messages: {
    101: MESSAGES[101],
    // Someone else's tag, and an untagged email: shown to nobody here.
    201: { date: '17-Oct-2026 08:10:00 +0000', raw: crlf(['From: x@example.com', 'To: tidewellcars.demo+zzzz99@gmail.com', 'Subject: Other', '', 'not yours', '']) },
    202: { date: '17-Oct-2026 08:11:00 +0000', raw: crlf(['From: spam@example.com', `To: ${ADDRESS}`, 'Subject: Win', '', 'spam', '']) }
  } });
  const box = mail.createMailbox('imap', { env: ENV, connect: server.connect });
  office.__setConnectionsForTests({ mail: mail.createMailbox('demo'), live: box, address: ADDRESS });
  office.__shared.delete('live');
  try {
    const s = office.stateFor('imap-visitor-' + Date.now());
    s.tag = TAG;
    const r = await office.refreshLive({ force: true });
    assert.deepEqual(r, { ok: true, live: true });
    const mine = office.liveEmails(s);
    assert.deepEqual(mine.map((e) => e.providerId), ['101']);
    assert.equal(office.liveFor(s).address, TAGGED);
    assert.equal(office.liveFor(s).label, 'Gmail');
    const r2 = await office.markSent(s, mine[0], 'Hi Dan,\nBooked for 6am.\nTidewell Cars');
    assert.equal(r2.ok, true, r2.message);
    assert.match(r2.message, /Saved as a draft in Gmail/);
    assert.equal(server.appended.length, 1);
    assert.equal(mime.parseMessage(server.appended[0].raw).header('to'), 'dan@example.com');
  } finally {
    office.__setConnectionsForTests({ mail: null, live: null, address: null });
    office.__shared.delete('live');
    await box.close();
    await server.stop();
  }
});

test('the office treats imap as a live driver', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/taxiOffice/office.js'), 'utf8');
  assert.match(src, /n === 'imap'/);
});
