/* 注册统一 Service Worker（仅 HTTPS / localhost），并记录最近访问 */
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
  if(!('serviceWorker' in navigator)) return;
  if(location.protocol!=='https:' && location.hostname!=='localhost' && location.hostname!=='127.0.0.1') return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/sw.min.js', {scope:'/', updateViaCache:'none'}).catch(function(){});
  });
})();
