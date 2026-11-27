
// Abacus office: small comforts and nothing else. A button that starts an
// AI call says what is happening and cannot be pressed twice, and a button
// with a question asks it first. The list pages reload themselves when
// something changes, Copy copies, and a standard reply can be put into a
// draft. Every form works without this file.
(function () {
  document.addEventListener('submit', function (e) {
    var form = e.target;
    // The button that was pressed: a draft's form has two (send, and
    // redraft with the staff's guidance).
    var button = e.submitter || form.querySelector('button[type="submit"]');
    if (!button) return;
    var question = button.getAttribute('data-confirm');
    if (question && !window.confirm(question)) {
      e.preventDefault();
      return;
    }
    var busy = button.getAttribute('data-busy');
    if (busy) {
      // Disabled after this tick, so the browser still sends the form.
      setTimeout(function () {
        button.disabled = true;
        button.textContent = busy;
        button.setAttribute('aria-busy', 'true');
      }, 0);
    }
  });
})();

(function () {
  // Copy buttons: a reply that came in another way is copied out and
  // posted or sent where it came in.
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-copy]') : null;
    if (!b || !navigator.clipboard) return;
    navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () { b.textContent = 'Copied'; });
  });

  // A standard reply put into the draft. The draft is replaced, after a
  // question if there is already something in it; nothing is saved until
  // staff press save or approve.
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-insert-reply]') : null;
    if (!b) return;
    var select = document.getElementById(b.getAttribute('data-insert-reply'));
    var target = document.getElementById(b.getAttribute('data-target'));
    if (!select || !target || !select.value) return;
    if (target.value.trim() && !window.confirm('Replace the draft with this standard reply?')) return;
    target.value = select.value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.focus();
  });
})();

(function () {
  // The list pages (Today, Inbox, Complaints) ask the office every few
  // seconds whether anything they show has changed, and reload when it
  // has (Tom, 9 November 2026: an auto refresh as well as the button). The
  // server pulls the mailbox itself every couple of minutes, so a new
  // email appears here without anyone pressing anything. Never asks while
  // the tab is hidden, never while a form on the page has been touched, and
  // stops after an hour rather than ask for ever.
  var line = document.querySelector('[data-live-url]');
  if (!line || !window.fetch) return;
  var stamp = line.getAttribute('data-live-stamp') || '';
  var status = document.getElementById('live-status');
  var started = Date.now();
  var touched = false;
  document.addEventListener('input', function () { touched = true; });
  function later(ms) { setTimeout(check, ms || 10000); }
  function check() {
    if (Date.now() - started > 60 * 60 * 1000) {
      line.classList.add('is-stale');
      if (status) status.textContent = 'This page stopped checking after an hour. Reload it to carry on.';
      return;
    }
    if (document.hidden || touched) return later();
    fetch(line.getAttribute('data-live-url'), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.stamp && j.stamp !== stamp) {
          if (status) status.textContent = 'Something changed. Refreshing...';
          window.location.reload();
          return;
        }
        later();
      })
      .catch(function () { later(30000); });
  }
  later();
})();

(function () {
  // A company menu (the bar's, and the tariff's in Settings) opens the
  // chosen company as soon as it is picked. Without this file the button
  // beside it does the same.
  document.documentElement.classList.add('js');
  Array.prototype.forEach.call(document.querySelectorAll('select[data-autosubmit]'), function (select) {
    select.addEventListener('change', function () {
      if (select.form.requestSubmit) select.form.requestSubmit(); else select.form.submit();
    });
  });
})();

(function () {
  // A form is sent once. A phone's password filler and a tap, or two quick
  // presses, used to send it twice, and the second copy came back as an
  // expired page. Coming back to the page from the browser's history frees
  // it again.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (e.defaultPrevented || !form || !form.setAttribute) return;
    if (form.getAttribute('data-sent')) { e.preventDefault(); return; }
    form.setAttribute('data-sent', '1');
  });
  window.addEventListener('pageshow', function () {
    Array.prototype.forEach.call(document.forms, function (f) { f.removeAttribute('data-sent'); });
  });
})();

