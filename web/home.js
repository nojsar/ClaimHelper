// GetMyYes homepage behaviour that is not needed for first paint: the glass
// motion controls (pause, card tilt, frosted-focus reveal) and the product
// film. Loaded with defer from index.html.

// Glass motion: the pause control, the card's pointer tilt and sheen,
// and the frosted-focus reveal. Plain DOM, no libraries, no timers.
(function () {
  var root = document.documentElement;
  var toggle = document.querySelector('.motion-toggle');
  var stored = null;
  try { stored = localStorage.getItem('gmy-motion'); } catch (e) {}
  function setPaused(paused) {
    root.classList.toggle('motion-paused', paused);
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(paused));
      toggle.textContent = paused ? 'Play motion' : 'Pause motion';
    }
  }
  setPaused(stored === 'paused');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var paused = !root.classList.contains('motion-paused');
      setPaused(paused);
      try { localStorage.setItem('gmy-motion', paused ? 'paused' : 'playing'); } catch (e) {}
    });
  }

  var calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Tilt and sheen follow a fine pointer only; touch gets the float.
  var stage = document.querySelector('.glass-stage');
  if (stage && !calm && matchMedia('(pointer: fine)').matches) {
    var frame = 0;
    stage.addEventListener('pointermove', function (event) {
      var rect = stage.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width;
      var y = (event.clientY - rect.top) / rect.height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function () {
        stage.style.setProperty('--ry', ((x - 0.5) * 7).toFixed(2) + 'deg');
        stage.style.setProperty('--rx', ((0.5 - y) * 6).toFixed(2) + 'deg');
        stage.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        stage.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      });
    });
    stage.addEventListener('pointerleave', function () {
      cancelAnimationFrame(frame);
      ['--rx', '--ry', '--mx', '--my'].forEach(function (name) { stage.style.removeProperty(name); });
    });
  }

  // Frosted focus. Only content below the first screen takes part, so
  // nothing a visitor sees on arrival ever starts hidden.
  if (calm || !('IntersectionObserver' in window) || document.visibilityState === 'hidden') return;
  var groups = [
    ['.deadline-band-inner', false], ['.section-heading', false],
    ['.packet-shell', false], ['.proof-layout', false], ['.price-grid', true],
    ['.trust-grid', false], ['.faq', false], ['.closing .wrap', false]
  ];
  var fold = window.innerHeight;
  var targets = [];
  groups.forEach(function (group) {
    document.querySelectorAll(group[0]).forEach(function (el) {
      var items = group[1] ? Array.prototype.slice.call(el.children) : [el];
      items.forEach(function (item, index) {
        if (item.getBoundingClientRect().top < fold) return;
        item.setAttribute('data-reveal', '');
        item.style.setProperty('--reveal-delay', (index * 110) + 'ms');
        targets.push(item);
      });
    });
  });
  if (!targets.length) return;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  targets.forEach(function (el) { observer.observe(el); });
  root.classList.add('reveal-ready');
  window.addEventListener('beforeprint', function () {
    targets.forEach(function (el) { el.classList.add('is-revealed'); });
  });
})();

