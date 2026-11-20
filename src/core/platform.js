// What the device is, for the first run's Home Screen step and the haptics. Pure: the
// page passes what the browser says (user agent, touch points, the standalone flag), so the
// rules are tested on real user agents.

/** iPhone, iPod, or an iPad (iPadOS 13+ says "Macintosh", but a Mac has no touch screen) */
export function isIOS({ ua = '', maxTouchPoints = 0 } = {}) {
	return /\b(iPhone|iPad|iPod)\b/.test(ua) || (/\bMacintosh\b/.test(ua) && maxTouchPoints > 1);
}

/** an iPad, including iPadOS's desktop user agent */
export function isIPad({ ua = '', maxTouchPoints = 0 } = {}) {
	return /\biPad\b/.test(ua) || (/\bMacintosh\b/.test(ua) && maxTouchPoints > 1);
}

/** Safari itself, not another browser on iOS (they all run WebKit but name themselves) */
export function isSafari({ ua = '' } = {}) {
	return /\bSafari\//.test(ua) && /\bVersion\//.test(ua) && !/\b(CriOS|FxiOS|EdgiOS|OPiOS|OPT|YaBrowser|GSA|DuckDuckGo|Brave)\b/.test(ua);
}

/**
 * The first run's Home Screen step: in Safari on iPhone and iPad, while not opened from the
 * Home Screen. Safari deletes a site's storage after 7 days of use without a visit; a
 * Home Screen web app keeps it.
 * @param {{ua: string, maxTouchPoints: number, standalone: boolean}} env
 */
export function homeScreenStep(env) {
	return isIOS(env) && isSafari(env) && !env.standalone;
}

/**
 * How this device can buzz: 'vibrate' where navigator.vibrate exists on
 * a touch screen (Android), else null. Never on iOS: no browser there has a way since iOS 26.5
 * (the hidden switch control's tick only answers a finger now), whatever it claims to support.
 * @param {{ua: string, maxTouchPoints: number, hasVibrate: boolean}} env
 */
export function hapticsKind(env) {
	if (isIOS(env)) return null;
	if (env.hasVibrate && env.maxTouchPoints > 0) return 'vibrate';
	return null;
}
