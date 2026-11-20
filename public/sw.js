/* Wajbati service worker: silent auto-update (skipWaiting + clients.claim),
   static-asset caching, and network-first for pages/APIs.
   Web Push is intentionally NOT enabled here — requires VAPID keys and a
   configured push provider. Do not claim background delivery on iOS/Android
   until those credentials exist and device support is verified. */
const CACHE = "wajbati-static-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(["/manifest.json", "/icon-192.png", "/icon-512.png"]))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon-");
  if (isStatic || request.destination === "image" || request.destination === "script" || request.destination === "style") {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate" || url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
