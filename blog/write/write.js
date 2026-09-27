/* =========================================================
   常奥 ToWhats — writer (/blog/write/)
   Writes three kinds of pages:
     ブログ記事       → blog/<slug>/   listed in blog/posts.json
     作品展示会       → works/<slug>/  listed in works/works.json
     お知らせ・実績   → news/<slug>/   listed in news/news.json

   Members connect with a GitHub fine-grained token that can
   write to this repository. Publishing makes ONE commit with:
     <dir>/<slug>/index.html   the finished page (from the kind's template)
     <dir>/<slug>/<source>.md  the text, so it can be edited later
     <dir>/<slug>/<images>     images added in the editor
     <dir>/<list>.json         the list the site reads
     sitemap.xml               the page list for search engines
   GitHub Pages then publishes it within a minute or two.
   ========================================================= */
(function () {
  'use strict';

  var CFG = window.TOWHATS_BLOG;
  var MD = window.TowhatsMarkdown;
  var SITEMAP = window.TowhatsSitemap;
  var MEMBERS = window.TOWHATS_MEMBERS || [];
  var API = 'https://api.github.com';
  var REPO = '/repos/' + CFG.owner + '/' + CFG.repo;
  var SLUG_RE = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]$/;
  var TOKEN_KEY = 'towhats-gh-token';
  var DRAFT_KEY = 'towhats-draft-';

  var KINDS = {
    blog: {
      dir: 'blog', list: 'posts.json', template: 'post-template.html', source: 'post.md',
      noun: '記事', commit: 'ブログ', pick: '書く記事', titleLabel: 'タイトル',
      titleHint: '例：NajoshiteAI の開発をはじめました', slugHint: '例：2026-09-27-start',
      sort: function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.slug).localeCompare(String(a.slug)); },
      label: function (p) { return p.date + '　' + p.title; }
    },
    works: {
      dir: 'works', list: 'works.json', template: 'work-template.html', source: 'work.md',
      noun: '作品', commit: '作品展示会', pick: '書く作品', titleLabel: '名前',
      titleHint: '例：NajoshiteAI', slugHint: '例：najoshiteai',
      sort: function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')) || String(a.slug).localeCompare(String(b.slug)); },
      label: function (p) { return p.title + (p.status ? '（' + p.status + '）' : ''); }
    },
    news: {
      dir: 'news', list: 'news.json', template: 'news-template.html', source: 'news.md',
      noun: 'お知らせ', commit: 'お知らせ・実績', pick: '書くお知らせ・実績', titleLabel: 'タイトル',
      titleHint: '例：〇〇コンテストで△△賞をいただきました', slugHint: '例：2026-10-contest',
      sort: function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.updated || '').localeCompare(String(a.updated || '')); },
      label: function (p) { return p.date + '　［' + (NEWS_TYPES[p.type] || 'お知らせ') + '］' + p.title; }
    }
  };
  var NEWS_TYPES = { news: 'お知らせ', award: '実績' };

  function $(id) { return document.getElementById(id); }
  var el = {
    token: $('token'), remember: $('remember'), connectBtn: $('connectBtn'), disconnectBtn: $('disconnectBtn'),
    connectStatus: $('connectStatus'), editPanel: $('editPanel'),
    postSelect: $('postSelect'), postSelectLabel: $('postSelectLabel'), titleLabel: $('titleLabel'), slugHint: $('slugHint'),
    author: $('author'), date: $('date'), title: $('title'), slug: $('slug'),
    newsType: $('newsType'), precision: $('precision'),
    status: $('status'), period: $('period'), summary: $('summary'), memberChecks: $('memberChecks'), others: $('others'), url: $('url'),
    body: $('body'), imageInput: $('imageInput'), images: $('images'), cover: $('cover'),
    preview: $('preview'), previewTitle: $('previewTitle'), editor: $('editor'),
    publishBtn: $('publishBtn'), newBtn: $('newBtn'), deleteBtn: $('deleteBtn'), publishStatus: $('publishStatus')
  };

  var state = {
    token: '',
    kind: 'blog',
    items: [],          // the current kind's list
    editing: null,      // slug being edited, or null for a new one
    images: {},         // name -> { url, base64 (new only), isNew }
    deleteArmed: false
  };
  function K() { return KINDS[state.kind]; }

  /* ---------------- storage (per device, optional) ---------------- */
  function get(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { if (v == null) { window[store].removeItem(k); } else { window[store].setItem(k, v); } } catch (e) { /* ignore */ } }

  function status(node, kind, html) {
    node.hidden = !html;
    node.className = 'status' + (kind ? ' status--' + kind : '');
    node.innerHTML = html || '';
  }

  /* ---------------- GitHub API ---------------- */
  function gh(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + state.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 204) { return null; }
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error((data && data.message) || ('HTTP ' + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function decodeBase64Utf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
    return new TextDecoder('utf-8').decode(bytes);
  }

  function readFile(path) {
    return gh('GET', REPO + '/contents/' + path + '?ref=' + encodeURIComponent(CFG.branch))
      .then(function (f) { return decodeBase64Utf8(f.content); });
  }

  function readList(kind) {
    var k = KINDS[kind];
    return readFile(k.dir + '/' + k.list)
      .then(function (t) { var j = JSON.parse(t); return Array.isArray(j) ? j : []; })
      .catch(function (e) { if (e.status === 404) { return []; } throw e; });
  }

  /* One commit on top of the branch. files: [{ path, content, encoding } | { path, remove: true }] */
  function commit(files, message) {
    var ref = 'heads/' + CFG.branch;
    var baseSha, baseTree;
    return gh('GET', REPO + '/git/ref/' + ref)
      .then(function (r) { baseSha = r.object.sha; return gh('GET', REPO + '/git/commits/' + baseSha); })
      .then(function (c) {
        baseTree = c.tree.sha;
        return Promise.all(files.map(function (f) {
          if (f.remove) { return Promise.resolve({ path: f.path, mode: '100644', type: 'blob', sha: null }); }
          return gh('POST', REPO + '/git/blobs', { content: f.content, encoding: f.encoding || 'utf-8' })
            .then(function (b) { return { path: f.path, mode: '100644', type: 'blob', sha: b.sha }; });
        }));
      })
      .then(function (tree) { return gh('POST', REPO + '/git/trees', { base_tree: baseTree, tree: tree }); })
      .then(function (t) { return gh('POST', REPO + '/git/commits', { message: message, tree: t.sha, parents: [baseSha] }); })
      .then(function (c) { return gh('PATCH', REPO + '/git/refs/' + ref, { sha: c.sha, force: false }).then(function () { return c; }); });
  }

  /* ---------------- connect ---------------- */
  function connect(token) {
    state.token = token.trim();
    if (!state.token) { status(el.connectStatus, 'error', 'アクセストークンを入力してください。'); return; }
    status(el.connectStatus, 'busy', '確認しています…');
    el.connectBtn.disabled = true;

    Promise.all([gh('GET', '/user'), gh('GET', REPO)])
      .then(function (res) {
        var user = res[0], repo = res[1];
        if (!repo.permissions || !repo.permissions.push) {
          throw new Error('このトークンには ' + CFG.repo + ' への書き込み権限がありません。');
        }
        set(el.remember.checked ? 'localStorage' : 'sessionStorage', TOKEN_KEY, state.token);
        if (!el.remember.checked) { set('localStorage', TOKEN_KEY, null); }
        status(el.connectStatus, 'ok', MD.escape(user.login) + ' として接続しました。');
        el.disconnectBtn.hidden = false;
        el.editPanel.hidden = false;
        return refreshList();
      })
      .catch(function (e) {
        state.token = '';
        var msg = e.status === 401 ? 'トークンが正しくないか、期限が切れています。'
          : e.status === 404 ? 'リポジトリが見つかりません。トークンの対象に ' + CFG.repo + ' が入っているか確認してください。'
          : e.message;
        status(el.connectStatus, 'error', '接続できませんでした：' + MD.escape(msg));
        el.editPanel.hidden = true;
      })
      .then(function () { el.connectBtn.disabled = false; });
  }

  function disconnect() {
    state.token = '';
    set('localStorage', TOKEN_KEY, null); set('sessionStorage', TOKEN_KEY, null);
    el.token.value = '';
    el.editPanel.hidden = true;
    el.disconnectBtn.hidden = true;
    status(el.connectStatus, '', '');
  }

  function refreshList() {
    var kind = state.kind;
    return readList(kind).then(function (items) {
      if (kind !== state.kind) { return; }
      state.items = items;
      var keep = el.postSelect.value;
      el.postSelect.innerHTML = '<option value="">＋ 新しく書く</option>' + items.slice().sort(K().sort).map(function (p) {
        return '<option value="' + MD.escape(p.slug) + '">' + MD.escape(K().label(p)) + '</option>';
      }).join('');
      el.postSelect.value = keep && items.some(function (p) { return p.slug === keep; }) ? keep : '';
    });
  }

  /* ---------------- editor ---------------- */
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fillMembers() {
    el.author.innerHTML = MEMBERS.map(function (m) {
      return '<option value="' + m.key + '">' + MD.escape(m.name + '（' + m.role.ja + '）') + '</option>';
    }).join('');
    el.memberChecks.innerHTML = MEMBERS.map(function (m) {
      return '<label><input type="checkbox" value="' + m.key + '"> ' + MD.escape(m.name) + '</label>';
    }).join('');
  }
  function checkedMembers() {
    return Array.prototype.filter.call(el.memberChecks.querySelectorAll('input'), function (i) { return i.checked; })
      .map(function (i) { return i.value; });
  }
  function setCheckedMembers(keys) {
    Array.prototype.forEach.call(el.memberChecks.querySelectorAll('input'), function (i) { i.checked = keys.indexOf(i.value) >= 0; });
  }

  function applyKindUI() {
    var k = K();
    Array.prototype.forEach.call(document.querySelectorAll('[data-for]'), function (n) {
      n.hidden = n.getAttribute('data-for').split(' ').indexOf(state.kind) < 0;
    });
    el.postSelectLabel.textContent = k.pick;
    el.titleLabel.textContent = k.titleLabel;
    el.title.placeholder = k.titleHint;
    el.slug.placeholder = k.slugHint;
    el.slugHint.innerHTML = '半角の英小文字・数字・ハイフンだけ。URL は <code>/' + k.dir + '/この名前/</code> になります。あとから変えられません。';
    Array.prototype.forEach.call(document.querySelectorAll('input[name="kind"]'), function (r) { r.checked = r.value === state.kind; });
  }

  function switchKind(kind) {
    if (!KINDS[kind] || kind === state.kind) { return; }
    state.kind = kind;
    applyKindUI();
    resetEditor(true);
    status(el.publishStatus, '', '');
    if (state.token) { refreshList(); }
  }

  function resetEditor(fromDraft) {
    state.editing = null;
    state.images = {};
    state.deleteArmed = false;
    var d = null;
    if (fromDraft) { try { d = JSON.parse(get('localStorage', DRAFT_KEY + state.kind) || 'null'); } catch (e) { d = null; } }
    d = d || {};
    el.title.value = d.title || '';
    el.slug.value = d.slug != null ? d.slug : (state.kind === 'blog' ? today() + '-' : '');
    if (d.author) { el.author.value = d.author; }
    el.date.value = d.date || today();
    el.newsType.value = d.newsType || 'news';
    el.precision.value = d.precision || 'day';
    el.status.value = d.status || '';
    el.period.value = d.period || '';
    el.summary.value = d.summary || '';
    el.others.value = d.others || '';
    el.url.value = d.url || '';
    setCheckedMembers(d.members || []);
    el.body.value = d.body || '';
    el.slug.readOnly = false;
    el.deleteBtn.hidden = true;
    el.deleteBtn.textContent = '削除する';
    el.postSelect.value = '';
    drawImages();
    render();
  }

  function saveDraft() {
    if (state.editing) { return; }   // drafts are for new items only
    set('localStorage', DRAFT_KEY + state.kind, JSON.stringify({
      title: el.title.value, slug: el.slug.value, author: el.author.value, date: el.date.value, body: el.body.value,
      newsType: el.newsType.value, precision: el.precision.value,
      status: el.status.value, period: el.period.value, summary: el.summary.value, others: el.others.value,
      url: el.url.value, members: checkedMembers()
    }));
  }

  function loadItem(slug) {
    var k = K();
    var base = k.dir + '/' + slug;
    status(el.publishStatus, 'busy', '読み込んでいます…');
    Promise.all([readFile(base + '/' + k.source), gh('GET', REPO + '/contents/' + base + '?ref=' + encodeURIComponent(CFG.branch))])
      .then(function (res) {
        var parsed = parseFrontMatter(res[0]);
        var meta = parsed.meta;
        state.editing = slug;
        state.images = {};
        res[1].forEach(function (f) {
          if (f.type === 'file' && /\.(webp|jpe?g|png|gif)$/i.test(f.name)) {
            state.images[f.name] = { url: f.download_url, isNew: false };
          }
        });
        el.title.value = meta.title || '';
        el.slug.value = slug;
        el.slug.readOnly = true;
        if (meta.author) { el.author.value = meta.author; }
        var date = String(meta.date || '');
        el.precision.value = date.length === 4 ? 'year' : date.length === 7 ? 'month' : 'day';
        el.date.value = date.length === 4 ? date + '-01-01' : date.length === 7 ? date + '-01' : (date || today());
        el.newsType.value = NEWS_TYPES[meta.type] ? meta.type : 'news';
        el.status.value = meta.status || '';
        el.period.value = meta.period || '';
        el.summary.value = meta.summary || '';
        el.others.value = meta.others || '';
        el.url.value = meta.url || '';
        setCheckedMembers(String(meta.members || '').split(',').filter(Boolean));
        el.body.value = parsed.body;
        drawImages(meta.cover || '');
        el.deleteBtn.hidden = false;
        render();
        status(el.publishStatus, '', '');
      })
      .catch(function (e) { status(el.publishStatus, 'error', '読み込めませんでした：' + MD.escape(e.message)); });
  }

  function parseFrontMatter(text) {
    var m = String(text).replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) { return { meta: {}, body: text }; }
    var meta = {};
    m[1].split('\n').forEach(function (line) {
      var i = line.indexOf(':');
      if (i > 0) {
        var v = line.slice(i + 1).trim();
        try { if (/^".*"$/.test(v)) { v = JSON.parse(v); } } catch (e) { /* keep raw */ }
        meta[line.slice(0, i).trim()] = v;
      }
    });
    return { meta: meta, body: m[2].replace(/^\n/, '') };
  }

  function frontMatter(meta) {
    return '---\n' + Object.keys(meta).map(function (k) { return k + ': ' + JSON.stringify(String(meta[k])); }).join('\n') + '\n---\n\n';
  }

  function imageUrl(name) { return state.images[name] ? state.images[name].url : null; }

  function render() {
    el.previewTitle.textContent = el.title.value || K().titleLabel;
    el.preview.innerHTML = MD.render(el.body.value, { image: imageUrl }) || '<p style="color:var(--muted)">プレビューがここに表示されます。</p>';
  }

  function drawImages(selectedCover) {
    var names = Object.keys(state.images);
    el.images.innerHTML = names.map(function (n) {
      return '<figure><img src="' + MD.escape(state.images[n].url) + '" alt=""><figcaption>' + MD.escape(n) + '</figcaption></figure>';
    }).join('');
    var cur = selectedCover != null ? selectedCover : el.cover.value;
    el.cover.innerHTML = '<option value="">なし</option>' + names.map(function (n) {
      return '<option value="' + MD.escape(n) + '">' + MD.escape(n) + '</option>';
    }).join('');
    el.cover.value = names.indexOf(cur) >= 0 ? cur : '';
  }

  /* Images are shrunk to 1600px and saved as WebP (JPEG where WebP is not supported). */
  function addImages(files) {
    Array.prototype.forEach.call(files, function (file) {
      if (!/^image\//.test(file.type)) { return; }
      var img = new Image();
      var src = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(src);
        c.toBlob(function (blob) {
          var ext = blob && blob.type === 'image/webp' ? 'webp' : 'jpg';
          var finish = function (b) {
            var n = 1;
            while (state.images['img-' + n + '.' + ext]) { n++; }
            var name = 'img-' + n + '.' + ext;
            var reader = new FileReader();
            reader.onload = function () {
              state.images[name] = { url: URL.createObjectURL(b), base64: String(reader.result).split(',')[1], isNew: true };
              insertAtCursor('\n![](' + name + ')\n');
              drawImages(el.cover.value || name);
              render(); saveDraft();
            };
            reader.readAsDataURL(b);
          };
          if (ext === 'webp') { finish(blob); } else { c.toBlob(finish, 'image/jpeg', 0.85); }
        }, 'image/webp', 0.85);
      };
      img.src = src;
    });
  }

  function insertAtCursor(text, wrapBefore, wrapAfter) {
    var t = el.body, s = t.selectionStart, e = t.selectionEnd, v = t.value;
    var sel = v.slice(s, e);
    var ins = wrapBefore != null ? wrapBefore + (sel || text) + wrapAfter : text;
    t.value = v.slice(0, s) + ins + v.slice(e);
    t.focus();
    var pos = s + ins.length;
    t.setSelectionRange(pos, pos);
    render(); saveDraft();
  }

  var TOOLS = {
    h2: function () { insertAtCursor('見出し', '\n## ', '\n'); },
    bold: function () { insertAtCursor('太字', '**', '**'); },
    link: function () { insertAtCursor('リンクの文字', '[', '](https://)'); },
    list: function () { insertAtCursor('\n- 項目\n- 項目\n'); },
    quote: function () { insertAtCursor('引用', '\n> ', '\n'); },
    image: function () { el.imageInput.click(); }
  };

  /* ---------------- building the files ---------------- */
  function memberOf(key) { return MEMBERS.filter(function (m) { return m.key === key; })[0]; }
  // "2026", "2026-03" or "2026-03-30" → 2026年 / 2026年3月 / 2026年3月30日
  function dateLabel(iso) {
    var p = iso.split('-');
    return p[0] + '年' + (p[1] ? Number(p[1]) + '月' : '') + (p[2] ? Number(p[2]) + '日' : '');
  }
  function personChips(keys, root) {
    return keys.map(memberOf).filter(Boolean).map(function (m) {
      return '<a class="person" href="' + root + 'members/' + m.key + '/"><img src="' + root + 'assets/people/' + m.key + '.webp" alt="">' + MD.escape(m.name) + '</a>';
    }).join('');
  }
  function linkRow(url) {
    var e = MD.escape;
    return url ? '        <div><dt data-en="Link">リンク</dt><dd><a href="' + e(url) + '" target="_blank" rel="noopener noreferrer">' + e(url) + '</a></dd></div>' : '';
  }
  function fill(template, values) {
    return template.replace(/\{\{([A-Z_]+)\}\}/g, function (_, k) { return values[k] != null ? values[k] : ''; });
  }
  function coverHtml(cover) {
    return cover ? '      <figure class="article__cover"><img src="' + MD.escape(cover) + '" alt=""></figure>' : '';
  }

  // Reads the form, checks it, and returns what to save; throws a message on bad input.
  function collect() {
    var f = {
      title: el.title.value.trim(),
      slug: el.slug.value.trim(),
      body: el.body.value.replace(/\s+$/, '') + '\n',
      cover: el.cover.value
    };
    if (!f.title) { throw new Error(state.kind === 'works' ? '名前を入力してください。' : 'タイトルを入力してください。'); }
    if (!SLUG_RE.test(f.slug)) { throw new Error('URL に使う名前は、半角の英小文字・数字・ハイフンで入力してください（先頭と最後は英数字）。'); }
    if (state.kind === 'blog') {
      f.author = memberOf(el.author.value);
      f.date = el.date.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) { throw new Error('日付を選んでください。'); }
      if (!f.author) { throw new Error('書いた人を選んでください。'); }
      if (!f.body.trim()) { throw new Error('本文を書いてください。'); }
    } else if (state.kind === 'news') {
      f.type = NEWS_TYPES[el.newsType.value] ? el.newsType.value : 'news';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(el.date.value)) { throw new Error('日付を選んでください。'); }
      f.date = el.date.value.slice(0, { year: 4, month: 7 }[el.precision.value] || 10);
      f.members = checkedMembers();
      f.url = el.url.value.trim();
      if (f.url && !/^https?:\/\/[^\s"'<>]+$/i.test(f.url)) { throw new Error('URL は https:// から始まる形で入力してください。'); }
    } else {
      f.status = el.status.value;
      f.period = el.period.value.trim();
      f.summary = el.summary.value.trim();
      f.members = checkedMembers();
      f.others = el.others.value.trim();
      f.url = el.url.value.trim();
      if (!f.members.length && !f.others) { throw new Error('関わった人を、少なくとも1人選ぶか書いてください。'); }
      if (f.url && !/^https?:\/\/[^\s"'<>]+$/i.test(f.url)) { throw new Error('URL は https:// から始まる形で入力してください。'); }
    }
    return f;
  }

  function buildBlog(f, template, list) {
    var e = MD.escape;
    var excerpt = MD.plain(f.body, 90);
    var html = fill(template, {
      TITLE: e(f.title), DESCRIPTION: e(excerpt), DATE: e(f.date), DATE_LABEL: e(dateLabel(f.date)),
      AUTHOR_KEY: e(f.author.key), AUTHOR_NAME: e(f.author.name), AUTHOR_ROLE: e(f.author.role.ja),
      COVER: coverHtml(f.cover), BODY: MD.render(f.body)
    });
    var entry = { slug: f.slug, title: f.title, date: f.date, author: f.author.key, excerpt: excerpt, cover: f.cover };
    var source = frontMatter({ title: f.title, date: f.date, author: f.author.key, cover: f.cover }) + f.body;
    return { html: html, entry: entry, source: source, who: f.author.name };
  }

  function buildWork(f, template) {
    var e = MD.escape;
    var people = f.members.map(memberOf).filter(Boolean);
    var chips = personChips(f.members, '../../');
    if (f.others) { chips += '<span class="person person--other">' + e(f.others) + '</span>'; }
    var statusClass = { '制作中': 'dev', '開発中': 'dev', '公開中': 'live', '完了': 'done', '準備中': 'soon' }[f.status] || 'dev';
    var body = f.body.trim() ? MD.render(f.body) : '';
    var html = fill(template, {
      TITLE: e(f.title),
      DESCRIPTION: e(f.summary || MD.plain(f.body, 90)),
      SUMMARY: e(f.summary),
      STATUS_HTML: f.status ? '<span class="status-pill status-pill--' + statusClass + '">' + e(f.status) + '</span>' : '',
      MEMBERS_HTML: chips,
      PERIOD_HTML: f.period ? '        <div><dt data-en="When">時期</dt><dd>' + e(f.period) + '</dd></div>' : '',
      LINK_HTML: linkRow(f.url),
      COVER: coverHtml(f.cover),
      BODY: body
    });
    var entry = {
      slug: f.slug, title: f.title, summary: f.summary, status: f.status, period: f.period,
      members: f.members, others: f.others, url: f.url, cover: f.cover, updated: today()
    };
    var source = frontMatter({
      title: f.title, status: f.status, period: f.period, summary: f.summary,
      members: f.members.join(','), others: f.others, url: f.url, cover: f.cover
    }) + f.body;
    var who = people.map(function (m) { return m.name; }).concat(f.others ? [f.others] : []).join('・');
    return { html: html, entry: entry, source: source, who: who };
  }

  function buildNews(f, template) {
    var e = MD.escape;
    var people = f.members.map(memberOf).filter(Boolean);
    var chips = personChips(f.members, '../../');
    var excerpt = MD.plain(f.body, 90);
    var html = fill(template, {
      TITLE: e(f.title),
      DESCRIPTION: e(excerpt || f.title),
      DATE: e(f.date), DATE_LABEL: e(dateLabel(f.date)),
      TYPE: f.type, TYPE_LABEL: e(NEWS_TYPES[f.type]),
      MEMBERS_HTML: chips ? '        <div><dt data-en="Members">関わった人</dt><dd>' + chips + '</dd></div>' : '',
      LINK_HTML: linkRow(f.url),
      COVER: coverHtml(f.cover),
      BODY: f.body.trim() ? MD.render(f.body) : ''
    });
    var entry = { slug: f.slug, title: f.title, date: f.date, type: f.type, members: f.members, url: f.url, excerpt: excerpt, cover: f.cover, updated: today() };
    var source = frontMatter({ title: f.title, date: f.date, type: f.type, members: f.members.join(','), url: f.url, cover: f.cover }) + f.body;
    var who = people.map(function (m) { return m.name; }).join('・') || '常奥';
    return { html: html, entry: entry, source: source, who: who };
  }

  /* All three lists, with `kind` replaced by `list`, for sitemap.xml. */
  function sitemapFile(kind, list) {
    if (!SITEMAP || !CFG.siteUrl) { return Promise.resolve(null); }
    var kinds = Object.keys(KINDS);
    return Promise.all(kinds.map(function (k) { return k === kind ? list : readList(k); })).then(function (res) {
      var lists = {};
      kinds.forEach(function (k, i) { lists[k] = res[i]; });
      return { path: 'sitemap.xml', content: SITEMAP.build(CFG.siteUrl, MEMBERS, lists) };
    });
  }

  /* ---------------- publish / delete ---------------- */
  function publish() {
    var kind = state.kind, k = KINDS[kind], isNew = !state.editing, f;
    try { f = collect(); } catch (err) { return status(el.publishStatus, 'error', MD.escape(err.message)); }

    el.publishBtn.disabled = true;
    status(el.publishStatus, 'busy', '公開しています…');
    var base = k.dir + '/' + f.slug;

    Promise.all([readFile(k.dir + '/' + k.template), readList(kind)])
      .then(function (res) {
        var template = res[0], items = res[1];
        if (isNew && items.some(function (p) { return p.slug === f.slug; })) {
          throw new Error('「' + f.slug + '」という名前の' + k.noun + 'がすでにあります。別の名前にしてください。');
        }
        var built = kind === 'blog' ? buildBlog(f, template) : kind === 'news' ? buildNews(f, template) : buildWork(f, template);
        var list = items.filter(function (p) { return p.slug !== f.slug; }).concat([built.entry]).sort(k.sort);
        return sitemapFile(kind, list).then(function (sitemap) { return { built: built, list: list, sitemap: sitemap }; });
      })
      .then(function (r) {
        var built = r.built;
        var files = [
          { path: base + '/index.html', content: built.html },
          { path: base + '/' + k.source, content: built.source },
          { path: k.dir + '/' + k.list, content: JSON.stringify(r.list, null, 2) + '\n' }
        ];
        if (r.sitemap) { files.push(r.sitemap); }
        Object.keys(state.images).forEach(function (n) {
          var im = state.images[n];
          if (im.isNew) { files.push({ path: base + '/' + n, content: im.base64, encoding: 'base64' }); }
        });
        return commit(files, k.commit + ': 「' + f.title + '」を' + (isNew ? '公開' : '更新') + '（' + built.who + '）');
      })
      .then(function () {
        Object.keys(state.images).forEach(function (n) { state.images[n].isNew = false; delete state.images[n].base64; });
        state.editing = f.slug;
        el.slug.readOnly = true;
        el.deleteBtn.hidden = false;
        set('localStorage', DRAFT_KEY + kind, null);
        status(el.publishStatus, 'ok', '公開しました。1〜2分でサイトに反映されます → <a href="../../' + k.dir + '/' + encodeURIComponent(f.slug) + '/" target="_blank" rel="noopener">ページを開く</a>');
        return refreshList().then(function () { el.postSelect.value = f.slug; });
      })
      .catch(function (e) {
        var msg = e.status === 409 || e.status === 422
          ? 'ほかの人が同時に更新したため、保存できませんでした。もう一度「公開する」を押してください。'
          : e.status === 403 ? '書き込みが拒否されました。トークンの Contents 権限が Read and write になっているか確認してください。'
          : e.message;
        status(el.publishStatus, 'error', '公開できませんでした：' + MD.escape(msg));
      })
      .then(function () { el.publishBtn.disabled = false; });
  }

  // Two-step delete: the first click arms the button, the second removes it.
  function removeItem() {
    var slug = state.editing, kind = state.kind, k = KINDS[kind];
    if (!slug) { return; }
    if (!state.deleteArmed) {
      state.deleteArmed = true;
      el.deleteBtn.textContent = '本当に削除する（元に戻せません）';
      setTimeout(function () { state.deleteArmed = false; el.deleteBtn.textContent = '削除する'; }, 6000);
      return;
    }
    state.deleteArmed = false;
    el.deleteBtn.disabled = true;
    status(el.publishStatus, 'busy', '削除しています…');
    var base = k.dir + '/' + slug;
    Promise.all([gh('GET', REPO + '/contents/' + base + '?ref=' + encodeURIComponent(CFG.branch)), readList(kind)])
      .then(function (res) {
        var files = res[0].filter(function (f) { return f.type === 'file'; }).map(function (f) { return { path: f.path, remove: true }; });
        var list = res[1].filter(function (p) { return p.slug !== slug; });
        files.push({ path: k.dir + '/' + k.list, content: JSON.stringify(list, null, 2) + '\n' });
        return sitemapFile(kind, list).then(function (sitemap) {
          if (sitemap) { files.push(sitemap); }
          return commit(files, k.commit + ': 「' + slug + '」を削除');
        });
      })
      .then(function () {
        status(el.publishStatus, 'ok', '削除しました。1〜2分でサイトからも消えます。');
        return refreshList().then(function () { resetEditor(false); });
      })
      .catch(function (e) { status(el.publishStatus, 'error', '削除できませんでした：' + MD.escape(e.message)); })
      .then(function () { el.deleteBtn.disabled = false; el.deleteBtn.textContent = '削除する'; });
  }

  /* ---------------- wiring ---------------- */
  fillMembers();
  applyKindUI();
  resetEditor(true);

  el.connectBtn.addEventListener('click', function () { connect(el.token.value); });
  el.token.addEventListener('keydown', function (e) { if (e.key === 'Enter') { connect(el.token.value); } });
  el.disconnectBtn.addEventListener('click', disconnect);
  Array.prototype.forEach.call(document.querySelectorAll('input[name="kind"]'), function (r) {
    r.addEventListener('change', function () { if (r.checked) { switchKind(r.value); } });
  });
  el.postSelect.addEventListener('change', function () {
    if (el.postSelect.value) { loadItem(el.postSelect.value); } else { resetEditor(true); }
  });
  el.newBtn.addEventListener('click', function () { resetEditor(false); status(el.publishStatus, '', ''); });
  el.publishBtn.addEventListener('click', publish);
  el.deleteBtn.addEventListener('click', removeItem);
  [el.title, el.body, el.slug, el.author, el.date, el.newsType, el.precision, el.status, el.period, el.summary, el.others, el.url].forEach(function (n) {
    ['input', 'change'].forEach(function (ev) { n.addEventListener(ev, function () { render(); saveDraft(); }); });
  });
  el.memberChecks.addEventListener('change', saveDraft);
  el.slug.addEventListener('input', function () {
    var v = el.slug.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-');
    if (v !== el.slug.value) { el.slug.value = v; }
  });
  document.querySelector('.toolbar').addEventListener('click', function (e) {
    var b = e.target.closest('[data-md]');
    if (b) { TOOLS[b.getAttribute('data-md')](); }
  });
  el.imageInput.addEventListener('change', function () { addImages(el.imageInput.files); el.imageInput.value = ''; });
  Array.prototype.forEach.call(document.querySelectorAll('.tabs [data-view]'), function (b) {
    b.addEventListener('click', function () {
      el.editor.setAttribute('data-view', b.getAttribute('data-view'));
      Array.prototype.forEach.call(document.querySelectorAll('.tabs [data-view]'), function (x) { x.setAttribute('aria-selected', String(x === b)); });
    });
  });

  // ?kind=works / ?kind=news opens the writer on that kind.
  var wanted = new URLSearchParams(window.location.search).get('kind');
  if (wanted && KINDS[wanted]) { switchKind(wanted); }

  // Reconnect automatically with a saved token.
  var saved = get('sessionStorage', TOKEN_KEY) || get('localStorage', TOKEN_KEY);
  if (saved) {
    el.remember.checked = !!get('localStorage', TOKEN_KEY);
    el.token.value = saved;
    connect(saved);
  }
})();
