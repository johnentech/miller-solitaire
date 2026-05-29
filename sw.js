const CACHE = 'miller-solitaire-v18';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './ui.js',
  './manifest.json',
  './assets/board2.png',
  './assets/Card_Back.png',
  // 52 card face images
  './assets/cards/spades_A.png',
  './assets/cards/spades_2.png',
  './assets/cards/spades_3.png',
  './assets/cards/spades_4.png',
  './assets/cards/spades_5.png',
  './assets/cards/spades_6.png',
  './assets/cards/spades_7.png',
  './assets/cards/spades_8.png',
  './assets/cards/spades_9.png',
  './assets/cards/spades_10.png',
  './assets/cards/spades_J.png',
  './assets/cards/spades_Q.png',
  './assets/cards/spades_K.png',
  './assets/cards/hearts_A.png',
  './assets/cards/hearts_2.png',
  './assets/cards/hearts_3.png',
  './assets/cards/hearts_4.png',
  './assets/cards/hearts_5.png',
  './assets/cards/hearts_6.png',
  './assets/cards/hearts_7.png',
  './assets/cards/hearts_8.png',
  './assets/cards/hearts_9.png',
  './assets/cards/hearts_10.png',
  './assets/cards/hearts_J.png',
  './assets/cards/hearts_Q.png',
  './assets/cards/hearts_K.png',
  './assets/cards/diamonds_A.png',
  './assets/cards/diamonds_2.png',
  './assets/cards/diamonds_3.png',
  './assets/cards/diamonds_4.png',
  './assets/cards/diamonds_5.png',
  './assets/cards/diamonds_6.png',
  './assets/cards/diamonds_7.png',
  './assets/cards/diamonds_8.png',
  './assets/cards/diamonds_9.png',
  './assets/cards/diamonds_10.png',
  './assets/cards/diamonds_J.png',
  './assets/cards/diamonds_Q.png',
  './assets/cards/diamonds_K.png',
  './assets/cards/clubs_A.png',
  './assets/cards/clubs_2.png',
  './assets/cards/clubs_3.png',
  './assets/cards/clubs_4.png',
  './assets/cards/clubs_5.png',
  './assets/cards/clubs_6.png',
  './assets/cards/clubs_7.png',
  './assets/cards/clubs_8.png',
  './assets/cards/clubs_9.png',
  './assets/cards/clubs_10.png',
  './assets/cards/clubs_J.png',
  './assets/cards/clubs_Q.png',
  './assets/cards/clubs_K.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Only cache same-origin GET requests
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return response;
      });
    })
  );
});
