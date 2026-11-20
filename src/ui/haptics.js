// Haptics: Android's navigator.vibrate, a short buzz per letter and a
// rhythm per answer. Nothing on iPhones: Safari has no vibration API, and the side door 0.2 first
// used (a script toggling a hidden switch control) was closed in iOS 26.5. Nothing in the game
// depends on it.

import { hapticsKind } from '../core/platform.js';

/** navigator.vibrate patterns (ms on, off, on ...): two short for a target, two farther apart for an Extrawort, three for a miss */
export const VIBRATE = { letter: 8, found: [14, 76, 14], bonus: [14, 206, 14], wrong: [12, 58, 12, 58, 12] };

export const KIND = hapticsKind({
	ua: navigator.userAgent,
	maxTouchPoints: navigator.maxTouchPoints || 0,
	hasVibrate: typeof navigator.vibrate === 'function',
});

/**
 * @param {'letter'|'found'|'bonus'|'wrong'} what
 * @param {boolean} on the "Vibration" setting
 */
export function haptic(what, on) {
	if (!on || !KIND) return;
	try { navigator.vibrate(VIBRATE[what]); } catch { /* a buzz must never become an error */ }
}
