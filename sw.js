/* 缘分之轮 · Service Worker
 * 策略：核心静态资源预缓存 + 网络优先（联网拿新版，断网用缓存）
 * 注意：缓存版本 changes 时把 CACHE 名字里的数字 +1，旧缓存会自动清理。
 */
const CACHE = 'yuanfen-v2';
const CORE = [
  './',
  './index.html',
  './css/style.css?v=9',
  './js/app.js?v=9',
  './js/bazi.js?v=4',
  './lib/lunar.js?v=2',
  './assets/bg-gukou.svg',
  './assets/bg-gukou-mobile.svg',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 网络优先：联网时始终拿最新（保证付费码/文案即时生效），失败回退缓存
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
