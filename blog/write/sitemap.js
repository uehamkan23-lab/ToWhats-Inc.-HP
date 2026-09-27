/* =========================================================
   Builds sitemap.xml (the page list for search engines).
   The writer calls this on every publish and delete, so new
   posts, works and news are listed without anyone editing it.

   TowhatsSitemap.build(siteUrl, members, { blog: [...], works: [...], news: [...] })
   ========================================================= */
(function () {
  'use strict';

  // Fixed pages, as paths from the site root.
  var PAGES = ['', 'about/', 'works/', 'members/', 'blog/', 'news/'];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    });
  }

  // W3C dates only: 2026, 2026-03 or 2026-03-30.
  function lastmod(d) { return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(d || '')) ? String(d) : ''; }

  function build(siteUrl, members, lists) {
    var base = String(siteUrl || '').replace(/\/*$/, '/');
    var urls = PAGES.map(function (p) { return { path: p }; });
    (members || []).forEach(function (m) { urls.push({ path: 'members/' + m.key + '/' }); });
    function add(dir, items, dateKey) {
      (items || []).forEach(function (it) {
        if (it && it.slug) { urls.push({ path: dir + '/' + encodeURIComponent(it.slug) + '/', lastmod: lastmod(it[dateKey]) }); }
      });
    }
    lists = lists || {};
    add('blog', lists.blog, 'date');
    add('works', lists.works, 'updated');
    add('news', lists.news, 'updated');

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(function (u) {
        return '  <url><loc>' + esc(base + u.path) + '</loc>' + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') + '</url>';
      }).join('\n') +
      '\n</urlset>\n';
  }

  window.TowhatsSitemap = { build: build };
})();
