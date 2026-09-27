/* =========================================================
   常奥 ToWhats — news.js
   Draws お知らせ・実績 (news and achievements) from news/news.json.

   <div data-news data-root="" data-limit="5"></div>                 latest items (top page)
   <div data-news data-root="../" data-url-filter></div>             all, with type chips ([data-news-filter])
   <div data-news data-root="../../" data-member="uehara" data-hide-empty></div>
     data-type        optional, "news" or "award" ("?type=" in the URL also works with data-url-filter)
     data-member      optional, only items this member is part of
     data-hide-empty  hide the surrounding <section> when nothing matches

   An item's date can be "2026", "2026-03" or "2026-03-30", for when
   only the year or month is known.
   ========================================================= */
(function () {
  'use strict';

  var MEMBERS = window.TOWHATS_MEMBERS || [];
  var TYPES = {
    news:  { ja: 'お知らせ', en: 'News' },
    award: { ja: '実績', en: 'Achievement' }
  };
  var TEXT = {
    ja: { empty: 'まだありません。', error: '読み込めませんでした。', loading: '読み込んでいます…', all: 'すべて' },
    en: { empty: 'Nothing here yet.', error: 'Could not load the news.', loading: 'Loading…', all: 'All' }
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function lang() { return (window.TOWHATS && window.TOWHATS.lang) || 'ja'; }
  function member(key) { for (var i = 0; i < MEMBERS.length; i++) { if (MEMBERS[i].key === key) { return MEMBERS[i]; } } return null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dateLabel(d) {
    var p = String(d || '').split('-');
    if (!/^\d{4}$/.test(p[0])) { return esc(d); }
    if (lang() === 'en') {
      if (p.length === 1) { return p[0]; }
      if (p.length === 2) { return MONTHS[Number(p[1]) - 1] + ' ' + p[0]; }
      return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0];
    }
    return p[0] + '年' + (p[1] ? Number(p[1]) + '月' : '') + (p[2] ? Number(p[2]) + '日' : '');
  }

  var newsPromise = null;
  function loadNews(root) {
    if (!newsPromise) {
      newsPromise = fetch(root + 'news/news.json?v=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) { throw new Error(r.status); } return r.json(); })
        .then(function (list) {
          return (Array.isArray(list) ? list : []).slice().sort(function (a, b) {
            return String(b.date).localeCompare(String(a.date)) || String(b.updated || '').localeCompare(String(a.updated || ''));
          });
        });
    }
    return newsPromise;
  }

  function row(n, root) {
    var type = TYPES[n.type] ? n.type : 'news';
    var faces = (n.members || []).map(member).filter(Boolean).map(function (m) {
      return '<img src="' + root + 'assets/people/' + m.key + '.webp" alt="" title="' + esc(m.name) + '">';
    }).join('');
    return '<li class="news-item news-item--' + type + '">' +
      '<a href="' + root + 'news/' + encodeURIComponent(n.slug) + '/">' +
        '<time datetime="' + esc(n.date) + '">' + dateLabel(n.date) + '</time>' +
        '<span class="news-pill news-pill--' + type + '">' + TYPES[type][lang()] + '</span>' +
        '<span class="news-item__title">' + esc(n.title) + '</span>' +
        '<span class="news-item__faces">' + faces + '</span>' +
        '<svg class="news-item__go" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>' +
      '</a></li>';
  }

  function draw(box) {
    var root = box.getAttribute('data-root') || '';
    var limit = parseInt(box.getAttribute('data-limit'), 10) || 0;
    var type = box.getAttribute('data-type') || '';
    var only = box.getAttribute('data-member') || '';
    if (box.hasAttribute('data-url-filter')) {
      var q = new URLSearchParams(window.location.search).get('type');
      if (q && TYPES[q]) { type = q; }
    }
    var t = TEXT[lang()];
    if (!box.children.length) { box.innerHTML = '<p class="posts__note">' + t.loading + '</p>'; }

    loadNews(root).then(function (items) {
      var list = items.filter(function (n) {
        return (!type || n.type === type) && (!only || (n.members || []).indexOf(only) >= 0);
      });
      if (limit) { list = list.slice(0, limit); }
      var section = box.hasAttribute('data-hide-empty') ? box.closest('section') : null;
      if (section) { section.hidden = !list.length; }
      box.innerHTML = list.length
        ? '<ul class="news-list">' + list.map(function (n) { return row(n, root); }).join('') + '</ul>'
        : '<p class="posts__note">' + t.empty + '</p>';
      drawFilter(box, type);
    }).catch(function () {
      box.innerHTML = '<p class="posts__note">' + t.error + '</p>';
    });
  }

  function drawFilter(box, active) {
    var bar = document.querySelector('[data-news-filter]');
    if (!bar || !box.hasAttribute('data-url-filter')) { return; }
    bar.innerHTML = '<a href="./"' + (active ? '' : ' aria-current="true"') + '>' + TEXT[lang()].all + '</a>' +
      Object.keys(TYPES).map(function (k) {
        return '<a href="./?type=' + k + '"' + (active === k ? ' aria-current="true"' : '') + '>' + TYPES[k][lang()] + '</a>';
      }).join('');
  }

  function drawAll() { Array.prototype.forEach.call(document.querySelectorAll('[data-news]'), draw); }
  drawAll();
  document.addEventListener('towhats:lang', drawAll);
})();
