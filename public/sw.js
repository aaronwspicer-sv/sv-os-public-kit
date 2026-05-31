/* Spicer OS Service Worker — push handler + click handler */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Spicer OS", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Spicer OS";
  const options = {
    body:        data.body || "",
    icon:        "/icon-192.png",
    badge:       "/icon-192.png",
    tag:         data.tag || "spicer-os",
    data:        { url: data.url || "/" },
    requireInteraction: !!data.requireInteraction,
    vibrate:     [120, 60, 120],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab on the same origin if one exists
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
