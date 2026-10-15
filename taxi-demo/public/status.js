// Confirmation page: ask dispatch for news every two seconds until a car is
// allocated, the booking is confirmed for later, or it is cancelled.
(function () {
  'use strict';
  var card = document.querySelector('[data-status]');
  if (!card) return;
  var body = card.querySelector('[data-status-body]');
  var token = card.getAttribute('data-token');
  var BASE = document.documentElement.getAttribute('data-base') || '';
  var tries = 0;
  function done(s, asap) { return s === 'allocated' || s === 'cancelled' || (s === 'confirmed' && !asap); }
  function poll() {
    tries += 1;
    fetch(BASE + '/api/bookings/' + token, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v) return;
        if (v.status !== card.getAttribute('data-state')) {
          card.setAttribute('data-state', v.status);
          if (v.status === 'cancelled') location.reload();
          else body.innerHTML = v.html;
        }
        if (!done(v.status, v.asap) && tries < 90) setTimeout(poll, 2000);
      })
      .catch(function () { if (tries < 90) setTimeout(poll, 4000); });
  }
  setTimeout(poll, 1500);
})();
