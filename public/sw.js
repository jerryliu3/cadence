self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload;

  try {
    payload = event.data.json();
  } catch {
    payload = { body: event.data.text() };
  }

  const title = payload.title || "Cadence";
  const options = {
    body: payload.body || "Complete your checklist for today",
    icon: payload.icon || "/cadence-icon.svg",
    badge: payload.badge || "/cadence-icon.svg",
    tag: payload.tag,
    data: {
      url: payload.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const requestedUrl = event.notification.data?.url || "/";
  const targetUrl = new URL(requestedUrl, self.location.origin);

  if (targetUrl.origin !== self.location.origin) {
    targetUrl.href = self.location.origin;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const existingClient = windowClients.find((client) => {
          const clientUrl = new URL(client.url);
          return clientUrl.origin === targetUrl.origin;
        });

        if (existingClient) {
          return existingClient.focus().then(() => existingClient.navigate(targetUrl.href));
        }

        return self.clients.openWindow(targetUrl.href);
      })
  );
});
