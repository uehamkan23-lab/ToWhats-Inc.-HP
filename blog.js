/* =========================================================
   常奥 ToWhats — blog.js
   Draws post lists from blog/posts.json. Used on the top page
   (latest posts), /blog/ (all posts, filter by author) and each
   member page (that member's posts).

   <div data-posts data-root="../" data-limit="3" data-author="uehara"></div>
     data-root   path from this page to the site root ("" / "../" / "../../")
     data-limit  optional, number of posts to show
     data-author optional, only this member's posts ("?author=" in the URL also works)
   ========================================================= */
(function () {
  'use strict';

  var MEMBERS = window.TOWHATS_MEMBERS || [];
  var TEXT = {
    ja: { empty: 'まだ記事はありません。', error: '記事を読み込めませんでした。', loading: '記事を読み込んでいます…', all: 'すべて' },
    en: { empty: 'No posts yet.', error: 'Could not load the posts.', loading: 'Loading posts…', all: 'All' }
  };

  function lang() { return (window.TOWHATS && window.TOWHATS.lang) || 'ja'; }
  function member(key) {
    for (var i = 0; i < MEMBERS.length; i++) { if (MEMBERS[i].key === key) { return MEMBERS[i]; } }
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dateLabel(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) { return esc(iso); }
    return lang() === 'en' ? p[0] + '.' + p[1] + '.' + p[2] : p[0] + '年' + Number(p[1]) + '月' + Number(p[2]) + '日';
  }

  // One fetch per page, shared by every list on it.
  var postsPromise = null;
  function loadPosts(root) {
    if (!postsPromise) {
      postsPromise = fetch(root + 'blog/posts.json?v=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) { throw new Error(r.status); } return r.json(); })
        .then(function (list) {
          return (Array.isArray(list) ? list : []).slice().sort(function (a, b) {
            return String(b.date).localeCompare(String(a.date)) || String(b.slug).localeCompare(String(a.slug));
          });
        });
    }
    return postsPromise;
  }

  function card(post, root) {
    var m = member(post.author);
    var url = root + 'blog/' + encodeURIComponent(post.slug) + '/';
    var cover = post.cover
      ? '<img src="' + url + encodeURIComponent(post.cover) + '" alt="" loading="lazy">'
      : '<span class="post-card__nocover" aria-hidden="true">' + esc((post.title || '').slice(0, 1)) + '</span>';
    var author = m
      ? '<span class="post-card__author"><img src="' + root + 'assets/people/' + m.key + '.webp" alt="">' + esc(m.name) + '</span>'
      : '';
    return '<li class="post-card post-card--' + esc(m ? m.color : 'sun') + '">' +
      '<a href="' + url + '">' +
        '<div class="post-card__cover">' + cover + '</div>' +
        '<div class="post-card__body">' +
          '<p class="post-card__meta"><time datetime="' + esc(post.date) + '">' + dateLabel(post.date) + '</time>' + author + '</p>' +
          '<h3 class="post-card__title">' + esc(post.title) + '</h3>' +
          (post.excerpt ? '<p class="post-card__excerpt">' + esc(post.excerpt) + '</p>' : '') +
        '</div>' +
      '</a></li>';
  }

  function draw(box) {
    var root = box.getAttribute('data-root') || '';
    var limit = parseInt(box.getAttribute('data-limit'), 10) || 0;
    var author = box.getAttribute('data-author') || '';
    if (box.hasAttribute('data-url-filter')) {
      var q = new URLSearchParams(window.location.search).get('author');
      if (q && member(q)) { author = q; }
    }
    var t = TEXT[lang()];
    box.setAttribute('aria-busy', 'true');
    if (!box.children.length) { box.innerHTML = '<p class="posts__note">' + t.loading + '</p>'; }

    loadPosts(root).then(function (posts) {
      var list = author ? posts.filter(function (p) { return p.author === author; }) : posts;
      if (limit) { list = list.slice(0, limit); }
      box.innerHTML = list.length
        ? '<ul class="post-grid">' + list.map(function (p) { return card(p, root); }).join('') + '</ul>'
        : '<p class="posts__note">' + t.empty + '</p>';
      drawFilter(box, author);
    }).catch(function () {
      box.innerHTML = '<p class="posts__note">' + t.error + '</p>';
    }).then(function () { box.removeAttribute('aria-busy'); });
  }

  // Author chips above the list on /blog/ (links, so each filter has its own URL).
  function drawFilter(box, active) {
    var bar = document.querySelector('[data-post-filter]');
    if (!bar || !box.hasAttribute('data-url-filter')) { return; }
    var t = TEXT[lang()];
    bar.innerHTML = '<a href="./"' + (active ? '' : ' aria-current="true"') + '>' + t.all + '</a>' +
      MEMBERS.map(function (m) {
        return '<a href="./?author=' + m.key + '"' + (active === m.key ? ' aria-current="true"' : '') + '>' + esc(m.name) + '</a>';
      }).join('');
  }

  function drawAll() { Array.prototype.forEach.call(document.querySelectorAll('[data-posts]'), draw); }

  drawAll();
  document.addEventListener('towhats:lang', drawAll);
})();
