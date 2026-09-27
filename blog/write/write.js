/* =========================================================
   常奥 ToWhats — blog writer (/blog/write/)

   Members connect with a GitHub fine-grained token that can
   write to this repository. Publishing makes ONE commit that
   contains, for a post called <slug>:
     blog/<slug>/index.html   the finished page (from blog/post-template.html)
     blog/<slug>/post.md      the text, so the post can be edited later
     blog/<slug>/<images>     images added in the editor
     blog/posts.json          the list the blog pages read
   GitHub Pages then publishes it within a minute or two.
   ========================================================= */
(function () {
  'use strict';

  var CFG = window.TOWHATS_BLOG;
  var MD = window.TowhatsMarkdown;
  var MEMBERS = window.TOWHATS_MEMBERS || [];
  var API = 'https://api.github.com';
  var REPO = '/repos/' + CFG.owner + '/' + CFG.repo;
  var SLUG_RE = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$|^[a-z0-9]$/;
  var TOKEN_KEY = 'towhats-gh-token';
  var DRAFT_KEY = 'towhats-blog-draft';

  function $(id) { return document.getElementById(id); }
  var el = {
    token: $('token'), remember: $('remember'), connectBtn: $('connectBtn'), disconnectBtn: $('disconnectBtn'),
    connectStatus: $('connectStatus'), editPanel: $('editPanel'),
    postSelect: $('postSelect'), author: $('author'), date: $('date'), title: $('title'), slug: $('slug'),
    body: $('body'), imageInput: $('imageInput'), images: $('images'), cover: $('cover'),
    preview: $('preview'), previewTitle: $('previewTitle'), editor: $('editor'),
    publishBtn: $('publishBtn'), newBtn: $('newBtn'), deleteBtn: $('deleteBtn'), publishStatus: $('publishStatus')
  };

  var state = {
    token: '',
    login: '',
    posts: [],          // from posts.json
    editing: null,      // slug of the post being edited, or null for a new one
    images: {},         // name -> { url, base64 (new only), isNew }
    deleteArmed: false
  };

  /* ---------------- storage (per device, optional) ---------------- */
  function get(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { if (v == null) { window[store].removeItem(k); } else { window[store].setItem(k, v); } } catch (e) { /* ignore */ } }

  /* ---------------- status lines ---------------- */
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

  function readFile(path, ref) {
    return gh('GET', REPO + '/contents/' + path + '?ref=' + encodeURIComponent(ref || CFG.branch))
      .then(function (f) { return decodeBase64Utf8(f.content); });
  }

  function readPostsJson(ref) {
    return readFile(CFG.dir + '/posts.json', ref)
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
        state.login = user.login;
        set(el.remember.checked ? 'localStorage' : 'sessionStorage', TOKEN_KEY, state.token);
        if (!el.remember.checked) { set('localStorage', TOKEN_KEY, null); }
        status(el.connectStatus, 'ok', MD.escape(user.login) + ' として接続しました。');
        el.disconnectBtn.hidden = false;
        el.editPanel.hidden = false;
        return refreshPostList();
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
    state.token = ''; state.login = '';
    set('localStorage', TOKEN_KEY, null); set('sessionStorage', TOKEN_KEY, null);
    el.token.value = '';
    el.editPanel.hidden = true;
    el.disconnectBtn.hidden = true;
    status(el.connectStatus, '', '');
  }

  function refreshPostList() {
    return readPostsJson().then(function (posts) {
      state.posts = posts;
      var keep = el.postSelect.value;
      el.postSelect.innerHTML = '<option value="">＋ 新しい記事</option>' + posts.map(function (p) {
        return '<option value="' + MD.escape(p.slug) + '">' + MD.escape(p.date + '　' + p.title) + '</option>';
      }).join('');
      el.postSelect.value = keep && posts.some(function (p) { return p.slug === keep; }) ? keep : '';
    });
  }

  /* ---------------- editor ---------------- */
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fillAuthors() {
    el.author.innerHTML = MEMBERS.map(function (m) {
      return '<option value="' + m.key + '">' + MD.escape(m.name + '（' + m.role.ja + '）') + '</option>';
    }).join('');
  }

  function resetEditor(fromDraft) {
    state.editing = null;
    state.images = {};
    state.deleteArmed = false;
    var d = null;
    if (fromDraft) { try { d = JSON.parse(get('localStorage', DRAFT_KEY) || 'null'); } catch (e) { d = null; } }
    el.title.value = d ? d.title : '';
    el.slug.value = d ? d.slug : today() + '-';
    el.author.value = d ? d.author : el.author.value;
    el.date.value = d ? d.date : today();
    el.body.value = d ? d.body : '';
    el.slug.readOnly = false;
    el.deleteBtn.hidden = true;
    el.deleteBtn.textContent = 'この記事を削除';
    el.postSelect.value = '';
    drawImages();
    render();
  }

  function saveDraft() {
    if (state.editing) { return; }   // drafts are for new posts only
    set('localStorage', DRAFT_KEY, JSON.stringify({
      title: el.title.value, slug: el.slug.value, author: el.author.value, date: el.date.value, body: el.body.value
    }));
  }

  function loadPost(slug) {
    var base = CFG.dir + '/' + slug;
    status(el.publishStatus, 'busy', '記事を読み込んでいます…');
    Promise.all([readFile(base + '/post.md'), gh('GET', REPO + '/contents/' + base + '?ref=' + encodeURIComponent(CFG.branch))])
      .then(function (res) {
        var parsed = parseFrontMatter(res[0]);
        state.editing = slug;
        state.images = {};
        res[1].forEach(function (f) {
          if (f.type === 'file' && /\.(webp|jpe?g|png|gif)$/i.test(f.name)) {
            state.images[f.name] = { url: f.download_url, isNew: false };
          }
        });
        el.title.value = parsed.meta.title || '';
        el.slug.value = slug;
        el.slug.readOnly = true;
        el.author.value = parsed.meta.author || el.author.value;
        el.date.value = parsed.meta.date || today();
        el.body.value = parsed.body;
        drawImages(parsed.meta.cover || '');
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
    el.previewTitle.textContent = el.title.value || 'タイトル';
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
              if (!el.cover.value) { drawImages(name); } else { drawImages(); }
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

  /* ---------------- publish / delete ---------------- */
  function memberOf(key) { return MEMBERS.filter(function (m) { return m.key === key; })[0]; }

  function dateLabel(iso) {
    var p = iso.split('-');
    return p[0] + '年' + Number(p[1]) + '月' + Number(p[2]) + '日';
  }

  function fill(template, values) {
    return template.replace(/\{\{([A-Z_]+)\}\}/g, function (_, k) { return values[k] != null ? values[k] : ''; });
  }

  function publish() {
    var title = el.title.value.trim();
    var slug = el.slug.value.trim();
    var body = el.body.value.replace(/\s+$/, '') + '\n';
    var author = memberOf(el.author.value);
    var date = el.date.value;
    var isNew = !state.editing;

    if (!title) { return status(el.publishStatus, 'error', 'タイトルを入力してください。'); }
    if (!SLUG_RE.test(slug)) { return status(el.publishStatus, 'error', 'URL に使う名前は、半角の英小文字・数字・ハイフンで入力してください（先頭と最後は英数字）。'); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { return status(el.publishStatus, 'error', '日付を選んでください。'); }
    if (!body.trim()) { return status(el.publishStatus, 'error', '本文を書いてください。'); }
    if (!author) { return status(el.publishStatus, 'error', '書いた人を選んでください。'); }

    el.publishBtn.disabled = true;
    status(el.publishStatus, 'busy', '公開しています…');

    var cover = el.cover.value;
    var excerpt = MD.plain(body, 90);
    var base = CFG.dir + '/' + slug;

    Promise.all([readFile(CFG.dir + '/post-template.html'), readPostsJson()])
      .then(function (res) {
        var template = res[0], posts = res[1];
        if (isNew && posts.some(function (p) { return p.slug === slug; })) {
          throw new Error('「' + slug + '」という名前の記事がすでにあります。別の名前にしてください。');
        }
        var e = MD.escape;
        var html = fill(template, {
          TITLE: e(title),
          DESCRIPTION: e(excerpt),
          DATE: e(date),
          DATE_LABEL: e(dateLabel(date)),
          AUTHOR_KEY: e(author.key),
          AUTHOR_NAME: e(author.name),
          AUTHOR_ROLE: e(author.role.ja),
          COVER: cover ? '      <figure class="article__cover"><img src="' + e(cover) + '" alt=""></figure>' : '',
          BODY: MD.render(body)
        });
        var entry = { slug: slug, title: title, date: date, author: author.key, excerpt: excerpt, cover: cover };
        var list = posts.filter(function (p) { return p.slug !== slug; }).concat([entry]);
        list.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.slug).localeCompare(String(a.slug)); });

        var files = [
          { path: base + '/index.html', content: html },
          { path: base + '/post.md', content: frontMatter({ title: title, date: date, author: author.key, cover: cover }) + body },
          { path: CFG.dir + '/posts.json', content: JSON.stringify(list, null, 2) + '\n' }
        ];
        Object.keys(state.images).forEach(function (n) {
          var im = state.images[n];
          if (im.isNew) { files.push({ path: base + '/' + n, content: im.base64, encoding: 'base64' }); }
        });
        var verb = isNew ? '公開' : '更新';
        return commit(files, 'ブログ: 「' + title + '」を' + verb + '（' + author.name + '）');
      })
      .then(function () {
        Object.keys(state.images).forEach(function (n) { state.images[n].isNew = false; delete state.images[n].base64; });
        state.editing = slug;
        el.slug.readOnly = true;
        el.deleteBtn.hidden = false;
        set('localStorage', DRAFT_KEY, null);
        status(el.publishStatus, 'ok', '公開しました。1〜2分でサイトに反映されます → <a href="../' + encodeURIComponent(slug) + '/" target="_blank" rel="noopener">記事を開く</a>');
        return refreshPostList().then(function () { el.postSelect.value = slug; });
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

  // Two-step delete: the first click arms the button, the second removes the post.
  function removePost() {
    var slug = state.editing;
    if (!slug) { return; }
    if (!state.deleteArmed) {
      state.deleteArmed = true;
      el.deleteBtn.textContent = '本当に削除する（元に戻せません）';
      setTimeout(function () { state.deleteArmed = false; el.deleteBtn.textContent = 'この記事を削除'; }, 6000);
      return;
    }
    state.deleteArmed = false;
    el.deleteBtn.disabled = true;
    status(el.publishStatus, 'busy', '削除しています…');
    var base = CFG.dir + '/' + slug;
    Promise.all([gh('GET', REPO + '/contents/' + base + '?ref=' + encodeURIComponent(CFG.branch)), readPostsJson()])
      .then(function (res) {
        var files = res[0].filter(function (f) { return f.type === 'file'; }).map(function (f) { return { path: f.path, remove: true }; });
        var list = res[1].filter(function (p) { return p.slug !== slug; });
        files.push({ path: CFG.dir + '/posts.json', content: JSON.stringify(list, null, 2) + '\n' });
        return commit(files, 'ブログ: 「' + slug + '」を削除');
      })
      .then(function () {
        status(el.publishStatus, 'ok', '削除しました。1〜2分でサイトからも消えます。');
        return refreshPostList().then(function () { resetEditor(false); });
      })
      .catch(function (e) { status(el.publishStatus, 'error', '削除できませんでした：' + MD.escape(e.message)); })
      .then(function () { el.deleteBtn.disabled = false; el.deleteBtn.textContent = 'この記事を削除'; });
  }

  /* ---------------- wiring ---------------- */
  fillAuthors();
  resetEditor(true);

  el.connectBtn.addEventListener('click', function () { connect(el.token.value); });
  el.token.addEventListener('keydown', function (e) { if (e.key === 'Enter') { connect(el.token.value); } });
  el.disconnectBtn.addEventListener('click', disconnect);
  el.postSelect.addEventListener('change', function () {
    if (el.postSelect.value) { loadPost(el.postSelect.value); } else { resetEditor(true); }
  });
  el.newBtn.addEventListener('click', function () { resetEditor(false); status(el.publishStatus, '', ''); });
  el.publishBtn.addEventListener('click', publish);
  el.deleteBtn.addEventListener('click', removePost);
  ['input', 'change'].forEach(function (ev) {
    [el.title, el.body, el.slug, el.author, el.date].forEach(function (n) { n.addEventListener(ev, function () { render(); saveDraft(); }); });
  });
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

  // Reconnect automatically with a saved token.
  var saved = get('sessionStorage', TOKEN_KEY) || get('localStorage', TOKEN_KEY);
  if (saved) {
    el.remember.checked = !!get('localStorage', TOKEN_KEY);
    el.token.value = saved;
    connect(saved);
  }
})();
