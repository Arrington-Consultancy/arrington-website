// Tidewell Cars office: small comforts and nothing else. A button that
// starts an AI call says what is happening and cannot be pressed twice, and
// "Start the demo again" asks first. While the workers read the inbox, the
// page reloads itself when they have finished. On the inbox, with a live
// address, the page checks every few seconds and reloads when the visitor's
// email arrives, and the Copy button copies the address. Every form works
// without this file.
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
  // The workers are reading the inbox (the first visitor of the day waits
  // for the AI). Ask every few seconds, reload when they have finished, and
  // give up after three minutes rather than ask for ever.
  var note = document.querySelector('[data-reading-url]');
  if (!note || !window.fetch) return;
  var started = Date.now();
  function later() { setTimeout(check, 3000); }
  function check() {
    if (Date.now() - started > 3 * 60 * 1000) {
      note.textContent = 'The workers are taking longer than usual. Reload the page in a minute.';
      return;
    }
    fetch(note.getAttribute('data-reading-url'), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && !j.reading) { window.location.reload(); return; }
        later();
      })
      .catch(later);
  }
  later();
})();

(function () {
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-copy]') : null;
    if (!b || !navigator.clipboard) return;
    navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () { b.textContent = 'Copied'; });
  });

  // Waiting for an email to the live address. Stops after fifteen minutes,
  // and does not ask while the tab is in the background.
  var live = document.querySelector('[data-live-url]');
  if (!live || !window.fetch) return;
  var known = Number(live.getAttribute('data-live-count')) || 0;
  var status = document.getElementById('live-status');
  var started = Date.now();
  function later() { setTimeout(check, 8000); }
  function check() {
    if (Date.now() - started > 15 * 60 * 1000) {
      if (status) status.textContent = 'Stopped checking after 15 minutes. Reload the page to check again.';
      return;
    }
    if (document.hidden) return later();
    fetch(live.getAttribute('data-live-url'), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.count > known) {
          if (status) status.textContent = 'Your email has arrived. The AI is reading it...';
          window.location.reload();
          return;
        }
        later();
      })
      .catch(later);
  }
  later();
})();
