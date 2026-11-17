/* DentalOS service worker — makes the iPhone / browser install work offline and fast.
   - App shell (index.html): network first, falls back to cache when offline.
   - Hashed build assets, AI runtime (.wasm) and AI models: cache first (immutable / large).
   - Adds cross-origin-isolation headers so the X-ray AI can use all CPU cores
     (multi-threaded WebAssembly), even on static hosts that cannot set headers. */
const VERSION = "dentalos-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== "dentalos-models").map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isolate(res) {
  if (!res || res.type === "opaque" || res.status === 0) return res;
  const h = new Headers(res.headers);
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Embedder-Policy", "require-corp");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

async function cacheFirst(req, cacheName, refresh) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) {
    if (refresh) fetch(req).then((r) => r.ok && c.put(req, r)).catch(() => {});
    return hit;
  }
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache API calls (Claude etc.)

  let p;
  if (req.mode === "navigate") {
    p = fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put("./index.html", copy));
        return res;
      })
      .catch(() => caches.match("./index.html"));
  } else if (url.pathname.includes("/models/")) {
    // refresh in background so improved models roll out on next launch
    p = cacheFirst(req, "dentalos-models", true);
  } else if (url.pathname.includes("/assets/") || url.pathname.endsWith(".wasm")) {
    p = cacheFirst(req, VERSION, false);
  } else {
    p = cacheFirst(req, VERSION, false);
  }
  e.respondWith(p.then(isolate));
});