(function () {
  // Nothing typed is lost (Tom, 26 November 2026: "entered a complaint and
  // it disappeared"). What was typed into a form is kept in this tab while
  // it is sent. If the office refuses it, or the page had been open too
  // long, it is put back when the person is on that page again. Passwords
  // and tick boxes are never kept, a field someone else has changed since
  // is left alone, and it is thrown away as soon as the form goes through.
  var KEY = 'office.typed';
  var box;
  try { box = window.sessionStorage; box.getItem(KEY); } catch (e) { return; }
  var SKIP = /^\/(login|logout|portal|account)(\/|$)/;
  function kept(el) {
    if (!el.name || el.name === '_csrf' || el.disabled) return false;
    var type = String(el.type || '').toLowerCase();
    return el.tagName !== 'BUTTON' && ['hidden', 'password', 'file', 'submit', 'button', 'checkbox', 'radio'].indexOf(type) === -1;
  }
  function shown(el) {
    if (el.tagName !== 'SELECT') return el.defaultValue;
    var o = Array.prototype.filter.call(el.options, function (x) { return x.defaultSelected; })[0] || el.options[0];
    return o ? o.value : '';
  }
  function forget() { try { box.removeItem(KEY); } catch (e) { /* nothing to do */ } }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (e.defaultPrevented || !form || String(form.method).toLowerCase() !== 'post') return;
    var action = form.getAttribute('action') || '';
    if (SKIP.test(action)) { if (/^\/logout/.test(action)) forget(); return; }
    var fields = [];
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!kept(el) || String(el.value).length > 20000) return;
      fields.push({ n: el.name, v: el.value, was: shown(el) });
    });
    if (!fields.some(function (f) { return f.v !== f.was; })) return;
    try { box.setItem(KEY, JSON.stringify({ path: window.location.pathname, action: action, at: Date.now(), failed: false, fields: fields })); } catch (err) { /* full or blocked */ }
  });

  var entry;
  try { entry = JSON.parse(box.getItem(KEY) || 'null'); } catch (e) { entry = null; }
  if (!entry) return;
  if (!entry.fields || Date.now() - entry.at > 30 * 60 * 1000) return forget();
  var save = function () { try { box.setItem(KEY, JSON.stringify(entry)); } catch (e) { /* nothing to do */ } };
  // The page that says it had been open too long, or that something went
  // wrong: keep it for when they are back where they were.
  if (document.querySelector('[data-keep-typed]')) { entry.failed = true; return save(); }
  // Signing in again on the way back.
  if (window.location.pathname === '/login' || window.location.pathname === '/account') return;
  var here = window.location.pathname === entry.path;
  if (here && document.querySelector('.to-flash-warn, .to-note-bad[role="alert"]')) entry.failed = true;
  // It went through, or the office took them somewhere else: done with.
  if (!entry.failed) return forget();
  if (!here) return save();
  var form = Array.prototype.filter.call(document.forms, function (f) {
    return (f.getAttribute('action') || '') === entry.action && f.elements[entry.fields[0].n];
  })[0];
  forget();
  if (!form) return;
  var put = 0;
  entry.fields.forEach(function (f) {
    var el = form.elements[f.n];
    if (!el || el.length !== undefined && el.tagName !== 'SELECT') return;
    // Only where the page still shows what they started from.
    if (!kept(el) || shown(el) !== f.was || el.value === f.v) return;
    el.value = f.v;
    if (el.value === f.v) put += 1;
  });
  if (!put) return;
  var note = document.createElement('p');
  note.className = 'to-note to-note-ok';
  note.setAttribute('role', 'status');
  note.textContent = 'What you typed has been put back. Check it, then send it again.';
  form.insertBefore(note, form.firstChild);
  // Typed text is on the page again, so the page does not refresh itself.
  form.dispatchEvent(new Event('input', { bubbles: true }));
})();
(function () {
// Keying a job into the dispatch system by hand (Tom, 27 November 2026:
// "each bit can be copied to a clipboard and pasted into icabbi"). Copy
// beside a line copies that line as it stands now, corrections included; a
// date goes as day/month/year, the way a UK booking screen takes it. "Copy
// the whole job" copies every line that has something in it, labelled.
function ukDate(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? m[3] + '/' + m[2] + '/' + m[1] : v; }
function valueOf(el, as) {
if (!el) return '';
var v = el.tagName === 'SELECT' ? (el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '') : el.value;
v = String(v || '').trim();
return as === 'ukdate' ? ukDate(v) : v;
}
function say(button, words) {
var was = button.getAttribute('data-was') || button.textContent;
button.setAttribute('data-was', was);
button.textContent = words;
setTimeout(function () { button.textContent = was; }, 1500);
}
function put(button, text) {
if (!text) return say(button, 'Empty');
if (!navigator.clipboard || !navigator.clipboard.writeText) return say(button, 'Select it');
navigator.clipboard.writeText(text).then(function () { say(button, 'Copied'); }, function () { say(button, 'Select it'); });
}
var LINES = [['name', 'Passenger'], ['phone', 'Phone'], ['date', 'Date', 'ukdate'], ['time', 'Pickup time'], ['pickup', 'Pickup'], ['destination', 'Destination'], ['passengers', 'Passengers'], ['vehicle', 'Vehicle'], ['flight', 'Flight'], ['notes', 'Note for the driver']];
document.addEventListener('click', function (e) {
var b = e.target.closest ? e.target.closest('[data-copy-from], [data-copy-job]') : null;
if (!b) return;
if (b.hasAttribute('data-copy-from')) return put(b, valueOf(document.getElementById(b.getAttribute('data-copy-from')), b.getAttribute('data-copy-as')));
var p = b.getAttribute('data-copy-job');
var out = [];
LINES.forEach(function (l) {
var v = valueOf(document.getElementById(p + '-' + l[0]), l[2]);
if (v) out.push(l[1] + ': ' + v);
});
put(b, out.join('\n'));
});
})();
