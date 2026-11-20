// Offline and updates, the page's side (the worker is sw.js). The worker keeps one cache per
// release and serves the page from it. A new release installs in the background and waits:
// - while the page is open, a temporary toast offers "Neu laden", never while a game runs;
// - at the next start a waiting release takes over before anything is shown.
// Either way the page reloads once, all from the new release: never a mix of two.

const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
let reg = null, reloading = false, lastCheck = 0, busy = () => false;

/** the new release controls the page: reload into it, but not in the middle of a game */
function reloadWhenTaken() {
	sw.addEventListener('controllerchange', function go() {
		if (reloading) return;
		if (busy()) { setTimeout(go, 1000); return; }
		reloading = true;
		location.reload();
	});
}

/**
 * At the start, before anything is drawn: a release that waited takes over now.
 * @returns {Promise<boolean>} true when the page is about to reload
 */
export async function takeWaiting() {
	if (!sw || !sw.controller) return false;
	try {
		const r = await sw.getRegistration();
		if (!r || !r.waiting) return false;
		reloadWhenTaken();
		skip(r.waiting);
		// if the worker doesn't answer, go on with the old release rather than hang
		return await new Promise(res => { setTimeout(() => res(reloading), 3000); sw.addEventListener('controllerchange', () => res(true), { once: true }); });
	} catch {
		return false;
	}
}

/**
 * Register the worker and watch for a new release.
 * @param {{ready: () => void, busy: () => boolean, log: (msg: string) => void}} o ready: a new
 *   release waits; busy: a game runs (no reload then)
 */
export function startUpdates(o) {
	if (!sw) return;
	busy = o.busy;
	// before the first touch the page is still starting: a release found waiting then takes over
	// at once (Chromium may report it only after takeWaiting looked)
	let starting = true;
	addEventListener('pointerdown', () => { starting = false; }, { capture: true, once: true });
	sw.register('sw.js', { updateViaCache: 'none' }).then(r => {
		reg = r;
		const watch = w => {
			if (!w) return;
			// still starting: take over now rather than flash the toast and reload under it
			const done = () => {
				if (w.state !== 'installed' || !sw.controller) return;
				if (starting) { reloadWhenTaken(); skip(w); } else o.ready();
			};
			w.addEventListener('statechange', done);
			done();
		};
		// a release that waited: Chromium may fill in r.waiting a moment after the registration
		let looks = 0;
		const look = () => {
			// at the start without the fallback reload of takeNow (no reload loop when held back)
			if (r.waiting && sw.controller) { if (starting) { reloadWhenTaken(); skip(r.waiting); } else o.ready(); }
			else if (starting && ++looks < 15) setTimeout(look, 200);
			else starting = false;	// 3 s on: a release found later waits for the toast
		};
		look();
		watch(r.installing);
		r.addEventListener('updatefound', () => watch(r.installing));
	}).catch(err => o.log(`service worker: ${err && err.message}`));
	// a Home Screen app comes back without a navigation: look for a new release then
	document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}

/** ask the server for a new sw.js, at most once a minute */
export function check() {
	if (!reg || Date.now() - lastCheck < 60000) return;
	lastCheck = Date.now();
	reg.update().catch(() => { /* offline: next time */ });
}

/** "Neu laden": the waiting release takes over, the page reloads */
export function takeNow() {
	if (!reg || !reg.waiting) { location.reload(); return; }
	reloadWhenTaken();
	skip(reg.waiting);
	// if the browser holds the new release back, reload anyway: the old one, whole (it then takes
	// over at the next start)
	setTimeout(() => { if (!reloading) { reloading = true; location.reload(); } }, 6000);
}
/** ask a waiting worker to take over; again while it doesn't (Chromium sometimes holds a release
	back that a page asks for right at its start; ui-check saw it about one reload in three) */
function skip(w, tries = 0) {
	w.postMessage('skip');
	setTimeout(() => { if (w.state === 'installed' && tries < 10) skip(w, tries + 1); }, 500);
}

/** for the debug report */
export const swState = () => ({
	supported: !!sw,
	controlled: !!(sw && sw.controller),
	waiting: !!(reg && reg.waiting),
});
