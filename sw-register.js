/* 注册统一 Service Worker（仅 HTTPS / localhost） */
(function(){
  if(!('serviceWorker' in navigator)) return;
  if(location.protocol!=='https:' && location.hostname!=='localhost' && location.hostname!=='127.0.0.1') return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/sw.min.js', {scope:'/', updateViaCache:'none'}).catch(function(){});
  });
})();
