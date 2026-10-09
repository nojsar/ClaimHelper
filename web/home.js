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
