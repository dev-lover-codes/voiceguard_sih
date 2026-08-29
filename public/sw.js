/**
 * VoiceGuard SIH - Enterprise Offline Service Worker
 * Cache-First Strategy for ONNX Models, WASM Engine, AudioWorklet, and App Shell.
 * Enables 100% offline acoustic deepfake detection once loaded on a working connection.
 */

const CACHE_NAME = 'voiceguard-core-offline-v2';

// Core assets precached immediately on Service Worker installation
const PRECACHE_ASSETS = [
  '/',
  '/demo',
  '/dashboard',
  '/demo/caller',
  '/demo/receiver',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/worklets/pcm-processor.js',
  '/models/aasist_baseline.onnx',
  '/models/voiceguard_acoustic.onnx',
  '/samples/cloned_voice.wav',
  '/samples/genuine_voice.wav',
  '/wasm/ort-wasm-simd-threaded.wasm',
  '/wasm/ort-wasm-simd-threaded.mjs',
  '/wasm/ort.wasm.bundle.min.mjs',
  '/wasm/ort.all.bundle.min.mjs',
];

// Service Worker Install: Precache core offline detection bundle
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // Cache assets gracefully (if any optional file 404s, continue caching remaining)
        for (const asset of PRECACHE_ASSETS) {
          try {
            await cache.add(asset);
          } catch {
            // Optional asset missing, continue
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

// Service Worker Activate: Clean up legacy caches and claim active clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Service Worker Fetch: Cache-First for ONNX, WASM, Worklets, and Next.js static bundles
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 1. DYNAMIC API & TELEMETRY (Supabase / Backend API):
  // Network-First with silent offline fallback (never crash the client UI)
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request).catch(() => {
        // Return synthetic offline response so UI telemetry doesn't reject
        return new Response(
          JSON.stringify({ offline: true, message: 'Operating in local offline cache mode' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );
    return;
  }

  // 2. CRITICAL DETECTION ASSETS (ONNX Model, WASM Binaries, Worklet, Audio Samples, Next.js static assets):
  // CACHE-FIRST STRATEGY: Serve immediately from local cache if present
  const isDetectionAsset =
    url.pathname.startsWith('/models/') ||
    url.pathname.startsWith('/wasm/') ||
    url.pathname.startsWith('/worklets/') ||
    url.pathname.startsWith('/samples/') ||
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.onnx') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css');

  if (isDetectionAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Fetch from network, cache on demand, and return
        return fetch(request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });

            return networkResponse;
          })
          .catch(() => {
            // Offline fallback
            return cachedResponse || new Response('Offline asset unavailable', { status: 503 });
          });
      })
    );
    return;
  }

  // 3. HTML APP SHELL / PAGES (Stale-While-Revalidate / Cache with Network Fallback)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
