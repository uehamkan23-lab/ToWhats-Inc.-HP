/* =========================================================
   A small, safe Markdown renderer for the blog.
   Everything is HTML-escaped first; only the syntax below
   turns into tags. Links may only point to http(s), mailto,
   in-page anchors or relative paths.

   ## 見出し   ### 小見出し   **太字**   *斜体*   ~~打ち消し~~
   `コード`   ```コードブロック```   > 引用   - 箇条書き   1. 番号付き
   [リンク](https://…)   ![説明](画像ファイル名)   ---（区切り線）
   ========================================================= */
(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // `url` arrives already escaped. Returns '' for anything unsafe.
  function safeUrl(url) {
    var u = url.trim();
    if (/^(https?:\/\/|mailto:|#)/i.test(u)) { return u; }
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) { return ''; }      // javascript:, data:, …
    return u.replace(/^\/+/, '');                            // relative only
  }

  function inline(text, opt) {
    var codes = [];
    var s = esc(text).replace(/`([^`]+)`/g, function (_, c) {
      codes.push('<code>' + c + '</code>');
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (_, alt, src) {
      var u = safeUrl(src);
      if (!u) { return ''; }
      if (opt.image && !/^(https?:)?\/\//i.test(u)) { u = opt.image(u) || u; }
      return '<img src="' + u + '" alt="' + alt + '" loading="lazy">';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
      var u = safeUrl(href);
      if (!u) { return label; }
      var ext = /^https?:/i.test(u) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return '<a href="' + u + '"' + ext + '>' + label + '</a>';
    });
    // bare URLs that are not already inside a tag attribute or link text
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, function (_, pre, u) {
      return pre + '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
         .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
         .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return codes[+i]; });
  }

  function render(src, opt) {
    opt = opt || {};
    var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var para = [];
    var i = 0;

    function flush() {
      if (para.length) { out.push('<p>' + para.map(function (l) { return inline(l, opt); }).join('<br>') + '</p>'); para = []; }
    }

    while (i < lines.length) {
      var line = lines[i];
      var m;

      if (/^```/.test(line)) {                                  // fenced code
        flush();
        var code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
        out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
        i++; continue;
      }
      if (!line.trim()) { flush(); i++; continue; }
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {              // # and ## → h2, ### → h3
        flush();
        var level = m[1].length === 3 ? 3 : 2;
        out.push('<h' + level + '>' + inline(m[2], opt) + '</h' + level + '>');
        i++; continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(line)) {                                 // blockquote
        flush();
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
        out.push('<blockquote>' + q.map(function (l) { return inline(l, opt); }).join('<br>') + '</blockquote>');
        continue;
      }
      if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {   // lists
        flush();
        var ordered = /^\s*\d/.test(line);
        var re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
        var items = [];
        while (i < lines.length && re.test(lines[i])) { items.push(lines[i].replace(re, '')); i++; }
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + items.map(function (t) { return '<li>' + inline(t, opt) + '</li>'; }).join('') + '</' + tag + '>');
        continue;
      }
      para.push(line);
      i++;
    }
    flush();
    return out.join('\n');
  }

  // Plain text for the list excerpt / meta description.
  function plain(src, max) {
    var t = String(src || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^[#>\-*\d.)\s]+/gm, '')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return t.length > max ? t.slice(0, max) + '…' : t;
  }

  window.TowhatsMarkdown = { render: render, plain: plain, escape: esc };
})();
