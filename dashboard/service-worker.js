"use strict";

const CACHE_PREFIX = "stm-core-shell-";
const CACHE_NAME = CACHE_PREFIX + "v1";
const OFFLINE_URL = "offline.html";
const PRECACHE = [
    OFFLINE_URL,
    "mobile.css",
    "assets/pwa/icon-192.png",
    "assets/pwa/icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)));
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                .map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/api/") || url.pathname === "/ws") return;

    if (request.mode === "navigate") {
        event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            const update = fetch(request).then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            });
            if (cached) {
                event.waitUntil(update.catch(() => undefined));
                return cached;
            }
            return update;
        })
    );
});
