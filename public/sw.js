/* Neo Forge Technology: shows notifications for replies to a visitor's chat or enquiry (opt-in). */
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { /* ignore */ }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some((c) => c.visibilityState === "visible" && c.focused)) return; // they are looking at the site already
    await self.registration.showNotification(d.title || "Neo Forge Technology", {
      body: d.body || "", icon: d.icon, badge: d.icon, data: { url: d.url || "/" }, tag: d.tag || "nf-reply", renotify: true,
    });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const c of wins) { if ("focus" in c) { if (c.navigate) c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
