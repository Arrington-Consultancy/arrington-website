// Shared script: place suggestions on address fields, a live price on any
// form marked data-quote (written as the fare block, counted up like a
// meter), the mobile action bar standing down while the home page's form is
// on screen, and a small reveal-on-scroll. Every page works without it.
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');
  try { if (!CSS.supports('selector(:has(*))')) root.classList.add('no-has'); } catch (e) { root.classList.add('no-has'); }
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduced = false; }

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

  // The figure counts up from nothing to the price, the way a meter runs,
  // in under half a second. Every number in the text runs (a metered fare
  // is "£14 to £16"); the words around them stay put.
  function countUp(el, text) {
    var parts = text.split(/(\d+(?:\.\d+)?)/);
    var nums = [];
    for (var i = 1; i < parts.length; i += 2) nums.push(parseFloat(parts[i]));
    if (reduced || !nums.length || !window.requestAnimationFrame) { el.textContent = text; return; }
    var start = null;
    var ms = 420;
    function frame(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / ms);
      var e = 1 - Math.pow(1 - p, 3);
      var out = '';
      var n = 0;
      for (var k = 0; k < parts.length; k++) {
        if (k % 2 === 1) {
          var target = nums[n++];
          var v = target * e;
          out += parts[k].indexOf('.') === -1 ? String(Math.round(v)) : v.toFixed(2);
        } else out += parts[k];
      }
      el.textContent = p < 1 ? out : text;
      if (p < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  // Builds the fare block in the same shape the server renders it.
  function writeFare(out, q) {
    out.innerHTML = '';
    if (q.kind === 'unpriced') {
      out.classList.remove('is-priced');
      var hint = document.createElement('p');
      hint.className = 'fare-hint';
      hint.textContent = q.label;
      out.appendChild(hint);
      return;
    }
    var label = document.createElement('span');
    label.className = 'fare-label';
    label.textContent = q.kind === 'fixed' ? 'Fixed price' : 'Estimated fare';
    var figure = document.createElement('strong');
    figure.className = 'fare-figure';
    var sub = document.createElement('span');
    sub.className = 'fare-sub';
    sub.textContent = q.kind === 'fixed' ? String(q.label).replace(/^Fixed price, /, '') : q.label + '. The meter decides the final fare.';
    out.appendChild(label);
    out.appendChild(figure);
    out.appendChild(sub);
    out.classList.remove('is-priced');
    void out.offsetWidth;
    out.classList.add('is-priced');
    countUp(figure, q.text);
  }

  // The price, written into every fare block that belongs to the form (its
  // own, and any elsewhere on the page marked data-quote-for), mirrored to
  // the mobile action bar on the booking page, and reflected in the home
  // page button's words.
  function liveQuote(form) {
    var outs = Array.prototype.filter.call(document.querySelectorAll('[data-quote-out]'), function (o) {
      return form.contains(o) || (form.id && o.getAttribute('data-quote-for') === form.id);
    });
    if (!outs.length) return;
    var mirrors = document.querySelectorAll('[data-quote-mirror]');
    var cta = form.querySelector('[data-quote-cta]');
    var ctaText = cta ? cta.textContent : '';
    var timer = null;
    var seq = 0;
    var last = '';
    function value(name) {
      var el = form.querySelector('[name="' + name + '"]:checked') || form.querySelector('[name="' + name + '"]:not([type=radio])');
      return el ? el.value : '';
    }
    function mirror(text) { for (var i = 0; i < mirrors.length; i++) mirrors[i].textContent = text; }
    function update() {
      var pickup = value('pickup');
      var destination = value('destination');
      if (pickup.trim().length < 3 || destination.trim().length < 3) return;
      var key = [pickup, destination, value('vehicle'), value('when'), value('date'), value('time')].join('|');
      if (key === last) return;
      var mine = ++seq;
      fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ pickup: pickup, destination: destination, vehicle: value('vehicle') || 'saloon', when: value('when'), date: value('date'), time: value('time') })
      }).then(function (r) { return r.json(); }).then(function (q) {
        if (mine !== seq) return;
        last = key;
        for (var i = 0; i < outs.length; i++) writeFare(outs[i], q);
        mirror(q.kind === 'unpriced' ? '' : q.text);
        if (cta) cta.textContent = q.kind === 'unpriced' ? ctaText : 'Book this taxi';
      }).catch(function () {});
    }
    function soon() { clearTimeout(timer); timer = setTimeout(update, 350); }
    form.addEventListener('input', soon);
    form.addEventListener('change', soon);
    update();
  }

  // On the home page the booking form is on the first screen, so the fixed
  // bar at the foot would only cover it: the bar stands down while the form
  // is in view and returns once it has scrolled away.
  function actionBar() {
    var bar = document.querySelector('[data-action-bar][data-hide-near]');
    if (!bar || !('IntersectionObserver' in window)) return;
    var target = document.querySelector(bar.getAttribute('data-hide-near'));
    if (!target) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { bar.classList.toggle('is-hidden', e.isIntersecting); });
    }, { threshold: 0.15 });
    io.observe(target);
  }

  // Sections marked .reveal fade up as they come into view. Without
  // IntersectionObserver, or with reduced motion, the stylesheet shows them.
  function reveal() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length || !('IntersectionObserver' in window)) { root.classList.add('no-reveal'); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  // Close the mobile menu when a link in it is followed or Escape is pressed.
  var menu = document.querySelector('details.menu');
  if (menu) {
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) menu.removeAttribute('open'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.open) { menu.removeAttribute('open'); menu.querySelector('summary').focus(); } });
  }

  document.querySelectorAll('input[data-places]').forEach(autocomplete);
  document.querySelectorAll('form[data-quote]').forEach(liveQuote);
  actionBar();
  reveal();
})();
