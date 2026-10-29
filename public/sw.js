/* Only public build assets and the generic offline screen belong in these caches. */
const CACHE_PREFIX = "tasks-public-";
const CACHE_NAME = `${CACHE_PREFIX}2026-10-30-3`;
const OFFLINE_URL = "/offline.html";
const PUBLIC_FILES = [
  OFFLINE_URL,
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/badge-96.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_FILES)),
  );
  // An update waits until the user explicitly accepts it, or all old app tabs close.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = (await caches.keys()).filter(
        (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
      );
      // Keep one prior public cache for other open tabs using the previous build.
      await Promise.all(names.slice(0, -1).map((name) => caches.delete(name)));
      try {
        if (self.registration.navigationPreload)
          await self.registration.navigationPreload.enable();
      } catch {
        // Navigation still works when preload is unavailable.
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE")
    event.waitUntil(self.skipWaiting());
  if (event.data?.type === "CLEAR_APP_CACHES")
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX))
            .map((name) => caches.delete(name)),
        );
      })(),
    );
});

function publicAsset(url) {
  if (PUBLIC_FILES.includes(url.pathname)) return true;
  // Vercel serves the same build assets under its immutable namespace.
  const pathname = url.pathname.replace(
    /^\/_next\/static\/immutable\//,
    "/_next/static/",
  );
  // Next 16 Turbopack uses 13-character base36 hashes, including '_' and '-'.
  // Also support Webpack's hexadecimal chunk/CSS names and hashed font files.
  return (
    /^\/_next\/static\/chunks\/(?:turbopack-)?[a-z0-9_-]{13}\.(?:js|css)$/i.test(
      pathname,
    ) ||
    /^\/_next\/static\/(?:chunks|css)\/(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]*[a-f0-9]{8,}\.(?:js|css)$/i.test(
      pathname,
    ) ||
    /^\/_next\/static\/media\/[a-z0-9_.-]*[a-f0-9]{8,}(?:-s)?\.(?:woff2?|ttf)$/i.test(
      pathname,
    )
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Authenticated HTML and APIs always go to the server. A failed full navigation
  // can show a generic offline screen, never a cached account or task snapshot.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) || (await fetch(request));
        } catch {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }
  if (!publicAsset(url)) return;
  event.respondWith(
    (async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      // Dev responses are never immutable, even if a future dev name resembles a hash.
      const immutable = /(?:^|,)\s*immutable\s*(?:,|$)/i.test(
        response.headers.get("Cache-Control") || "",
      );
      if (
        response.ok &&
        response.type === "basic" &&
        (PUBLIC_FILES.includes(url.pathname) || immutable)
      ) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        if (keys.length > 128)
          await Promise.all(
            keys
              .slice(0, keys.length - 128)
              .filter(
                (key) => !PUBLIC_FILES.includes(new URL(key.url).pathname),
              )
              .map((key) => cache.delete(key)),
          );
      }
      return response;
    })(),
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data?.json() || {};
      } catch {
        /* Display a safe fallback. */
      }
      const title =
        typeof payload.title === "string"
          ? payload.title.slice(0, 100)
          : "Tasks";
      const body =
        typeof payload.body === "string"
          ? payload.body.slice(0, 500)
          : "Your task summary is ready.";
      let target = "/?view=today";
      if (typeof payload.url === "string") {
        try {
          const url = new URL(payload.url, self.location.origin);
          if (url.origin === self.location.origin && url.pathname === "/")
            target = url.pathname + url.search;
        } catch {
          /* Keep the app's default destination. */
        }
      }
      await self.registration.showNotification(title, {
        body,
        icon: "/icons/app-icon-192.png",
        badge: "/icons/badge-96.png",
        tag:
          typeof payload.tag === "string"
            ? payload.tag.slice(0, 120)
            : "tasks-summary",
        data: { url: target },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus existing work without navigating away from an unsaved editor.
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) return existing.focus();
      const url = new URL(
        event.notification.data?.url || "/?view=today",
        self.location.origin,
      );
      return self.clients.openWindow(
        url.origin === self.location.origin && url.pathname === "/"
          ? url.href
          : "/?view=today",
      );
    })(),
  );
});
