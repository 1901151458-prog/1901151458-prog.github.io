/* 全站搜索组件：按需加载 JSON 索引，纯前端过滤 */
(function () {
  function norm(s) { return String(s || '').toLowerCase(); }
  function esc(s) { return String(s || ''); }

  window.DshSearch = {
    init: function (opt) {
      var input = document.querySelector(opt.input);
      var box = document.querySelector(opt.results);
      if (!input || !box) return;

      var index = opt.index;
      var limit = opt.limit || 20;
      var items = null;
      var loading = null;
      var timer = 0;
      var lastQuery = '';

      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-expanded', 'false');
      if (box.id) input.setAttribute('aria-controls', box.id);
      box.setAttribute('aria-live', 'polite');
      function setOpen(open) {
        box.hidden = !open;
        input.setAttribute('aria-expanded', open ? 'true' : 'false');
      }

      function load() {
        if (items) return Promise.resolve(items);
        if (loading) return loading;
        loading = fetch(index + (index.indexOf('?') === -1 ? '?v=1' : '&v=1'), { cache: 'force-cache' })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (data) { items = (data && data.items) || []; return items; })
          .catch(function (e) { loading = null; throw e; });
        return loading;
      }

      function itemOf(x) { return Array.isArray(x) ? { t: x[0], u: x[1], s: x[2], k: x[3], site: x[4] } : x; }

      function score(item, terms, raw) {
        var t = norm(item.t);
        var s = norm(item.s);
        var k = norm(item.k);
        var site = norm(item.site);
        var hay = t + ' ' + s + ' ' + k + ' ' + site;
        var sc = 0;
        for (var i = 0; i < terms.length; i++) {
          if (hay.indexOf(terms[i]) === -1) return -1;
          if (t.indexOf(terms[i]) !== -1) sc += 6;
          else if (k.indexOf(terms[i]) !== -1) sc += 3;
          else sc += 1;
        }
        if (t === raw) sc += 20;
        if (t.indexOf(raw) === 0) sc += 10;
        return sc;
      }

      function render(query) {
        setOpen(true);
        box.innerHTML = '';
        var q = query.trim();
        if (!q) { setOpen(false); return; }
        var terms = norm(q).split(/\s+/).filter(Boolean);
        if (!terms.length) { setOpen(false); return; }
        box.innerHTML = '<div class="dsh-empty">正在搜索…</div>';
        load().then(function (all) {
          var seen = {};
          var list = [];
          all.forEach(function (rawItem) {
            var item = itemOf(rawItem);
            var sc = score(item, terms, norm(q));
            if (sc < 0) return;
            var key = item.u + '|' + item.t;
            if (seen[key]) return;
            seen[key] = 1;
            list.push({ item: item, sc: sc });
          });
          list.sort(function (a, b) { return b.sc - a.sc || a.item.t.length - b.item.t.length; });
          list = list.slice(0, limit);
          if (!list.length) {
            box.innerHTML = '<div class="dsh-empty">没有找到相关页面。<br>试试更短的关键词，或只输入一个词。</div>';
            return;
          }
          var frag = document.createDocumentFragment();
          list.forEach(function (row) {
            var it = row.item;
            var a = document.createElement('a');
            a.className = 'dsh-hit';
            a.href = it.u;
            var meta = document.createElement('span');
            meta.className = 'dsh-hit-meta';
            meta.textContent = (it.site ? it.site + ' · ' : '') + (it.k || '');
            var title = document.createElement('b');
            title.textContent = esc(it.t);
            var snip = document.createElement('span');
            snip.className = 'dsh-hit-s';
            snip.textContent = esc(it.s || '');
            a.appendChild(title); a.appendChild(meta); a.appendChild(snip);
            frag.appendChild(a);
          });
          box.innerHTML = '';
          box.appendChild(frag);
        }).catch(function () {
          box.innerHTML = '<div class="dsh-empty">索引加载失败，请稍后再试。</div>';
        });
      }

      function schedule() {
        clearTimeout(timer);
        timer = setTimeout(function () { render(input.value); }, 120);
      }

      input.addEventListener('input', schedule);
      input.addEventListener('focus', function () {
        load().catch(function () {});
        if (input.value.trim()) schedule();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { setOpen(false); input.blur(); }
      });
      var form = input.closest('form');
      if (form) form.addEventListener('submit', function (e) {
        e.preventDefault();
        render(input.value);
      });
      box.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('.dsh-hit') : null;
        if (a && opt.closeOnClick !== false) setOpen(false);
      });
      document.addEventListener('click', function (e) {
        if (!opt.closeOnClick) return;
        if (!input.contains(e.target) && !box.contains(e.target)) setOpen(false);
      });
      if (opt.placeholder) input.setAttribute('placeholder', opt.placeholder);
      if (opt.autofocus) input.focus();
    }
  };
})();
