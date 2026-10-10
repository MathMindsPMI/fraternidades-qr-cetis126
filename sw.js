const CACHE='fraternidades-multi-v3-credenciales';
const FILES=['./','./index.html','./app.js','./config.js','./qr-local.js','./jsQR.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./logo-dgeti.png','./logo-fraternidades.webp','./logo-agua.jpeg','./logo-aire.jpeg','./logo-tierra.jpeg','./logo-fuego.jpeg','./logo-cetis126.jpeg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return res}))) });
