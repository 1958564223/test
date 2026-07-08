// Service Worker file (sw.js)
// Whitelist cache strategy: cache only known static assets; API requests pass through.
// 2026-07-08 v0.1.2: + 外卖点单 (麦当劳 MCP + 瑞幸 MCP) 7 个新文件。卸载：删下面 7 行 + CACHE_VERSION 改回 v0.1.1。

const CACHE_VERSION = 'v0.1.2';
const CACHE_NAME = `ephone-cache-${CACHE_VERSION}`;

const URLS_TO_CACHE = [
  './index.html',
  './style.css',
  './online-app.css',
  './script.js',
  './modules/hot-news.js',
  './modules/runtime-diagnostics.js',
  './js/netease-music.js',
  // v0.1.2 新增：外卖点单
  './css/mcp-settings-skyblue.css',
  './css/mcp-card.css',
  './css/mcp-miniapp-pink.css',
  './js/mcp-mcd-client.js',
  './js/mcp-luckin-client.js',
  './js/mcp-tool-bridge.js',
  './js/mcp-ui-init.js',
  'https://unpkg.com/dexie/dist/dexie.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://phoebeboo.github.io/mewoooo/pp.js',
  'https://cdn.jsdelivr.net/npm/streamsaver@2.0.6/StreamSaver.min.js',
  'https://i.postimg.cc/nMbyyt1t/D7CD735A73F5FD1D7B8407E0EB8BBAC0.png'
];

self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache opened, caching core files...');
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] Core files cached.');
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service worker activated.');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  const isLocalAsset = url.startsWith(self.location.origin) &&
    (url.includes('/index.html') ||
     url.includes('/style.css') ||
     url.includes('/online-app.css') ||
     url.includes('/script.js') ||
     url.includes('/modules/hot-news.js') ||
     url.includes('/modules/runtime-diagnostics.js') ||
     // v0.1.2 新增：外卖点单文件命中拦截，走缓存（请求带回 ?v= 时也走 fetch）
     url.includes('/css/mcp-settings-skyblue.css') ||
     url.includes('/css/mcp-card.css') ||
     url.includes('/css/mcp-miniapp-pink.css') ||
     url.includes('/js/mcp-mcd-client.js') ||
     url.includes('/js/mcp-luckin-client.js') ||
     url.includes('/js/mcp-tool-bridge.js') ||
     url.includes('/js/mcp-ui-init.js'));

  const isKnownCDN =
    url.includes('unpkg.com/dexie') ||
    url.includes('cdnjs.cloudflare.com/ajax/libs/html2canvas') ||
    url.includes('cdn.jsdelivr.net/npm/streamsaver') ||
    url.includes('phoebeboo.github.io/mewoooo/pp.js') ||
    url.includes('i.postimg.cc/');

  if (isLocalAsset || isKnownCDN) {
    const isVersioned = url.includes('?v=');
    if (isVersioned) {
      event.respondWith(
        fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            const noQueryUrl = url.split('?')[0];
            caches.open(CACHE_NAME).then(cache => cache.put(noQueryUrl, clone));
          }
          return response;
        }).catch(() => caches.match(url.split('?')[0]))
      );
      return;
    }

    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        }).catch(() => null);

        return cachedResponse || fetchPromise;
      })
    );
  }
});

self.addEventListener('push', event => {
  console.log('[SW] Push received:', event);

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'EPhone';
  const options = {
    body: data.body || 'You have a new message',
    icon: data.icon || 'https://i.postimg.cc/nMbyyt1t/D7CD735A73F5FD1D7B8407E0EB8BBAC0.png',
    badge: data.badge || 'https://i.postimg.cc/nMbyyt1t/D7CD735A73F5FD1D7B8407E0EB8BBAC0.png',
    tag: data.tag || 'default',
    data: data.data || {},
    requireInteraction: true,
    vibrate: [200, 100, 200],
    timestamp: Date.now()
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);

  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
});

self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event);

  event.notification.close();

  const chatId = event.notification.data?.chatId;
  const urlToOpen = chatId ? `/?openChat=${chatId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (let client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(client => {
              if (chatId) {
                client.postMessage({ type: 'OPEN_CHAT', chatId });
              }
              return client;
            });
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
