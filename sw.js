/* Service worker Lumimondo Adventure — Phaser edition.
 *
 * Lezione da Junior (RIFACIMENTO_PHASER "AGGIORNAMENTI E CACHE"): in SVILUPPO
 * la cache stantia faceva vedere versioni vecchie. Quindi:
 *  - STRATEGIA NETWORK-FIRST per gli asset di pari origine: si serve sempre la
 *    rete quando disponibile, la cache è solo fallback offline.
 *  - /api/ mai cachato (sempre rete, fallback JSON offline).
 *  - Al deploy finale si potrà passare a cache-first aggressiva (MODALITA = 'prod').
 *
 * Bump CACHE_VERSION a ogni release (allineato a version.js → GAME_VERSION). */

const CACHE_VERSION = 'lumimondo-adv-phaser-P1.22.8';
// 'dev' = network-first (anti-cache-stantia durante lo sviluppo/test di Pietro).
// Dopo il test di Pietro e l'OK finale, passare a 'prod' (cache-first aggressiva).
const MODALITA = 'dev';

// #92 — SHELL MINIMA in precache: solo il guscio dell'app (HTML/JS/manifest/icone).
// Sfondi, Lumini, personaggi e audio NON sono precacheati all'install (erano ~25MB
// in un colpo): vanno in cache a RUNTIME on-demand con stale-while-revalidate (#93).
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './testi.json',
  './vendor/phaser.min.js',
  './js/game/main.js',
  './js/game/scenes/StarterScene.js',
  './js/game/scenes/ProfiloScene.js',
  './js/profili.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

// #93 — media pesanti (immagini/audio): stale-while-revalidate (cache subito,
// aggiorna in sottofondo) → niente più ri-download di ~25MB a ogni avvio in dev.
function isMedia(url) {
  return /\.(png|jpg|jpeg|webp|gif|mp3|ogg|wav)$/i.test(url.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // API: sempre rete, mai cache.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  // #93 — Media (immagini/audio): cache-first (media statico, versionato dal SW via
  // CACHE_VERSION). Se in cache, servo e basta (niente ri-download). Altrimenti servo la
  // rete e popolo la cache con una copia COMPLETA (200): la Cache API RIFIUTA le 206, e
  // su iOS gli MP3 arrivano sempre come 206 (range) → senza la copia full non venivano
  // MAI cachati (niente offline + ri-download a ogni riproduzione).
  if (sameOrigin && isMedia(url)) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((c) => c.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res && res.status === 200) {
            c.put(request, res.clone());   // immagini e MP3 serviti interi
          } else if (res && res.status === 206) {
            // 206 (range, tipico MP3 su iOS): non cachabile → prendo una copia COMPLETA
            // a parte (richiesta senza header Range) e cacho quella.
            fetch(url.href, { credentials: 'same-origin' })
              .then((full) => { if (full && full.status === 200) c.put(request, full.clone()); })
              .catch(() => { /* offline: si riprova alla prossima */ });
          }
          return res;
        }).catch(() => cached);
      }))
    );
    return;
  }

  if (MODALITA === 'dev' && sameOrigin) {
    // Network-first: rete → aggiorna cache; offline → cache.
    event.respondWith(
      fetch(request).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first (prod o cross-origin) con popolamento runtime.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      if (res && res.status === 200 && sameOrigin) {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
      }
      return res;
    }).catch(() => cached))
  );
});
