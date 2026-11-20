// The first run: a welcome with the steps to the Home
// Screen (in Safari on iPhone and iPad only), the example puzzle on the name, played with the
// real game core by drag and by tap and without a clock, then four tips. "So geht's" plays the
// example again.

import * as g from '../core/game.js';
import { EXAMPLE, feedback, nextStep } from '../core/example.js';

const NS = 'http://www.w3.org/2000/svg';
const icon = n => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const dots = k => `<div class="dots" aria-hidden="true">${[0, 1, 2].map(i => `<i${i === k ? ' class="on"' : ''}></i>`).join('')}</div>`;
const setAttrs = (el, a) => { for (const [k, v] of Object.entries(a)) el.setAttribute(k, v); return el; };

/**
 * @param {object} o
 * @param {HTMLElement} o.root the <main> to fill
 * @param {boolean} o.home show the Home Screen step first
 * @param {boolean} o.ipad where the Share button is
 * @param {(day: string, skip: boolean) => void} o.header the header's small text and the skip button
 * @param {() => void} o.done to today's puzzle
 * @param {(what: string) => void} o.haptic
 * @param {() => {r: number, fs: number}} o.sizes the tiles' radius and letter size (Dynamic Type)
 */
export function startIntro(o) {
	const { root } = o;
	let G = null, vis = null, path = [], tracing = false, tapping = false, lastPt = null, line = '', last = { w: '', cls: '' };
	let svg = null, tiles = [], lines = {}, traceG = null;

	function homeScreen() {
		o.header('', false);
		const share = `<span class="share">${icon('share')}</span>`;
		const first = o.ipad
			? `Tippe oben auf ${share} <b>Teilen</b>. Siehst du es nicht, tippe zuerst auf <b>⋯</b>.`
			: `Tippe unten auf <b>⋯</b> (drei Punkte), dann auf ${share} <b>Teilen</b>. Auf älteren iPhones ist ${share} gleich unten zu sehen.`;
		root.innerHTML = `<div class="card"><h2>Willkommen!</h2><p>Jeden Tag ein neues Worträtsel: Wörter entlang der Linien finden.</p></div>
			<div class="card"><h2>Zuerst auf den Home-Bildschirm</h2>
				<ol class="steps"><li>${first}</li><li>Wähle <b>„Zum Home-Bildschirm“</b> und tippe auf <b>Hinzufügen</b>.</li><li>Öffne wortnetz dann über das neue Symbol.</li></ol>
				<p class="note">So bleiben deine Lösungen gespeichert. Safari löscht sie, wenn du eine Woche nicht spielst.</p>
			</div>
			<div class="btns"><button class="btn" type="button" data-intro="play">Später, erst ausprobieren</button></div>
			${dots(0)}`;
	}

	function playScreen() {
		o.header('Probierrätsel', true);
		G = g.newGame(EXAMPLE, { id: 'example' });
		vis = g.visible(G); path = []; tracing = tapping = false; line = ''; last = { w: '', cls: '' };
		root.innerHTML = `<div class="guide" id="tGuide"></div>
			<div class="wordbar"><div class="word" id="tWord"></div></div>
			<div class="boardwrap"><svg class="board mini" id="tBoard" viewBox="0 0 400 200" role="img" aria-label="Probierrätsel"></svg></div>
			<div class="status"><div class="left" id="tLeft"></div><div class="chips" id="tChips"></div></div>
			${dots(1)}`;
		svg = root.querySelector('#tBoard');
		draw(); wire(); paint();
	}

	function doneScreen() {
		o.header('Probierrätsel', false);
		root.innerHTML = `<div class="card c"><h2>Geschafft!</h2><p>So geht jedes Rätsel: Finde alle Wörter, dann ist das Netz leer.</p></div>
			<div class="card tips"><h3>Gut zu wissen</h3>
				<p>${icon('bulb')}<span>Ein Tipp zeigt den nächsten Buchstaben eines Wortes. Du hast 3 pro Rätsel.</span></p>
				<p>${icon('rot')}<span>Drehen zeigt das Brett anders herum, wenn du nicht weiterkommst.</span></p>
				<p><i class="noi"></i><span>Ein echtes Wort, das nicht gesucht ist, ist ein Extrawort. Es zieht 10 Sekunden von der Uhr ab.</span></p>
				<p>${icon('pause')}<span>Tippe auf die Uhr, um sie anzuhalten. Ohne Uhr spielen: ${icon('gear')} Einstellungen, „Zeit ausblenden“.</span></p>
			</div>
			<div class="btns"><button class="btn pri" type="button" data-intro="done">Zum heutigen Rätsel</button></div>
			${dots(2)}`;
	}

	const XY = i => [50 + 100 * (i % EXAMPLE.cols), 50 + 100 * Math.floor(i / EXAMPLE.cols)];
	function draw() {
		const { r, fs } = o.sizes();
		svg.replaceChildren(); tiles = []; lines = {};
		const gl = document.createElementNS(NS, 'g'); svg.append(gl);
		for (const [a, b] of EXAMPLE.edges) {
			const [x1, y1] = XY(a), [x2, y2] = XY(b);
			lines[g.ek(a, b)] = gl.appendChild(setAttrs(document.createElementNS(NS, 'line'), { x1, y1, x2, y2, class: 'ln' }));
		}
		traceG = svg.appendChild(document.createElementNS(NS, 'g'));
		EXAMPLE.letters.forEach((ch, i) => {
			const [x, y] = XY(i);
			const t = setAttrs(document.createElementNS(NS, 'g'), { class: 'tile' });
			t.append(setAttrs(document.createElementNS(NS, 'circle'), { cx: x, cy: y, r }));
			const tx = setAttrs(document.createElementNS(NS, 'text'), { x, y: y + 1, 'font-size': fs });
			tx.textContent = ch; t.append(tx);
			svg.append(t); tiles.push(t);
		});
	}
	function paint() {
		for (const [k, l] of Object.entries(lines)) l.classList.toggle('gone', !vis.edges.has(k));
		tiles.forEach((t, i) => { t.classList.toggle('gone', !vis.nodes.has(i)); t.classList.toggle('on', path.includes(i)); });
		traceG.replaceChildren();
		for (let k = 1; k < path.length; k++) {
			const [x1, y1] = XY(path[k - 1]), [x2, y2] = XY(path[k]);
			traceG.append(setAttrs(document.createElementNS(NS, 'line'), { x1, y1, x2, y2, class: 'tr' }));
		}
		const step = nextStep(G.found);
		const guide = root.querySelector('#tGuide');
		guide.innerHTML = '';
		const a = document.createElement('div'), b = document.createElement('small');
		a.textContent = step ? step.say : 'Gelöst!';
		b.textContent = line || (step ? step.more : '');
		a.append(b); guide.append(a);
		const w = root.querySelector('#tWord');
		if (path.length) { w.className = 'word trace'; w.textContent = g.word(G, path); } else { w.className = `word ${last.cls}`; w.textContent = last.w; }
		const left = Object.keys(EXAMPLE.targets).length - G.found.length;
		root.querySelector('#tLeft').textContent = left ? `Noch ${left} ${left === 1 ? 'Wort' : 'Wörter'}` : 'Gelöst!';
		const chip = (x, cls) => { const s = document.createElement('span'); s.className = `chip${cls}`; s.textContent = x; return s; };
		root.querySelector('#tChips').replaceChildren(...G.found.map(x => chip(x, '')), ...G.bonus.map(x => chip(x, ' b')));
	}

	function wire() {
		const pt = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; };
		const tileAt = (x, y) => {
			const c = Math.round((x - 50) / 100), r = Math.round((y - 50) / 100);
			if (c < 0 || c >= EXAMPLE.cols || r < 0 || r >= EXAMPLE.rows) return -1;
			const i = r * EXAMPLE.cols + c, [cx, cy] = XY(i);
			return Math.hypot(x - cx, y - cy) <= 40 ? i : -1;
		};
		svg.addEventListener('pointerdown', e => {
			if (G.solved) return;
			const [x, y] = pt(e), i = tileAt(x, y);
			if (i < 0 || !vis.nodes.has(i)) return;
			if (tapping) {
				const t = g.tap(vis, path, i);
				if (t.act === 'send') { tracing = true; finish(); return; }
				if (t.act === 'back' || t.act === 'add') { path = t.path; if (t.act === 'add') o.haptic('letter'); paint(); return; }
				tapping = false;
			}
			svg.setPointerCapture(e.pointerId);
			tracing = true; path = [i]; lastPt = [x, y]; line = '';
			o.haptic('letter'); paint();
		});
		svg.addEventListener('pointermove', e => {
			if (!tracing) return;
			const [x, y] = pt(e), [x0, y0] = lastPt;
			const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / 8)), before = path.length, was = path.join();
			for (let k = 1; k <= n; k++) path = g.extend(vis, path, tileAt(x0 + (x - x0) * k / n, y0 + (y - y0) * k / n)).path;
			lastPt = [x, y];
			if (path.length > before) o.haptic('letter');
			if (path.join() !== was) paint();
		});
		svg.addEventListener('pointerup', finish);
		svg.addEventListener('pointercancel', finish);
	}
	function finish() {
		if (!tracing) return;
		tracing = false;
		if (path.length === 1 && !tapping) { tapping = true; return; }
		const p = path.slice(); path = []; tapping = false;
		if (p.length === 1) { paint(); return; }
		const r = g.submit(G, p, performance.now());
		line = feedback(r.res, r.w);
		last = { w: r.w, cls: r.res === 'target' ? 'good' : r.res === 'bonus' ? 'bonus' : 'bad' };
		o.haptic(r.res === 'target' ? 'found' : r.res === 'bonus' ? 'bonus' : 'wrong');
		if (r.res === 'target') vis = g.visible(G);
		paint();
		if (r.solved) setTimeout(() => { if (root.contains(svg)) doneScreen(); }, 1200);
	}

	root.onclick = e => {
		const b = e.target.closest('[data-intro]');
		if (!b) return;
		if (b.dataset.intro === 'play') playScreen();
		else if (b.dataset.intro === 'done') o.done();
	};
	if (o.home) homeScreen(); else playScreen();
	return {
		/** the board again, after the text size changed */
		redraw() { if (svg && root.contains(svg)) { draw(); paint(); } },
		/** for tools/ui-check.mjs: the example game and a tile's centre on the page */
		game: () => G,
		tileXY(i) { const [x, y] = XY(i); const p = svg.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; },
	};
}
