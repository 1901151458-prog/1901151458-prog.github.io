/* 注册统一 Service Worker（仅 HTTPS / localhost），记录最近访问，并提示新版本 */
(function(){
  try {
    var path = location.pathname + location.search;
    var isRootPage = path === '/' || path === '/index.html';
    var isSiteHome = /^\/(english-materials|sishu|english-vocab-test|cefr-vocab-test|UDHR)\/?$/.test(path);
    if (!isRootPage && !isSiteHome) {
      var key = 'dsh-recent';
      var list = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(list)) list = [];
      list = list.filter(function (x) { return x && x.u !== path; });
      list.unshift({ t: document.title || path, u: path, ts: Date.now() });
      localStorage.setItem(key, JSON.stringify(list.slice(0, 10)));
    }
  } catch (e) {}

  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

  var refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if (refreshing) location.reload();
  });

  function injectStyles(){
    if (document.getElementById('dsh-sw-update-style')) return;
    var style = document.createElement('style');
    style.id = 'dsh-sw-update-style';
    style.textContent = [
      '#dsh-sw-update{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;max-width:calc(100vw - 24px);padding:12px 14px;border-radius:12px;background:#12202c;color:#f2f7fc;border:1px solid #36536a;box-shadow:0 12px 40px rgba(0,0,0,.35);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",sans-serif;box-sizing:border-box}',
      '#dsh-sw-update .dsh-sw-text{font-weight:600;letter-spacing:.01em}',
      '#dsh-sw-update button{appearance:none;border-radius:999px;padding:7px 14px;font:600 13px/1.2 inherit;cursor:pointer;border:1px solid transparent}',
      '#dsh-sw-update .dsh-sw-refresh{background:#d9b978;color:#101820}',
      '#dsh-sw-update .dsh-sw-refresh:hover{background:#e8ca8f}',
      '#dsh-sw-update .dsh-sw-later{background:transparent;color:#c6d4e1;border-color:#3a5368}',
      '#dsh-sw-update .dsh-sw-later:hover{background:rgba(255,255,255,.08);color:#fff}',
      '#dsh-sw-update button:focus-visible{outline:3px solid #d9b978;outline-offset:2px}',
      'html[data-theme="light"] #dsh-sw-update{background:#fff;color:#1d2b38;border-color:#c9d6e2;box-shadow:0 12px 40px rgba(20,40,60,.18)}',
      'html[data-theme="light"] #dsh-sw-update .dsh-sw-later{color:#3c5268;border-color:#c9d6e2}',
      'html[data-theme="light"] #dsh-sw-update .dsh-sw-later:hover{background:#eef4f9;color:#142230}',
      '@media(max-width:520px){#dsh-sw-update{left:12px;right:12px;bottom:12px;transform:none;max-width:none;justify-content:flex-start}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function showUpdate(reg){
    if (!reg || !reg.waiting) return;
    if (!navigator.serviceWorker.controller) return;
    if (document.getElementById('dsh-sw-update')) return;
    injectStyles();

    var box = document.createElement('div');
    box.id = 'dsh-sw-update';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('aria-atomic', 'true');
    box.setAttribute('aria-label', '站点有新版本');

    var text = document.createElement('span');
    text.className = 'dsh-sw-text';
    text.textContent = '站点有新版本';

    var refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'dsh-sw-refresh';
    refresh.textContent = '刷新查看';

    var later = document.createElement('button');
    later.type = 'button';
    later.className = 'dsh-sw-later';
    later.textContent = '稍后';

    refresh.addEventListener('click', function(){
      refreshing = true;
      refresh.disabled = true;
      later.disabled = true;
      refresh.textContent = '刷新中…';
      if (reg.waiting) {
        reg.waiting.postMessage('SKIP_WAITING');
        setTimeout(function(){ if (refreshing) location.reload(); }, 3000);
      } else {
        location.reload();
      }
    });
    later.addEventListener('click', function(){
      box.remove();
    });

    box.appendChild(text);
    box.appendChild(refresh);
    box.appendChild(later);
    (document.body || document.documentElement).appendChild(box);
  }

  function watchWorker(worker, reg){
    if (!worker) return;
    if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg);
    worker.addEventListener('statechange', function(){
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg);
    });
  }

  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/sw.min.js', {scope:'/', updateViaCache:'none'}).then(function(reg){
      /* 注册时可能已经存在 waiting / installing 的更新，先补一次检查 */
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
      if (reg.installing) watchWorker(reg.installing, reg);
      reg.addEventListener('updatefound', function(){
        watchWorker(reg.installing, reg);
      });
      /* 某些浏览器会延迟 updatefound；短轮询兜底，只查 30 秒 */
      var tries = 0;
      var timer = setInterval(function(){
        tries += 1;
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdate(reg);
          clearInterval(timer);
        } else if (tries >= 15) {
          clearInterval(timer);
        }
      }, 2000);
    }).catch(function(){});
  });
})();
