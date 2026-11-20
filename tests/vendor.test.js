// tools/vendor.sh --check: vendor/ holds exactly the files listed in vendor/xxl-scorer/SHA256SUMS,
// as regular files. The site publishes all of vendor/, so a file nobody listed, or a link the
// upload would replace by what it points to, must fail the check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile, appendFile, symlink, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const X = 'vendor/xxl-scorer';

/** A copy of tools/vendor.sh and vendor/, changed by `change`, then checked. */
async function check(change = async () => {}) {
	const dir = await mkdtemp(join(tmpdir(), 'wortnetz-vendor-'));
	try {
		await cp(join(root, 'tools/vendor.sh'), join(dir, 'tools/vendor.sh'));
		await cp(join(root, 'vendor'), join(dir, 'vendor'), { recursive: true });
		await change(dir);
		return spawnSync('bash', [join(dir, 'tools/vendor.sh'), '--check'], { encoding: 'utf8' });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test('vendor/ as committed passes', async () => {
	const r = await check();
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /vendor check OK/);
});

test('a file not in SHA256SUMS fails, wherever it is in vendor/', async () => {
	for (const f of [`${X}/src/core/extra.js`, `${X}/.hidden`, 'vendor/page.html', 'vendor/other/x.js']) {
		const r = await check(async d => { await mkdir(dirname(join(d, f)), { recursive: true }); await writeFile(join(d, f), 'x'); });
		assert.equal(r.status, 1, f);
		assert.match(r.stdout, new RegExp(`Not in [^]*\\n${f.replaceAll('.', '\\.')}\\n`), f);
	}
});

test('a changed or missing listed file fails', async () => {
	assert.equal((await check(d => appendFile(join(d, X, 'src/core/text.js'), ' '))).status, 1);
	assert.equal((await check(d => rm(join(d, X, 'LICENSE')))).status, 1);
});

test('a symbolic link fails, to a file or a directory, listed or not', async () => {
	for (const [name, target] of [[`${X}/src/x.js`, '/etc/hostname'], ['vendor/etc', '/etc']]) {
		const r = await check(d => symlink(target, join(d, name)));
		assert.equal(r.status, 1, name);
		assert.match(r.stdout, new RegExp(`Not a regular file[^]*\\n${name}\\n`), name);
	}
	// a listed file replaced by a link to a copy of itself still fails
	const r = await check(async d => {
		await rename(join(d, X, 'LICENSE'), join(d, 'vendor/LICENSE.copy'));
		await symlink('../LICENSE.copy', join(d, X, 'LICENSE'));
	});
	assert.equal(r.status, 1);
});

test('a line in SHA256SUMS that is not a checksum fails', async () => {
	const r = await check(async d => {
		await writeFile(join(d, X, 'evil.js'), 'x');
		await appendFile(join(d, X, 'SHA256SUMS'), 'deadbeef  evil.js\n');
	});
	assert.equal(r.status, 1, r.stdout);
});
