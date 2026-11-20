// What the device is (src/core/platform.js): the first run's Home Screen step only in Safari on
// iPhone and iPad and not from the Home Screen; the haptics' way per device. Real
// user agents, with the touch points and the standalone flag as the browser reports them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeScreenStep, hapticsKind, isIPad } from '../src/core/platform.js';

const UA = {
	iphoneSafari18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
	// iOS 26 keeps "18_6" in the user agent; Version/ says 26
	// iOS 27 keeps "18_7" in the user agent; Version/ says 27
	iphoneSafari27: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1',
	iphoneSafari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
	// iPadOS asks for the desktop site by default: a Mac's user agent, but a touch screen
	ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
	ipadMobile: 'Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1',
	iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
	iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15',
	iphoneEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/138.3351.83 Mobile/15E148 Safari/605.1.15',
	androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
	macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
};
const env = (ua, maxTouchPoints, standalone = false) => ({ ua: UA[ua], maxTouchPoints, standalone });

test('Home Screen step: Safari on iPhone and iPad, not yet from the Home Screen', () => {
	assert.equal(homeScreenStep(env('iphoneSafari18', 5)), true);
	assert.equal(homeScreenStep(env('iphoneSafari26', 5)), true);
	assert.equal(homeScreenStep(env('iphoneSafari27', 5)), true);
	assert.equal(homeScreenStep(env('ipadDesktop', 5)), true);
	assert.equal(homeScreenStep(env('ipadMobile', 5)), true);
});

test('Home Screen step: not when opened from the Home Screen (standalone)', () => {
	assert.equal(homeScreenStep(env('iphoneSafari26', 5, true)), false);
	assert.equal(homeScreenStep(env('ipadDesktop', 5, true)), false);
});

test('Home Screen step: not on a Mac, in other iOS browsers, on Android or a desktop', () => {
	assert.equal(homeScreenStep(env('ipadDesktop', 0)), false, 'Safari on a Mac: same user agent, no touch screen');
	assert.equal(homeScreenStep(env('iphoneChrome', 5)), false);
	assert.equal(homeScreenStep(env('iphoneFirefox', 5)), false);
	assert.equal(homeScreenStep(env('iphoneEdge', 5)), false);
	assert.equal(homeScreenStep(env('androidChrome', 5)), false);
	assert.equal(homeScreenStep(env('macChrome', 0)), false);
	assert.equal(homeScreenStep({}), false);
});

test('iPad: where the Share button is', () => {
	assert.equal(isIPad(env('ipadDesktop', 5)), true);
	assert.equal(isIPad(env('ipadMobile', 5)), true);
	assert.equal(isIPad(env('iphoneSafari26', 5)), false);
	assert.equal(isIPad(env('ipadDesktop', 0)), false);
});

test('haptics: vibrate on Android, nothing on iPhones, iPads and desktops ', () => {
	const h = (ua, maxTouchPoints, hasVibrate) => hapticsKind({ ua: UA[ua], maxTouchPoints, hasVibrate });
	assert.equal(h('iphoneSafari26', 5, false), null, 'iOS 26.5 closed the switch-control tick');
	assert.equal(h('iphoneSafari26', 5, true), null, 'an iOS browser that claims navigator.vibrate still gets nothing');
	assert.equal(h('iphoneChrome', 5, false), null, 'every iOS browser is WebKit');
	assert.equal(h('ipadDesktop', 5, false), null, 'iPads');
	assert.equal(h('androidChrome', 5, true), 'vibrate');
	assert.equal(h('macChrome', 0, true), null, 'desktop Chrome has navigator.vibrate but nothing to shake');
	assert.equal(h('ipadDesktop', 0, false), null, 'Safari on a Mac');
});
