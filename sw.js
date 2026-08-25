/* Service worker: offline app shell cache + background notification triggers. */
importScripts("idb.js");
importScripts("words.js");
importScripts("word-picker.js");

var CACHE_NAME = "jp-word-reminder-v1";
var APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./idb.js",
  "./words.js",
  "./word-picker.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request).catch(function () { return cached; });
    })
  );
});

async function jpShowWordNotification() {
  var settings = (await jpIdbGet("settings")) || { levels: ["N5"] };
  var levels = settings.levels && settings.levels.length ? settings.levels : ["N5"];
  var word = await jpPickNextWord(levels);
  if (!word) return;

  var log = (await jpIdbGet("history")) || [];
  log.unshift({ k: word.k, r: word.r, m: word.m, level: word.level, t: Date.now() });
  await jpIdbSet("history", log.slice(0, 30));
  await jpIdbSet("lastFireTime", Date.now());

  return self.registration.showNotification("📖 " + word.level + " ・ " + word.k, {
    body: word.r + "\n" + word.m,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: "jp-word",
    renotify: true,
    data: { url: "./index.html" }
  });
}

// Best-effort background trigger on Android Chrome (installed PWA only).
// The browser decides the actual interval based on engagement; it is not exact.
self.addEventListener("periodicsync", function (event) {
  if (event.tag === "jp-word-notification") {
    event.waitUntil(jpShowWordNotification());
  }
});

// Fallback for browsers without periodicsync: a page can ask the SW
// (via postMessage) to show a notification immediately.
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SHOW_WORD_NOW") {
    event.waitUntil(jpShowWordNotification());
  }
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if ("focus" in clients[i]) return clients[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