// The plain-English lens: a glass bar over the fictional letter, and the
// line beneath it reads in plain English. It follows a fine pointer, drags
// on touch, and a tap moves it to that line. Keyboard and screen-reader
// users already have every plain line in the list, and "Translate every
// line" shows them all. One short glide on arrival (under 5 seconds, never
// under reduced motion) shows what it does.
(function () {
  var card = document.querySelector('[data-lens]');
  var sheet = card && card.querySelector('.lens-sheet');
  var glass = card && card.querySelector('.lens-glass');
  var rows = card ? Array.prototype.slice.call(card.querySelectorAll('.lens-row')) : [];
  if (!sheet || !glass || !rows.length) return;
  var calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(pointer: fine)').matches;
  card.classList.add('lens-on');
  var hint = card.querySelector('.lens-hint');
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'lens-toggle';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.textContent = 'translate every line';
  hint.textContent = fine ? 'Move the lens over the letter, or ' : 'Drag the lens or tap a line, or ';
  hint.appendChild(toggle);

  var boxes = [];
  var cur = { y: 0, h: 0 };
  var target = { y: 0, h: 0 };
  var index = 0;
  var all = false;
  var dragging = false;
  var frame = 0;
  var settle = 0;
  var intro = [];

  // Each line's box, relative to the sheet; the plain line clips to the bar.
  function measure() {
    var origin = sheet.getBoundingClientRect().top;
    boxes = rows.map(function (row) {
      var rect = row.getBoundingClientRect();
      var plain = row.querySelector('.lens-plain');
      plain.style.setProperty('--oy', (rect.top - origin).toFixed(1) + 'px');
      plain.style.setProperty('--rh', rect.height.toFixed(1) + 'px');
      return { top: rect.top - origin, height: rect.height };
    });
  }
  function paint() {
    sheet.style.setProperty('--ly', cur.y.toFixed(1) + 'px');
    sheet.style.setProperty('--lh', cur.h.toFixed(1) + 'px');
  }
  function step() {
    frame = 0;
    var k = calm ? 1 : 0.2;
    cur.y += (target.y - cur.y) * k;
    cur.h += (target.h - cur.h) * k;
    if (Math.abs(target.y - cur.y) < 0.3 && Math.abs(target.h - cur.h) < 0.3) {
      cur.y = target.y;
      cur.h = target.h;
    } else {
      frame = requestAnimationFrame(step);
    }
    paint();
  }
  function aim(y, h) {
    target.y = y;
    target.h = h;
    if (!frame) frame = requestAnimationFrame(step);
  }
  function toRow(i) {
    index = Math.max(0, Math.min(boxes.length - 1, i));
    aim(boxes[index].top, boxes[index].height);
  }
  function wholeLetter() {
    var last = boxes[boxes.length - 1];
    aim(boxes[0].top, last.top + last.height - boxes[0].top);
  }
  function rowAt(y) {
    for (var i = 0; i < boxes.length; i += 1) {
      if (y < boxes[i].top + boxes[i].height) return i;
    }
    return boxes.length - 1;
  }
  // Centred on the pointer, as tall as the line beneath it, kept on the
  // letter; it settles onto that line once the pointer rests.
  function follow(clientY) {
    var y = clientY - sheet.getBoundingClientRect().top;
    index = rowAt(y);
    var h = boxes[index].height;
    var last = boxes[boxes.length - 1];
    aim(Math.max(boxes[0].top, Math.min(last.top + last.height - h, y - h / 2)), h);
    clearTimeout(settle);
    settle = setTimeout(function () { if (!all) toRow(index); }, 180);
  }
  function stopIntro() {
    intro.forEach(clearTimeout);
    intro = [];
  }

  sheet.addEventListener('pointermove', function (event) {
    if (all || (!dragging && event.pointerType !== 'mouse')) return;
    stopIntro();
    follow(event.clientY);
  });
  sheet.addEventListener('pointerleave', function () {
    if (!dragging && !all) toRow(index);
  });
  glass.addEventListener('pointerdown', function (event) {
    if (all) return;
    dragging = true;
    stopIntro();
    glass.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  function release() {
    if (!dragging) return;
    dragging = false;
    toRow(index);
  }
  glass.addEventListener('pointerup', release);
  glass.addEventListener('pointercancel', release);
  rows.forEach(function (row, i) {
    row.addEventListener('click', function () {
      if (all) return;
      stopIntro();
      toRow(i);
    });
  });
  toggle.addEventListener('click', function () {
    all = !all;
    stopIntro();
    toggle.setAttribute('aria-pressed', String(all));
    if (all) wholeLetter();
    else toRow(index);
  });

  measure();
  index = calm ? 1 : 0;
  cur.y = target.y = boxes[index].top;
  cur.h = target.h = boxes[index].height;
  paint();
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () {
      measure();
      if (all) wholeLetter();
      else toRow(index);
    }).observe(sheet);
  }
  if (calm || !('IntersectionObserver' in window)) return;
  var seen = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) return;
    seen.disconnect();
    [1, 2, 3, 4, 1].forEach(function (i, n) {
      intro.push(setTimeout(function () { toRow(i); }, 700 + n * 640));
    });
  }, { threshold: 0.6 });
  seen.observe(sheet);
})();

