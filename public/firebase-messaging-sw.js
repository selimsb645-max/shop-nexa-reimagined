// AVENTA SHOP — Firebase Cloud Messaging Service Worker
// Handles background push notifications for order updates
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyCjPujDgUn2c1aLKWLMXTsV3rNM3Q2J1wQ",
  authDomain: "studio-6202246915-3b319.firebaseapp.com",
  projectId: "studio-6202246915-3b319",
  storageBucket: "studio-6202246915-3b319.firebasestorage.app",
  messagingSenderId: "763885455427",
  appId: "1:763885455427:web:3bf184751c119a1760ecf6",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages (when app is not in foreground)
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon, tag, data } = payload.notification || {};
  const notificationTitle = title || "AVENTA SHOP";
  const notificationOptions = {
    body: body || "You have a new update",
    icon: icon || "/brand/aventa-shop-logo.png",
    badge: "/brand/aventa-shop-logo.png",
    tag: tag || "aventa-notification",
    data: data || {},
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click — open the app and navigate to the relevant page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.link || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          if (targetUrl !== "/") {
            client.postMessage({ type: "NAVIGATE", url: targetUrl });
          }
          return;
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

// Basic cache for offline shell (PWA installability)
const CACHE_NAME = "aventa-shop-v1";
const PRECACHE_URLS = ["/", "/shop", "/brand/aventa-shop-logo.png", "/manifest.json", "/favicon.ico", "/favicon.svg", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      ),
    ),
  );
  self.clients.claim();
});

// Stale-while-revalidate for GET requests
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Skip cross-origin and Firebase API requests
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_vite") || url.pathname.startsWith("/__")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    }),
  );
});
