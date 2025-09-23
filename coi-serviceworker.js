// coi-serviceworker.js
// 基于常见实现：补 COOP/COEP 头以启用 SharedArrayBuffer
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.postMessage({ type: 'coi-ready' });
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const r = event.request;
  // 避免某些浏览器对跨源 only-if-cached 报错
  if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;

  event.respondWith((async () => {
    const resp = await fetch(r);
    const newHeaders = new Headers(resp.headers);

    // 关键头：跨源隔离
    newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
    newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');

    // 返回带新头的响应
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: newHeaders
    });
  })());
});