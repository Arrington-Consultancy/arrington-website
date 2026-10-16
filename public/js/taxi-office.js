// Tidewell Cars office: two small comforts and nothing else. A button that
// starts an AI call says what is happening and cannot be pressed twice, and
// "Start the demo again" asks first. Every form works without this file.
(function () {
  document.addEventListener('submit', function (e) {
    var form = e.target;
    var button = form.querySelector('button[type="submit"]');
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
