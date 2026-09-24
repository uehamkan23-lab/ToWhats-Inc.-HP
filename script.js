/* =========================================================
   常奥 ToWhats — script.js
   1. Language (ja / en)
   2. Menu
   3. Scroll: hero stickers drift apart, sections pop in
   4. Opening screen
   ========================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function store(key, value) {
    try {
      if (value === undefined) { return window.localStorage.getItem(key); }
      window.localStorage.setItem(key, value);
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  /* =========================================================
     1. Language
     Japanese is written in the HTML, English lives in data-en.
     ========================================================= */
  var TEXT = {
    ja: { title: '常奥 ToWhats', menu: 'メニュー', open: 'メニューを開く', close: 'メニューを閉じる' },
    en: { title: 'ToWhats | 常奥', menu: 'Menu', open: 'Open menu', close: 'Close menu' }
  };

  var translatable = $$('[data-en]');
  translatable.forEach(function (el) { el.setAttribute('data-ja', el.innerHTML); });

  var lang = store('towhats-lang') === 'en' ? 'en' : 'ja';

  function applyLang(next) {
    translatable.forEach(function (el) {
      el.innerHTML = el.getAttribute(next === 'en' ? 'data-en' : 'data-ja');
    });
    lang = next;
    root.lang = next;
    root.setAttribute('data-lang', next);
    document.title = TEXT[next].title;
    nav.setAttribute('aria-label', TEXT[next].menu);
    syncBurgerLabel();
    refreshWebFonts();
  }

  // Morisawa's web fonts are subset to the characters on the page when it loads.
  // After swapping the language the new characters must be requested again.
  // (TypeSquare-style loader: Ts.loadFont(). Harmless no-op when it is absent.)
  function refreshWebFonts() {
    if (window.Ts && typeof window.Ts.loadFont === 'function') {
      window.Ts.loadFont();
    }
  }

  $('#langToggle').addEventListener('click', function () {
    var next = lang === 'ja' ? 'en' : 'ja';
    store('towhats-lang', next);
    applyLang(next);
  });

  /* =========================================================
     2. Menu (mobile)
     ========================================================= */
  var nav = $('#nav');
  var burger = $('#burger');

  function syncBurgerLabel() {
    var open = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-label', TEXT[lang][open ? 'close' : 'open']);
  }

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    syncBurgerLabel();
  }

  burger.addEventListener('click', function () {
    setMenu(burger.getAttribute('aria-expanded') !== 'true');
  });
  $$('#nav a').forEach(function (a) {
    a.addEventListener('click', function () { setMenu(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { setMenu(false); }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.header__bar')) { setMenu(false); }
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 900) { setMenu(false); }
  });

  /* =========================================================
     3. Scroll
     ========================================================= */
  var hero = $('.hero');
  // Each hero piece moves up at its own speed (data-depth), so the collage
  // separates into layers as you scroll.
  var layers = $$('.hero [data-depth]').map(function (el) {
    return { el: el, depth: parseFloat(el.getAttribute('data-depth')) || 0 };
  });
  var reveals = $$('.reveal');

  function onScroll() {
    var vh = window.innerHeight;

    // Pop sections in once they reach the lower part of the screen.
    for (var i = reveals.length - 1; i >= 0; i--) {
      if (reduceMotion || reveals[i].getBoundingClientRect().top < vh * 0.88) {
        reveals[i].classList.add('is-visible');
        reveals.splice(i, 1);
      }
    }

    if (reduceMotion) { return; }

    var y = Math.max(0, -hero.getBoundingClientRect().top);
    if (y < hero.offsetHeight) {
      layers.forEach(function (l) {
        l.el.style.transform = 'translate3d(0,' + (-y * l.depth).toFixed(1) + 'px,0)';
      });
    }
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) { return; }
    ticking = true;
    window.requestAnimationFrame(function () { onScroll(); ticking = false; });
  }, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  /* =========================================================
     4. Opening screen
     The inline script in <head> decides whether it shows (html.is-opening).
     Here it is held for a moment, then lifted like a curtain.
     ========================================================= */
  var opening = $('#opening');
  var HOLD_MS = 3300;

  function liftOpening() {
    if (!root.classList.contains('is-opening') || opening.classList.contains('is-leaving')) { return; }
    try { window.sessionStorage.setItem('towhats-opening', '1'); } catch (e) { /* storage unavailable */ }
    opening.classList.add('is-leaving');
    root.classList.remove('is-opening');   // releases the hero's paused animations
    opening.addEventListener('animationend', function (e) {
      if (e.target === opening) { opening.remove(); }
    });
    // Fallback in case animationend never fires (e.g. a tab in the background).
    setTimeout(function () { opening.remove(); }, 1200);
  }

  if (root.classList.contains('is-opening')) {
    setTimeout(liftOpening, HOLD_MS);
    opening.addEventListener('click', liftOpening);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { liftOpening(); }
    });
  } else {
    opening.remove();
  }

  /* ---------- boot ---------- */
  $('#year').textContent = String(new Date().getFullYear());
  applyLang(lang);
  onScroll();
})();
