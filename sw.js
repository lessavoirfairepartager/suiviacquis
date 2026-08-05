/* =============================================
   Service Worker — Suivi Compétences PWA
   Cache les fichiers pour un fonctionnement hors ligne
============================================= */

const CACHE_NAME = 'suivicomp-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/db.js',
  '/config.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap',
];

// Installation : mise en cache des fichiers statiques
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // On cache ce qu'on peut, on ignore les erreurs (ex: Supabase CDN)
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activation : supprimer les anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch : cache-first pour les assets, network-first pour les données
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase API : toujours réseau (données en temps réel)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Si hors ligne, on laisse l'app gérer avec localStorage
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Fonts Google : cache-first
  if (url.hostname.includes('fonts.')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
      )
    );
    return;
  }

  // Assets locaux : cache-first, avec fallback réseau
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // En arrière-plan, vérifier si une version plus récente existe
        fetch(event.request).then(resp => {
          if (resp && resp.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, resp));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return resp;
      });
    })
  );
});

// Message de l'app : forcer la mise à jour du cache
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
