const CACHE = "agrovision-v5";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(["/", "/icon.svg", "/radish-sample.jpg", "/terranova-icon.png", "/terranova-logo.png"]);
        // The first page loads its JS before this worker controls it. Cache
        // those initial dependencies as well, so the first offline reload boots.
        const html = await (await cache.match("/")).text();
        const paths = [...new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)]
          .map((match) => match[1].replaceAll("&amp;", "&")))];
        await cache.addAll(paths);
      })
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("agrovision-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches
                .open(CACHE)
                .then((cache) => cache.put(event.request, copy)),
            );
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((hit) => hit || caches.match("/")),
        ),
    );
    return;
  }
  if (
    url.pathname.startsWith("/_next/static/") ||
    ["/icon.svg", "/radish-sample.jpg", "/terranova-icon.png", "/terranova-logo.png"].includes(url.pathname)
  )
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(
                caches
                  .open(CACHE)
                  .then((cache) => cache.put(event.request, copy)),
              );
            }
            return response;
          }),
      ),
    );
});
