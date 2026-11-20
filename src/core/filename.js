// The backup file's name: xxl-scorer's rules, vendored, not rewritten: {date} becomes
// the local date, characters a file system refuses become "-", at most 100 characters, ".json".
// Its fallback for an empty or unusable pattern is xxl-scorer's own default, so an empty result
// is caught here first and wortnetz's default used instead.

import { backupFileName as xxlName } from '../../vendor/xxl-scorer/src/core/backup.js';
import { DEFAULT_FILE_NAME } from './records.js';

/**
 * @param {string} pattern the setting ('' for the default)
 * @param {Date} [d]
 */
export function backupFileName(pattern, d = new Date()) {
	const p = typeof pattern === 'string' ? pattern : '';
	// what xxl-scorer's cleaning would leave of it: nothing means the default
	const left = p.trim().replace(/\.json$/i, '').replace(/^[\s.]+|[\s.]+$/g, '');
	return xxlName(left ? p : DEFAULT_FILE_NAME, d);
}
