const CACHE_NAME = 'neural-note-cache-v1';

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch event - Network first, then cache
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests for now to avoid CORS complexity in simple example, 
  // or handle them carefully. We focus on app shell.
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes('cdn.tailwindcss.com') && !event.request.url.includes('fonts.googleapis.com')) {
     return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful valid responses
        if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});