/* =============================================
   Service Worker — Suivi Compétences PWA  (v2, septembre 2026)

   CORRECTIFS v2 :
   ✓ Les requêtes Supabase ne passent PLUS par le service worker.
     L'ancienne version transformait toute coupure réseau en une fausse
     réponse "200 OK" {error:'offline'} : l'application croyait l'envoi
     réussi (indicateur vert, saisie jamais arrivée en ligne) et le SDK
     d'authentification, recevant une réponse sans jeton, déconnectait le
     prof (retour en mode élève).
   ✓ Aucune requête autre que GET n'est interceptée.
   ✓ Fichiers de l'application en "réseau d'abord" (délai 4 s, puis cache) :
     une correction déployée arrive dès le chargement suivant.
============================================= */

const CACHE_NAME = 'suivicomp-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/db.js',
  '/config.js',
  '/prog_codes.js',
  '/prog_data.js',
  '/specialites.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap',
];
const NETWORK_TIMEOUT_MS = 4000;

// Installation : mise en cache des fichiers statiques
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

// Activation : supprimer les anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function networkFirst(request) {
  return new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match(request).then(c =>
      c || (request.mode === 'navigate' ? caches.match('/index.html') : undefined));
    const timer = setTimeout(() => {
      fromCache().then(c => { if (!done && c) { done = true; resolve(c); } });
    }, NETWORK_TIMEOUT_MS);
    fetch(request, { cache: 'no-cache' }).then(resp => {
      if (resp && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
      }
      clearTimeout(timer);
      if (!done) { done = true; resolve(resp); }
    }).catch(() => {
      clearTimeout(timer);
      fromCache().then(c => {
        if (!done) { done = true; resolve(c || new Response('Hors ligne', { status: 503 })); }
      });
    });
  });
}

function cacheFirst(request) {
  return caches.match(request).then(cached => {
    const net = fetch(request).then(resp => {
      if (resp && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
      }
      return resp;
    });
    if (cached) { net.catch(() => {}); return cached; }
    return net;
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;             // POST/PATCH... : directement au réseau
  const url = new URL(req.url);
  if (url.hostname.includes('supabase.co')) return; // API + Realtime : jamais interceptés
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  } else {
    // CDN (supabase-js) et Google Fonts : cache d'abord
    event.respondWith(cacheFirst(req));
  }
});

// Message de l'app : forcer la mise à jour du cache
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
