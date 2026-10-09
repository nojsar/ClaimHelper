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
    ['.deadline-band-inner', false], ['.section-heading', false], ['.steps-rail', true],
    ['.packet-shell', false], ['.proof-layout', false], ['.price-grid', true],
    ['.trust-grid', false], ['.faq', false], ['.resource-details', false], ['.closing .wrap', false]
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
