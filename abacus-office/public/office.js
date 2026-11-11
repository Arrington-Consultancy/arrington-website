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