// The one-number hook sharpens into place and its dots light in turn, but
// only when it starts below the fold and motion is welcome; text is never
// faded, so nothing is ever unreadable.
(function () {
  var odds = document.querySelector('.odds');
  if (!odds || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  if (odds.getBoundingClientRect().top < window.innerHeight) return;
  odds.setAttribute('data-armed', '');
  var watch = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) return;
    odds.classList.add('is-in');
    watch.disconnect();
  }, { rootMargin: '0px 0px -15% 0px' });
  watch.observe(odds);
  window.addEventListener('beforeprint', function () { odds.classList.add('is-in'); });
})();

// Three promises. Driven by scroll, never by a clock: each picture tile
// settles (zooms out and opens) as it arrives, the paper ornaments drift at
// their own depth, and on wide screens one heading is pinned while the
// pictures pass. As the next row arrives, the letters the two headings share
// (a longest common subsequence, so they never cross) travel to their places
// in the next heading while the rest shrink away and the new ones grow in.
// The real headings stay in each row for screen readers; the flying copy is
// aria-hidden. Under reduced motion nothing here runs.
(function () {
  var section = document.querySelector('.usp');
  if (!section || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var rows = Array.prototype.slice.call(section.querySelectorAll('.usp-row'));
  var medias = rows.map(function (row) { return row.querySelector('.usp-media'); });
  var orns = rows.map(function (row) { return row.querySelector('.usp-orn'); });
  var flight = section.querySelector('.usp-flight');
  var countNow = section.querySelector('.usp-count-now');
  var pinLine = section.querySelector('.usp-pin-line');
  var wide = matchMedia('(min-width: 1024px)');
  var flying = false;
  var layouts = [];
  var built = -1;
  var actors = [];
  var shown = -1;

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function clamp(t) { return Math.max(0, Math.min(1, t)); }

  function textOf(title) {
    var out = '';
    title.childNodes.forEach(function (node) {
      out += node.nodeName === 'BR' ? '\n' : node.textContent.replace(/\s+/g, ' ');
    });
    return out.replace(/ ?\n ?/g, '\n').trim();
  }
  var texts = rows.map(function (row) { return textOf(row.querySelector('.usp-title')); });
  var lines = rows.map(function (row) { return row.querySelector('.usp-line').textContent; });

  // Where every character of a heading sits when it is set at rest.
  function measure(text) {
    flight.textContent = '';
    var spans = [];
    for (var i = 0; i < text.length; i += 1) {
      if (text[i] === '\n') { flight.appendChild(document.createElement('br')); continue; }
      var span = document.createElement('span');
      span.textContent = text[i];
      span.style.position = 'static';
      flight.appendChild(span);
      spans.push(span);
    }
    var origin = flight.getBoundingClientRect();
    return spans.map(function (span) {
      var rect = span.getBoundingClientRect();
      return { ch: span.textContent, x: rect.left - origin.left, y: rect.top - origin.top };
    });
  }
  function lcs(a, b) {
    var n = a.length, m = b.length, table = [], i, j;
    for (i = 0; i <= n; i += 1) { table.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i -= 1) {
      for (j = m - 1; j >= 0; j -= 1) {
        table[i][j] = a[i].ch !== ' ' && a[i].ch === b[j].ch ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    var pairs = {};
    for (i = 0, j = 0; i < n && j < m;) {
      if (a[i].ch !== ' ' && a[i].ch === b[j].ch) { pairs[i] = j; i += 1; j += 1; }
      else if (table[i + 1][j] >= table[i][j + 1]) i += 1;
      else j += 1;
    }
    return pairs;
  }
  // The cast for the hand-off from heading k to heading k + 1.
  function build(k) {
    if (built === k) return;
    built = k;
    var a = layouts[k], b = layouts[k + 1], pairs = lcs(a, b), taken = {};
    flight.textContent = '';
    actors = [];
    a.forEach(function (from, i) {
      var to = pairs[i] !== undefined ? b[pairs[i]] : null;
      if (to) taken[pairs[i]] = true;
      actors.push({ ch: from.ch, from: from, to: to, kind: to ? 'move' : 'out' });
    });
    b.forEach(function (to, j) {
      if (!taken[j]) actors.push({ ch: to.ch, from: to, to: to, kind: 'in' });
    });
    actors.forEach(function (actor) {
      actor.el = document.createElement('span');
      actor.el.textContent = actor.ch;
      flight.appendChild(actor.el);
    });
  }
  function render(p) {
    var e = easeInOut(p);
    actors.forEach(function (actor) {
      var x, y, s = 1;
      if (actor.kind === 'move') {
        x = actor.from.x + (actor.to.x - actor.from.x) * e;
        y = actor.from.y + (actor.to.y - actor.from.y) * e - Math.sin(Math.PI * e) * 16;
      } else if (actor.kind === 'out') {
        x = actor.from.x; y = actor.from.y; s = 1 - easeOut(clamp(p * 2.2));
      } else {
        x = actor.to.x; y = actor.to.y; s = easeOut(clamp(p * 2.2 - 1.2));
      }
      actor.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
      actor.el.style.filter = s < 0.98 ? 'blur(' + ((1 - s) * 6).toFixed(1) + 'px)' : '';
    });
  }
  function show(i) {
    if (shown === i) return;
    shown = i;
    countNow.textContent = '0' + (i + 1);
    pinLine.classList.add('is-swapping');
    setTimeout(function () {
      pinLine.textContent = lines[i];
      pinLine.classList.remove('is-swapping');
    }, 160);
  }
  function setUp() {
    flying = wide.matches;
    section.classList.toggle('is-flying', flying);
    built = -1;
    shown = -1;
    if (!flying) { flight.textContent = ''; return; }
    layouts = texts.map(measure);
    flight.style.height = (Math.max.apply(null, layouts.map(function (l) { return l[l.length - 1].y; })) + flight.getBoundingClientRect().height / 2.4) + 'px';
  }

  function update() {
    var vh = window.innerHeight;
    medias.forEach(function (media, i) {
      var rect = media.getBoundingClientRect();
      media.style.setProperty('--q', easeOut(clamp((vh - rect.top) / (vh * 0.75))).toFixed(3));
      if (orns[i]) orns[i].style.setProperty('--py', (-(rect.top + rect.height / 2 - vh / 2) * 0.12).toFixed(1) + 'px');
    });
    if (!flying) return;
    var at = 0, k = -1, p = 0;
    for (var i = 0; i < rows.length - 1; i += 1) {
      var top = rows[i + 1].getBoundingClientRect().top;
      var q = clamp((vh * 0.78 - top) / (vh * 0.36));
      if (q >= 1) { at = i + 1; continue; }
      if (q > 0) { k = i; p = q; }
      break;
    }
    if (k < 0) {
      if (at < rows.length - 1) { build(at); render(0); } else { build(at - 1); render(1); }
      show(at);
    } else {
      build(k);
      render(p);
      show(p < 0.5 ? k : k + 1);
    }
  }

  var pending = 0;
  function schedule() {
    if (pending) return;
    pending = requestAnimationFrame(function () { pending = 0; update(); });
  }
  setUp();
  update();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', function () { setUp(); update(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setUp(); update(); });
})();

// Proof postcards: the postmark settles once the carousel arrives.
(function () {
  var carousel = document.querySelector('.proof-carousel');
  if (!carousel || !('IntersectionObserver' in window)) return;
  var watch = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) return;
    carousel.classList.add('is-posted');
    watch.disconnect();
  }, { threshold: 0.35 });
  watch.observe(carousel);
})();

// Product film: phones get the vertical cut; the film starts muted once it
// is mostly in view, and pauses again when scrolled away. Never under
// reduced motion: there the poster and the controls wait for a tap.
(function () {
  var video = document.querySelector('.film-video');
  if (!video) return;
  if (matchMedia('(max-width: 760px)').matches) {
    video.classList.add('is-vertical');
    video.setAttribute('poster', video.getAttribute('data-vertical-poster'));
    video.setAttribute('width', '1080');
    video.setAttribute('height', '1920');
    video.src = video.getAttribute('data-vertical');
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  var userPaused = false;
  video.addEventListener('pause', function () { if (!video.ended && video.dataset.autoPausing !== '1') userPaused = true; });
  new IntersectionObserver(function (entries) {
    var visible = entries[0].intersectionRatio >= 0.6;
    if (visible && video.paused && !userPaused) {
      video.preload = 'auto';
      var started = video.play();
      if (started && started.catch) started.catch(function () {});
    } else if (!visible && !video.paused) {
      video.dataset.autoPausing = '1';
      video.pause();
      video.dataset.autoPausing = '';
    }
  }, { threshold: [0, 0.6] }).observe(video);
})();
