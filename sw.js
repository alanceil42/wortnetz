// wortnetz's service worker: the game works offline after one visit, and a new release never
// mixes with the old one.
//
// One cache per release, named after the commit that `git archive` fills in below
// (.gitattributes: export-subst), so every release is a new sw.js and the browser installs it in
// the background. Installing fetches every file of the page and every batch of puzzles anew into
// the new cache; the page is served from the cache of the worker that controls it. A new release
// waits until the page lets it take over (src/ui/update.js: "Neu laden", or the next start); then
// the old caches go. A checkout that wasn't archived (a test server) is "dev": network first,
// the cache only when offline.

const COMMIT = '$Format:%h$';
const RELEASE = COMMIT.startsWith('$') ? 'dev' : COMMIT;
const CACHE = `wortnetz-${RELEASE}`;
const PREFIX = 'wortnetz-';

/** every file the page loads (tests/sw.test.js checks the list against index.html and the imports) */
const FILES = [
	'./',
	'index.html',
	'app.css',
	'icon.svg',
	'manifest.json',
	'config.json',
	'icons/icon-180.png',
	'icons/icon-192.png',
	'icons/icon-512.png',
	'src/build.js',
	'src/core/days.js',
	'src/core/example.js',
	'src/core/filename.js',
	'src/core/game.js',
	'src/core/platform.js',
	'src/core/records.js',
	'src/core/timing.js',
	'src/ui/app.js',
	'src/ui/haptics.js',
	'src/ui/intro.js',
	'src/ui/store.js',
	'src/ui/update.js',
	'vendor/xxl-scorer/src/core/backup.js',
	'vendor/xxl-scorer/src/core/debugreport.js',
	'vendor/xxl-scorer/src/core/imprint.js',
	'vendor/xxl-scorer/src/core/read.js',
	'vendor/xxl-scorer/src/core/text.js',
	'vendor/xxl-scorer/src/ui/debug.js',
	'puzzles/index.json',
];
/** the site's own settings (the Impressum link): there on Pages when configured, else not */
const OPTIONAL = ['local/config.json'];

const fresh = url => fetch(new Request(url, { cache: 'reload' }));

async function install() {
	const cache = await caches.open(CACHE);
	// every file or none: a release with a file missing must not take over
	const put = async url => {
		const r = await fresh(url);
		if (!r.ok) throw new Error(`${url}: ${r.status}`);
		await cache.put(url, r);
	};
	await Promise.all(FILES.map(put));
	const idx = await (await cache.match('puzzles/index.json')).json();
	await Promise.all((idx.batches || []).map(b => put(`puzzles/${encodeURIComponent(b.file)}`)));
	await Promise.all(OPTIONAL.map(async url => {
		try { const r = await fresh(url); if (r.ok) await cache.put(url, r); } catch { /* not there */ }
	}));
}

self.addEventListener('install', e => { e.waitUntil(install()); });

self.addEventListener('activate', e => {
	e.waitUntil((async () => {
		for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
		await self.clients.claim();
	})());
});

// the page says when the waiting release may take over
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', e => {
	const req = e.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== location.origin || !url.href.startsWith(self.registration.scope)) return;
	e.respondWith(answer(req, url));
});

async function answer(req, url) {
	const cache = await caches.open(CACHE);
	// a navigation within the scope is the page itself
	const key = req.mode === 'navigate' ? 'index.html' : url.href.slice(self.registration.scope.length).split('?')[0] || './';
	if (RELEASE === 'dev') {
		try { return await fetch(req); } catch { return (await cache.match(key)) || Response.error(); }
	}
	const hit = await cache.match(key);
	if (hit) return hit;
	// the site's optional settings weren't there when this release was installed: still not
	if (OPTIONAL.includes(key)) return new Response('', { status: 404 });
	return fetch(req);
}
