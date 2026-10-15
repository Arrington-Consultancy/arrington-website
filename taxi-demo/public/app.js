// Shared script: place suggestions on address fields and a live price on any
// form marked data-quote. Every form still works without it.
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');
  try { if (!CSS.supports('selector(:has(*))')) root.classList.add('no-has'); } catch (e) { root.classList.add('no-has'); }

  var placesPromise = null;
  function places() {
    if (!placesPromise) {
      placesPromise = fetch('/assets/places.json').then(function (r) { return r.json(); }).catch(function () { return []; });
    }
    return placesPromise;
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  var uid = 0;
  function autocomplete(input) {
    var id = 'ac-' + (++uid);
    var list = document.createElement('ul');
    list.className = 'ac-list';
    list.id = id;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    input.parentNode.appendChild(list);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', id);
    var items = [];
    var active = -1;

    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
    function choose(i) {
      if (!items[i]) return;
      input.value = items[i].n;
      close();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function highlight(i) {
      var lis = list.children;
      for (var k = 0; k < lis.length; k++) lis[k].setAttribute('aria-selected', k === i ? 'true' : 'false');
      active = i;
      if (lis[i]) { input.setAttribute('aria-activedescendant', lis[i].id); lis[i].scrollIntoView({ block: 'nearest' }); }
    }
    function render(q) {
      places().then(function (all) {
        var words = norm(q).split(' ').filter(Boolean);
        if (!words.length) { close(); return; }
        items = all.filter(function (p) { var h = norm(p.n + ' ' + p.a); return words.every(function (w) { return h.indexOf(w) !== -1; }); }).slice(0, 6);
        list.innerHTML = '';
        items.forEach(function (p, i) {
          var li = document.createElement('li');
          li.id = id + '-' + i;
          li.setAttribute('role', 'option');
          li.textContent = p.n;
          var small = document.createElement('small');
          small.textContent = p.a;
          li.appendChild(small);
          li.addEventListener('mousedown', function (e) { e.preventDefault(); choose(i); });
          list.appendChild(li);
        });
        if (items.length) { list.hidden = false; input.setAttribute('aria-expanded', 'true'); highlight(-1); } else close();
      });
    }
    input.addEventListener('focus', places);
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(active + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(active - 1, 0)); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
  }

  function liveQuote(form) {
    var out = form.querySelector('[data-quote-out]');
    if (!out) return;
    var timer = null;
    var seq = 0;
    function value(name) {
      var el = form.querySelector('[name="' + name + '"]:checked') || form.querySelector('[name="' + name + '"]:not([type=radio])');
      return el ? el.value : '';
    }
    function update() {
      var pickup = value('pickup');
      var destination = value('destination');
      if (pickup.trim().length < 3 || destination.trim().length < 3) return;
      var mine = ++seq;
      fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ pickup: pickup, destination: destination, vehicle: value('vehicle') || 'saloon', when: value('when'), date: value('date'), time: value('time') })
      }).then(function (r) { return r.json(); }).then(function (q) {
        if (mine !== seq) return;
        out.innerHTML = '';
        if (q.kind === 'unpriced') { out.textContent = q.label; return; }
        out.appendChild(document.createTextNode('Price: '));
        var strong = document.createElement('strong');
        strong.textContent = q.text;
        out.appendChild(strong);
        if (q.label) { var small = document.createElement('small'); small.textContent = q.label + (q.kind === 'metered' ? '. The meter decides the final fare.' : '.'); out.appendChild(small); }
      }).catch(function () {});
    }
    function soon() { clearTimeout(timer); timer = setTimeout(update, 350); }
    form.addEventListener('input', soon);
    form.addEventListener('change', soon);
    update();
  }

  document.querySelectorAll('input[data-places]').forEach(autocomplete);
  document.querySelectorAll('form[data-quote]').forEach(liveQuote);
})();
