// The page's storage: one JSON object in localStorage (src/core/records.js says what is in it),
// the error log beside it. Safari may wipe a site's storage; the Backup file is what lasts.

import { cleanState } from '../core/records.js';

const KEY = 'wortnetz.state';
const ERRORS = 'wortnetz.errors';

let writable = true;

export function loadState() {
	try {
		const t = localStorage.getItem(KEY);
		return cleanState(t ? JSON.parse(t) : null);
	} catch {
		return cleanState(null);
	}
}

/** @returns {boolean} false when the browser refused (private mode, storage full) */
export function saveState(st) {
	try {
		localStorage.setItem(KEY, JSON.stringify(st));
		writable = true;
	} catch {
		writable = false;
	}
	return writable;
}

export const storageOk = () => writable;

/** for xxl-scorer's startErrorLog (vendored debug.js): the log kept across reloads */
export const errorStore = {
	async load() {
		try { return JSON.parse(localStorage.getItem(ERRORS) || '[]'); } catch { return []; }
	},
	async save(log) {
		try { localStorage.setItem(ERRORS, JSON.stringify(log)); } catch { /* the log must never become the error */ }
	},
};
