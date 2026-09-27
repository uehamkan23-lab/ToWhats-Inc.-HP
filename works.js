/* =========================================================
   常奥 ToWhats — works.js
   Draws the ToWhats作品展示会 (exhibition) cards from works/works.json.

   <div data-works data-root="../"></div>                grid
   <div data-works data-root="" data-flow></div>          cards flowing left → right (top page)
   <div data-works data-root="../../" data-member="uehara"></div>   only works this member joined
     data-url-filter  also read ?member= from the URL and draw the filter chips ([data-work-filter])
   ========================================================= */
(function () {
  'use strict';

  var MEMBERS = window.TOWHATS_MEMBERS || [];
  var TEXT = {
    ja: { empty: 'まだ載せているものはありません。', error: '読み込めませんでした。', loading: '読み込んでいます…', all: 'すべて', and: '、', more: 'ほか' },
    en: { empty: 'Nothing here yet.', error: 'Could not load the works.', loading: 'Loading…', all: 'All', and: ', ', more: '+' }
  };
  var STATUS_EN = { '制作中': 'In progress', '開発中': 'In progress', '公開中': 'Live', '完了': 'Done', '準備中': 'Coming soon' };
  var STATUS_CLASS = { '制作中': 'dev', '開発中': 'dev', '公開中': 'live', '完了': 'done', '準備中': 'soon' };

  function lang() { return (window.TOWHATS && window.TOWHATS.lang) || 'ja'; }
  function member(key) { for (var i = 0; i < MEMBERS.length; i++) { if (MEMBERS[i].key === key) { return MEMBERS[i]; } } return null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var worksPromise = null;
  function loadWorks(root) {
    if (!worksPromise) {
      worksPromise = fetch(root + 'works/works.json?v=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) { throw new Error(r.status); } return r.json(); })
        .then(function (list) {
          return (Array.isArray(list) ? list : []).slice().sort(function (a, b) {
            return String(b.updated || '').localeCompare(String(a.updated || '')) || String(a.slug).localeCompare(String(b.slug));
          });
        });
    }
    return worksPromise;
  }

  function card(w, root, hidden) {
    var url = root + 'works/' + encodeURIComponent(w.slug) + '/';
    var colors = ['sun', 'red', 'orange', 'sky'];
    var tint = colors[(w.slug || '').length % colors.length];
    var cover = w.cover
      ? '<img src="' + url + encodeURIComponent(w.cover) + '" alt="" loading="lazy">'
      : '<span class="work-card__nocover" aria-hidden="true">' + esc((w.title || '').slice(0, 1)) + '</span>';
    var status = w.status
      ? '<span class="status-pill status-pill--' + (STATUS_CLASS[w.status] || 'dev') + '">' + esc(lang() === 'en' ? (STATUS_EN[w.status] || w.status) : w.status) + '</span>'
      : '';
    var people = (w.members || []).map(member).filter(Boolean);
    var faces = people.map(function (m) {
      return '<img src="' + root + 'assets/people/' + m.key + '.webp" alt="" title="' + esc(m.name) + '">';
    }).join('');
    var names = people.map(function (m) { return esc(m.name); }).join(TEXT[lang()].and);
    if (w.others) { names += (names ? TEXT[lang()].and : '') + esc(w.others); }
    var tab = hidden ? ' tabindex="-1"' : '';
    return '<li class="work-card work-card--' + tint + '"' + (hidden ? ' aria-hidden="true"' : '') + '>' +
      '<a href="' + url + '"' + tab + '>' +
        '<div class="work-card__cover">' + cover + status + '</div>' +
        '<div class="work-card__body">' +
          '<h3 class="work-card__title">' + esc(w.title) + '</h3>' +
          (w.summary ? '<p class="work-card__summary">' + esc(w.summary) + '</p>' : '') +
          (names ? '<p class="work-card__people"><span class="work-card__faces">' + faces + '</span><span>' + names + '</span></p>' : '') +
        '</div>' +
      '</a></li>';
  }

  function draw(box) {
    var root = box.getAttribute('data-root') || '';
    var only = box.getAttribute('data-member') || '';
    if (box.hasAttribute('data-url-filter')) {
      var q = new URLSearchParams(window.location.search).get('member');
      if (q && member(q)) { only = q; }
    }
    var t = TEXT[lang()];
    if (!box.children.length) { box.innerHTML = '<p class="posts__note">' + t.loading + '</p>'; }

    loadWorks(root).then(function (works) {
      var list = only ? works.filter(function (w) { return (w.members || []).indexOf(only) >= 0; }) : works;
      if (!list.length) { box.innerHTML = '<p class="posts__note">' + t.empty + '</p>'; return; }

      if (box.hasAttribute('data-flow')) {
        // Repeat the set until one copy is wider than the screen, then render it twice:
        // the track slides by exactly one copy, so the loop has no seam.
        var copies = Math.max(1, Math.ceil(8 / list.length));
        var set = [];
        for (var i = 0; i < copies; i++) { set = set.concat(list); }
        var first = set.map(function (w, n) { return card(w, root, n >= list.length); }).join('');
        var second = set.map(function (w) { return card(w, root, true); }).join('');
        box.innerHTML = '<div class="work-flow"><ul class="work-flow__track" style="--count:' + set.length + '">' + first + second + '</ul></div>';
      } else {
        box.innerHTML = '<ul class="work-grid">' + list.map(function (w) { return card(w, root, false); }).join('') + '</ul>';
      }
      drawFilter(box, only);
    }).catch(function () {
      box.innerHTML = '<p class="posts__note">' + t.error + '</p>';
    });
  }

  function drawFilter(box, active) {
    var bar = document.querySelector('[data-work-filter]');
    if (!bar || !box.hasAttribute('data-url-filter')) { return; }
    bar.innerHTML = '<a href="./"' + (active ? '' : ' aria-current="true"') + '>' + TEXT[lang()].all + '</a>' +
      MEMBERS.map(function (m) {
        return '<a href="./?member=' + m.key + '"' + (active === m.key ? ' aria-current="true"' : '') + '>' + esc(m.name) + '</a>';
      }).join('');
  }

  function drawAll() { Array.prototype.forEach.call(document.querySelectorAll('[data-works]'), draw); }
  drawAll();
  document.addEventListener('towhats:lang', drawAll);
})();
