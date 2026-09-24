/* =========================================================
   常奥株式会社 ToWhats Inc. — script.js
   1. Language (ja / en)
   2. Mobile menu
   3. Scroll-linked motion (incl. reveal)
   ========================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function store(key, value) {
    try {
      if (value === undefined) { return window.localStorage.getItem(key); }
      window.localStorage.setItem(key, value);
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  /* =========================================================
     1. Language
     Japanese is in the HTML; English is in data-en.
     ========================================================= */
  var TEXT = {
    ja: { title: '常奥株式会社 ToWhats Inc.', menu: 'メニュー', open: 'メニューを開く', close: 'メニューを閉じる' },
    en: { title: 'ToWhats Inc.', menu: 'Menu', open: 'Open menu', close: 'Close menu' }
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
    $('#menu').setAttribute('aria-label', TEXT[next].menu);
    syncBurgerLabel();
    splitStatement();
    onScroll();
  }

  $('#langToggle').addEventListener('click', function () {
    var next = lang === 'ja' ? 'en' : 'ja';
    store('towhats-lang', next);
    applyLang(next);
  });

  /* =========================================================
     2. Mobile menu
     ========================================================= */
  var gnav = $('#gnav');
  var burger = $('#burger');

  function syncBurgerLabel() {
    var open = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-label', TEXT[lang][open ? 'close' : 'open']);
  }

  function setMenu(open) {
    gnav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
    syncBurgerLabel();
  }

  burger.addEventListener('click', function () {
    setMenu(burger.getAttribute('aria-expanded') !== 'true');
  });
  $$('#menu a').forEach(function (a) {
    a.addEventListener('click', function () { setMenu(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { setMenu(false); }
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 833) { setMenu(false); }
  });

  /* =========================================================
     3. Scroll-linked motion
     ========================================================= */
  var heroContent = $('#heroContent');
  var hero = $('.hero');
  var statement = $('#statement');
  var principles = $('.principles');
  var principleItems = $$('.principle');
  var dots = $$('.principles__dots span');
  var productVisual = $('#productVisual');
  var reveals = $$('.reveal');
  var words = [];

  // Japanese has no spaces, so split it into phrases that must not break
  // inside (e.g. 会社です。). Particles, punctuation and lone kanji are glued
  // onto the phrase before them. Falls back to single characters.
  var HIRA = /^[\u3041-\u309f]+$/;
  var PUNCT = /^[、。，．・」』）！？]+$/;
  var SENTENCE_END = /[。！？]$/;
  var ONE_KANJI = /^[\u4e00-\u9fff々]$/;
  var ENDS_KANJI = /[\u4e00-\u9fff々]$/;

  function japanesePhrases(text) {
    if (!window.Intl || !Intl.Segmenter) { return text.split(''); }
    var out = [];
    Array.from(new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)).forEach(function (s) {
      var x = s.segment;
      var last = out[out.length - 1];
      var glue = last && (
        PUNCT.test(x) ||
        (HIRA.test(x) && !SENTENCE_END.test(last)) ||
        (ONE_KANJI.test(x) && ENDS_KANJI.test(last))
      );
      if (glue) { out[out.length - 1] += x; } else { out.push(x); }
    });
    return out;
  }

  // Wrap the statement in spans that light up on scroll.
  function splitStatement() {
    var text = statement.textContent;
    var pieces = lang === 'en' ? text.split(/(\s+)/) : japanesePhrases(text);
    statement.textContent = '';
    words = [];
    pieces.forEach(function (piece) {
      if (!piece) { return; }
      if (/^\s+$/.test(piece)) {
        statement.appendChild(document.createTextNode(' '));
        return;
      }
      var span = document.createElement('span');
      span.className = 'w';
      span.textContent = piece;
      statement.appendChild(span);
      words.push(span);
    });
  }

  function onScroll() {
    var vh = window.innerHeight;

    // Reveal: fade elements in once they enter the lower part of the screen.
    for (var r = reveals.length - 1; r >= 0; r--) {
      if (reduceMotion || reveals[r].getBoundingClientRect().top < vh * 0.88) {
        reveals[r].classList.add('is-visible');
        reveals.splice(r, 1);
      }
    }

    if (reduceMotion) { return; }

    // Hero: shrink and fade as it leaves.
    var h = hero.getBoundingClientRect();
    var hp = clamp(-h.top / (h.height * 0.75));
    heroContent.style.transform = 'translateY(' + (hp * 60).toFixed(1) + 'px) scale(' + (1 - hp * 0.08).toFixed(4) + ')';
    heroContent.style.opacity = (1 - hp * 1.1).toFixed(3);

    // Statement: light the text up as it passes through the viewport.
    var s = statement.getBoundingClientRect();
    var start = vh * 0.82;
    var end = vh * 0.38;
    var sp = clamp((start - s.top) / (start - end + s.height));
    var lit = Math.round(sp * words.length);
    for (var i = 0; i < words.length; i++) {
      words[i].classList.toggle('is-on', i < lit);
    }

    // Principles: show one at a time while the stage is pinned.
    var p = principles.getBoundingClientRect();
    var travel = p.height - vh;
    if (travel > 0) {
      var pp = clamp(-p.top / travel);
      var idx = Math.min(principleItems.length - 1, Math.floor(pp * principleItems.length));
      principleItems.forEach(function (el, n) {
        el.classList.toggle('is-active', n === idx);
        el.classList.toggle('is-past', n < idx);
      });
      dots.forEach(function (d, n) { d.classList.toggle('is-active', n === idx); });
    }

    // Product: the visual grows into place.
    var v = productVisual.getBoundingClientRect();
    var vp = clamp((vh - v.top) / (vh * 0.8));
    productVisual.style.transform = 'scale(' + (0.82 + vp * 0.18).toFixed(4) + ')';
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) { return; }
    ticking = true;
    window.requestAnimationFrame(function () { onScroll(); ticking = false; });
  }, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  /* ---------- boot ---------- */
  $('#year').textContent = String(new Date().getFullYear());
  applyLang(lang);
})();
