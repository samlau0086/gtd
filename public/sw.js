const CACHE_NAME = "gtd-flow-shell-v2";
const OFFLINE_ASSETS = [
  "/offline.html",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "GTD Flow 提醒", { body:data.body || "你有一个任务需要处理", icon:"/icon-192.png", badge:"/icon-192.png", tag:data.tag || "gtd-reminder", data:{ url:data.url || "/" } }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close(); const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type:"window", includeUncontrolled:true }).then((clients) => { const existing=clients.find((client)=>new URL(client.url).origin===self.location.origin); if(existing){existing.navigate(target);return existing.focus();} return self.clients.openWindow(target); }));
});
self.addEventListener("pushsubscriptionchange", (event) => { event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then((clients)=>Promise.all(clients.map((client)=>client.postMessage({type:"push-subscription-changed"}))))); });
