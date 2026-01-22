const CACHE_NAME = "claudemail-v29";
const ASSETS = [
  "/static/app.css?v=20260122-12",
  "/static/app.js?v=20260122-12",
  "/static/vendor/xterm/xterm.css",
  "/static/vendor/xterm/xterm.js",
  "/static/vendor/xterm/addon-fit.js",
  "/static/manifest.webmanifest",
  "/static/icons/claude-color.png",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
  "/static/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key))))
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isShell = url.pathname === "/" || url.pathname === "/index.html";
  const isStatic = url.pathname.startsWith("/static/");

  if (isShell) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
    );
    return;
  }

  if (isStatic) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
