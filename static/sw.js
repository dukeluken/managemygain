// Ersetzt den Service Worker der v1-App (registriert unter /sw.js):
// räumt dessen Cache auf und meldet sich ab. Die v2-App nutzt /service-worker.js.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(keys.filter((key) => /^mmg-v\d+$/.test(key)).map((key) => caches.delete(key)));
			await self.registration.unregister();
		})()
	);
});
