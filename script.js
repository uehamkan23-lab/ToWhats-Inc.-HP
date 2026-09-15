/* =========================================================
   常奥株式会社 ToWhats Inc. — script.js
   1. Theme (light / dark)
   2. Language (ja / en)
   3. Hero title animation
   4. Scroll reveal
   5. Scroll spy + progress bar + sticky header
   6. Mobile navigation
   ========================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- small helpers ---------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function store(key, value) {
    try {
      if (value === undefined) { return window.localStorage.getItem(key); }
      window.localStorage.setItem(key, value);
    } catch (e) { /* private mode / blocked storage */ }
    return null;
  }

  /* =========================================================
     1. Theme
     ========================================================= */
  var themeToggle = $('#themeToggle');
  var savedTheme = store('towhats-theme');

  if (savedTheme === 'light' || savedTheme === 'dark') {
    root.setAttribute('data-theme', savedTheme);
  }

  function currentTheme() {
    var attr = root.getAttribute('data-theme');
    if (attr) { return attr; }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function syncThemeMeta() {
    var meta = $('meta[name="theme-color"]');
    if (meta) { meta.setAttribute('content', currentTheme() === 'dark' ? '#12131a' : '#faf8f3'); }
  }
  syncThemeMeta();

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store('towhats-theme', next);
      syncThemeMeta();
    });
  }

  /* =========================================================
     2. Language
     Japanese lives in the HTML; English lives in data-en.
     The original Japanese is cached in data-ja on first switch.
     ========================================================= */
  var LANG_TEXT = {
    ja: {
      htmlLang: 'ja',
      title: '常奥株式会社 ToWhats Inc.',
      navLabel: 'メインナビゲーション',
      themeLabel: 'テーマを切り替える',
      langLabel: 'Switch to English',
      burgerOpen: 'メニューを開く',
      burgerClose: 'メニューを閉じる'
    },
    en: {
      htmlLang: 'en',
      title: 'ToWhats Inc. — 常奥株式会社',
      navLabel: 'Main navigation',
      themeLabel: 'Switch colour theme',
      langLabel: '日本語に切り替える',
      burgerOpen: 'Open menu',
      burgerClose: 'Close menu'
    }
  };

  var langToggle = $('#langToggle');
  var translatable = $$('[data-en]');
  var currentLang = store('towhats-lang') === 'en' ? 'en' : 'ja';

  translatable.forEach(function (el) {
    el.setAttribute('data-ja', el.innerHTML);
  });

  function applyLang(lang) {
    var pack = LANG_TEXT[lang];

    translatable.forEach(function (el) {
      var next = lang === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-ja');
      if (next !== null) { el.innerHTML = next; }
    });

    root.setAttribute('lang', pack.htmlLang);
    root.setAttribute('data-lang', lang);
    document.title = pack.title;

    var nav = $('#nav');
    if (nav) { nav.setAttribute('aria-label', pack.navLabel); }
    if (themeToggle) { themeToggle.setAttribute('aria-label', pack.themeLabel); }
    if (langToggle) {
      langToggle.setAttribute('aria-label', pack.langLabel);
      var on = $('.tool__lang-on', langToggle);
      var off = $('.tool__lang-off', langToggle);
      if (on && off) {
        on.textContent = lang === 'en' ? 'EN' : 'JA';
        off.textContent = lang === 'en' ? 'JA' : 'EN';
      }
    }

    var burger = $('#burger');
    if (burger) {
      burger.setAttribute('aria-label', burger.getAttribute('aria-expanded') === 'true' ? pack.burgerClose : pack.burgerOpen);
    }

    currentLang = lang;
    splitHeroTitle();
  }

  if (langToggle) {
    langToggle.addEventListener('click', function () {
      var next = currentLang === 'ja' ? 'en' : 'ja';
      store('towhats-lang', next);
      applyLang(next);
    });
  }

  /* =========================================================
     3. Hero title animation
     Japanese splits per character, English per word, so that
     words never break mid-line.
     ========================================================= */
  var heroTitle = $('#heroTitle');
  var NO_LINE_START = /[。、，．,.\u3001\u3002\uff09\u300d\u300f\u3011\uff1f\uff01?!)\]}\u30fc\u3005\u309d\u309e]/;

  function splitHeroTitle() {
    if (!heroTitle) { return; }

    var raw = currentLang === 'en'
      ? (heroTitle.getAttribute('data-en') || heroTitle.textContent)
      : (heroTitle.getAttribute('data-ja') || heroTitle.textContent);

    var probe = document.createElement('div');
    probe.innerHTML = raw;
    var text = probe.textContent;

    var pieces = currentLang === 'en' ? text.split(/(\s+)/) : text.split('');

    heroTitle.textContent = '';
    var shown = 0;
    var lastSpan = null;

    pieces.forEach(function (piece) {
      if (/^\s+$/.test(piece)) {
        heroTitle.appendChild(document.createTextNode(' '));
        lastSpan = null;
        return;
      }

      // Kinsoku: punctuation and closing brackets must not start a line,
      // so they are merged into the preceding span instead of getting one.
      if (lastSpan && NO_LINE_START.test(piece)) {
        lastSpan.textContent += piece;
        return;
      }

      var span = document.createElement('span');
      span.className = 'char';
      span.textContent = piece;
      span.style.animationDelay = reduceMotion ? '0s' : (0.16 + shown * 0.045).toFixed(3) + 's';
      heroTitle.appendChild(span);
      lastSpan = span;
      shown += 1;
    });
  }

  /* =========================================================
     4. Scroll reveal
     ========================================================= */
  var revealItems = $$('.reveal');

  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    revealItems.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealItems.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* =========================================================
     5. Scroll spy, progress bar, sticky header
     ========================================================= */
  var header = $('#header');
  var progressBar = $('#progressBar');
  var navLinks = $$('.nav__link');
  var sections = navLinks
    .map(function (link) { return document.querySelector(link.getAttribute('href')); })
    .filter(Boolean);

  var ticking = false;

  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop;

    if (header) { header.classList.toggle('is-stuck', y > 8); }

    if (progressBar) {
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = scrollable > 0 ? y / scrollable : 0;
      progressBar.style.width = Math.min(100, Math.max(0, ratio * 100)) + '%';
    }

    var line = y + window.innerHeight * 0.32;
    var activeIndex = -1;
    sections.forEach(function (section, i) {
      if (section.offsetTop <= line) { activeIndex = i; }
    });
    navLinks.forEach(function (link, i) {
      link.classList.toggle('is-active', i === activeIndex);
    });

    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });

  window.addEventListener('resize', onScroll, { passive: true });

  /* =========================================================
     6. Mobile navigation
     ========================================================= */
  var burger = $('#burger');
  var nav = $('#nav');

  function setMenu(open) {
    if (!burger || !nav) { return; }
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', LANG_TEXT[currentLang][open ? 'burgerClose' : 'burgerOpen']);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  if (burger) {
    burger.addEventListener('click', function () {
      setMenu(burger.getAttribute('aria-expanded') !== 'true');
    });
  }

  navLinks.forEach(function (link) {
    link.addEventListener('click', function () { setMenu(false); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { setMenu(false); }
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 860) { setMenu(false); }
  });

  /* =========================================================
     Boot
     ========================================================= */
  var year = $('#year');
  if (year) { year.textContent = String(new Date().getFullYear()); }

  applyLang(currentLang);
  onScroll();
})();
