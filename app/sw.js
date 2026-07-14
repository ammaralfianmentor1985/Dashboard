// Service worker — offline shell for /app/. Auto-stamped by tools/release.mjs
// on every release that ships app/ files (hash of app/ contents -> version
// string), so a forgotten manual bump can't brick the cache.
const SW_VERSION = "v20260714175015-476ad3e9";
const CACHE_NAME = `mm-shell-${SW_VERSION}`;
const CORE_SHELL = [
  "/app/",
  "/app/index.html",
  "/app/css/base.css",
  "/app/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_SHELL)).catch(() => {})
  );
  // Deliberately no self.skipWaiting() here — an in-flight tab shouldn't be
  // yanked onto a new version mid-session. The app's update-toast (main.js)
  // asks the user first, then posts SKIP_WAITING.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("mm-shell-") && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!isSameOrigin(url)) return; // never touch Yahoo/Binance/cross-origin calls
  if (url.pathname.startsWith("/api/")) return; // let the Netlify CDN caching headers do their job

  if (req.mode === "navigate") {
    // Network-first for the shell page so users get the latest release when
    // online; cached copy is the offline fallback.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put("/app/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/app/index.html"))
    );
    return;
  }

  if (url.pathname.startsWith("/app/")) {
    // Stale-while-revalidate for app static assets (JS modules, CSS, icons,
    // bundled universe/lesson data) — instant from cache, refreshed in background.
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
