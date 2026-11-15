// Service worker: guarda la app (y el diccionario) para usarla sin conexión.
// Red primero con límite de tiempo; si no hay red o tarda, usa la copia guardada.
const CACHE_VERSION = 'vaivai-v9';
const NETWORK_TIMEOUT = 3000;
const APP_SHELL = [
  './', './index.html', './styles.css', './app.js', './conj.js', './dict.js', './verbs.js',
  './manifest.json', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromCache(request) {
  return caches.match(request, { ignoreSearch: true }).then((cached) => {
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('./index.html');
    return Response.error();
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Las traducciones online (Google) no pasan por aquí
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  let saving = null;
  const network = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      saving = caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
    }
    return response;
  });
  event.waitUntil(network.then(() => saving).catch(() => {}));
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT));
  event.respondWith(Promise.race([network, timeout]).catch(() => fromCache(request)));
});
