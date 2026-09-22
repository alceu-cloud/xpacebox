self.addEventListener("push", (event) => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch { /* Ignore malformed payloads. */ }
  event.waitUntil(self.registration.showNotification(message.title || "XPACE", {
    body: message.body || "Você tem uma nova atualização na agenda.",
    icon: "/xpace-school-app-icon.png",
    badge: "/xpace-school-app-icon.png",
    tag: message.tag || "xpace-update",
    data: { url: message.url || "/xpace/app" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/xpace/app", self.location.origin);
  if (target.origin !== self.location.origin || !target.pathname.startsWith("/xpace/app")) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find((client) => new URL(client.url).pathname.startsWith("/xpace/app"));
    if (existing) {
      if ("navigate" in existing) await existing.navigate(target.href);
      return existing.focus();
    }
    return self.clients.openWindow(target.href);
  }));
});
