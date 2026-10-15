// Booking page: put the reader on the error summary when the form comes back
// with problems, and stop a double tap sending two bookings. The mobile
// action bar's button submits the same form through its form attribute.
(function () {
  'use strict';
  var summary = document.querySelector('.error-summary');
  if (summary) summary.focus();
  var form = document.querySelector('form[data-book]');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    var buttons = document.querySelectorAll('form[data-book] button[type=submit], button[form="' + form.id + '"]');
    if (form.dataset.sent) { e.preventDefault(); return; }
    form.dataset.sent = '1';
    for (var i = 0; i < buttons.length; i++) { buttons[i].disabled = true; buttons[i].textContent = 'Sending to dispatch'; }
  });
})();
