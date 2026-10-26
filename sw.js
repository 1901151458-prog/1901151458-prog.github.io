/* 学习资料总站 / 五个子站 · 统一缓存与离线兜底 */
const CACHE = 'dsh-sites-v4';
const CORE = [
  '/',
  '/index.html',
  '/offline.html',
  '/english-materials/',
  '/sishu/',
  '/english-vocab-test/',
  '/cefr-vocab-test/',
  '/UDHR/',
  '/UDHR/udhr/',
  '/UDHR/udhr/assets/udhr-app.min.js',
  '/UDHR/udhr/assets/udhr.min.css',
  '/UDHR/udhr/assets/data/1.json',
  '/sishu/assets/search-index.json',
  '/english-materials/assets/search-index.json',
  '/search-index.json',
  '/search-widget.css',
  '/search-widget.js'
];
const MAX_ENTRIES = 140;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res && res.ok) await cache.put(url, res.clone());
      } catch (e) {}
    }));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length > MAX_ENTRIES) {
      const stale = keys.slice(0, keys.length - 90);
      await Promise.all(stale.map((k) => cache.delete(k)));
    }
  } catch (e) {}
}

async function networkFirst(event) {
  const request = event.request;
  const cache = await caches.open(CACHE);
  try {
    const preloaded = event.preloadResponse ? await event.preloadResponse : null;
    const res = preloaded || await fetch(request);
    if (res && res.ok && request.method === 'GET') {
      cache.put(request, res.clone());
      await trim(cache);
    }
    return res;
  } catch (e) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const offline = await cache.match('/offline.html');
    if (offline) return offline;
    return new Response('网络暂不可用，请稍后重试。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then((res) => {
    if (res && res.ok && request.method === 'GET') {
      cache.put(request, res.clone());
      return trim(cache).then(() => res);
    }
    return res;
  }).catch(() => null);
  return cached || (await network) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event));
    return;
  }
  if (/\.(?:css|js|mjs|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|pdf|json)(?:\?|$)/i.test(url.pathname + url.search)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
