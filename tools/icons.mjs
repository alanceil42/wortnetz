// icons.mjs — the Home Screen icons (iOS ignores SVG there) from icon.svg: full-bleed squares
// (iOS and Android round the corners themselves), the mark at 80 %. Playwright's Chromium.
//
//	node tools/icons.mjs icon.svg icons        (CHROME=/path for another Chromium)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync(process.argv[2], 'utf8').replace(' rx="8"', '').replace('/><g stroke', '/><g transform="translate(16 16) scale(.8) translate(-16 -16)"><g stroke').replace('</g></svg>', '</g></g></svg>');
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
for (const n of [180, 192, 512]) {
	const p = await b.newPage({ viewport: { width: n, height: n } });
	await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${n}" height="${n}" `)}</body></html>`);
	await p.screenshot({ path: `${process.argv[3]}/icon-${n}.png`, omitBackground: false });
	await p.close();
}
await b.close();
