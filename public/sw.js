// ─── SERVICE WORKER — Mi Edificio PWA ────────────────────────────────────────
const CACHE_NAME = 'mi-edificio-v1';

// Archivos estáticos a cachear para funcionamiento offline
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// ── Instalación: cachea assets estáticos ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activación: limpia caches viejos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: estrategia Network First con fallback a caché ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Supabase y APIs externas: solo network, nunca cachear
  if (url.hostname.includes('supabase.co') || url.hostname.includes('anthropic')) {
    return; // dejar pasar sin interceptar
  }

  // Para navegación (HTML): Network first, fallback a index.html en caché
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Actualizar caché con respuesta fresca
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Para assets JS/CSS/imágenes: Cache first, luego network
  if (request.destination === 'script' || request.destination === 'style' ||
      request.destination === 'image' || request.destination === 'font') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }
});

// ── Mensaje desde la app para forzar actualización ──
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
