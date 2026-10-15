// Booking page: put the reader on the error summary when the form comes back
// with problems, and stop a double tap sending two bookings.
(function () {
  'use strict';
  var summary = document.querySelector('.error-summary');
  if (summary) summary.focus();
  var form = document.querySelector('form[data-book]');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    var btn = form.querySelector('button[type=submit]');
    if (form.dataset.sent) { e.preventDefault(); return; }
    form.dataset.sent = '1';
    if (btn) { btn.disabled = true; btn.textContent = 'Sending to dispatch'; }
  });
})();
