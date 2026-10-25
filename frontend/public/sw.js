// Keeps the app shell on the device so the Home Screen app opens without a
// connection. Data already lives in Dexie and syncs on its own; this only
// covers the code. API calls, Firebase and anything else pass straight through.
const CACHE = 'reafresh-shell';

const isShellFile = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith('/assets/') || /^\/[\w-]+\.png$/.test(url.pathname));

const isHtml = (response) => (response.headers.get('content-type') ?? '').includes('text/html');

// Stores index.html with the bundles it names, and drops bundles from older
// deploys so the cache holds one build.
async function storeShell(response) {
  const html = await response.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  const cache = await caches.open(CACHE);
  await cache.put('/index.html', response);
  const missing = [];
  for (const path of assets) if (!(await cache.match(path))) missing.push(path);
  await cache.addAll(missing);
  const current = new Set(assets.map((path) => new URL(path, self.location.origin).pathname));
  for (const request of await cache.keys()) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/assets/') && !current.has(pathname)) await cache.delete(request);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch('/index.html', { cache: 'no-cache' }).then((response) => {
      if (response.ok && isHtml(response)) return storeShell(response);
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Pages: network first so a deploy lands on the next online launch; offline,
  // every route gets the cached index.html and the router takes it from there.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200 && isHtml(response)) event.waitUntil(storeShell(response.clone()));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Hashed bundles never change under one name, so a cached copy is always
  // right. A missing asset comes back as the index.html rewrite, never cached.
  const url = new URL(request.url);
  if (!isShellFile(url)) return;
  if (!url.pathname.startsWith('/assets/')) {
    // Root icons keep their names across deploys, so a cached copy may be
    // stale: answer from it at once and refresh it in the background.
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const refresh = fetch(request).then((response) => {
            if (response.status === 200 && !isHtml(response)) {
              const copy = response.clone();
              event.waitUntil(cache.put(request, copy));
            }
            return response;
          });
          if (!cached) return refresh;
          event.waitUntil(refresh.catch(() => {}));
          return cached;
        }),
      ),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.status === 200 && !isHtml(response)) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        }),
    ),
  );
});
