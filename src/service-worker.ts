/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// App-Hülle offline verfügbar machen. Daten kommen aus dem Firestore-Offline-Cache.
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `mmg-${version}`;
// Pfade im Manifest sind relativ zum Basis-Pfad; hier in absolute URLs umwandeln.
const toUrl = (path: string) => new URL(path, sw.registration.scope).pathname;
const ASSETS = [...immutable, ...assets].map((item) => toUrl(item.path));
const SHELL = toUrl('index.html');

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll([...ASSETS, SHELL]))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	// Gebaute Dateien und statische Assets: aus dem Cache.
	if (ASSETS.includes(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(request)));
		return;
	}
	// Seitenaufrufe: Netz zuerst, offline die App-Hülle.
	if (request.mode === 'navigate') {
		event.respondWith(fetch(request).catch(async () => (await caches.match(SHELL)) ?? Response.error()));
	}
});
