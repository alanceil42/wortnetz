// The first run's example puzzle: the name on two rows,
// played with the real game (./game.js) but without a clock. WORT across the top, NETZ backwards
// along the bottom, ORTEN through the slanted line, then WORTNETZ round the whole net; ORTE is an
// Extrawort.
//
//	W O R T        0 1 2 3
//	Z T E N        4 5 6 7

export const EXAMPLE = Object.freeze({
	id: 'example',
	date: null,
	cols: 4,
	rows: 2,
	letters: ['W', 'O', 'R', 'T', 'Z', 'T', 'E', 'N'],
	edges: [[0, 1], [1, 2], [2, 3], [3, 7], [6, 7], [5, 6], [4, 5], [3, 6]],
	targets: {
		WORT: { paths: [[0, 1, 2, 3]] },
		NETZ: { paths: [[7, 6, 5, 4]] },
		ORTEN: { paths: [[1, 2, 3, 6, 7]] },
		WORTNETZ: { paths: [[0, 1, 2, 3, 7, 6, 5, 4]] },
	},
	bonus: ['ORTE'],
});

/**
 * The guide above the board, one step per target in this order: what to do, and a second line.
 * Any order works; the guide shows the first step whose word is still open.
 */
export const STEPS = [
	{ w: 'WORT', say: 'Zieh den Finger von W bis T.', more: 'Dann loslassen.' },
	{ w: 'NETZ', say: 'Jetzt antippen: N, E, T, Z.', more: 'Zum Abschicken das Z noch einmal antippen.' },
	{ w: 'ORTEN', say: 'Ein Wort quer durch beide Reihen, mit O vorn.', more: 'Es hat 5 Buchstaben. Die schräge Linie hilft.' },
	{ w: 'WORTNETZ', say: 'Zum Schluss das ganze Netz, von W bis Z.', more: 'Buchstaben bleiben, solange ein Wort sie noch braucht.' },
];

/** what the guide says after a word: the second line, by the answer */
export function feedback(res, w) {
	if (res === 'target') {
		if (w === 'WORT') return 'Das W bleibt: WORTNETZ braucht es noch.';
		if (w === 'ORTEN') return 'Die schräge Linie ist weg: kein Wort braucht sie mehr.';
		return '';
	}
	if (res === 'bonus') return `${w} ist ein Extrawort: Im echten Rätsel zieht es 10 Sekunden von der Uhr ab.`;
	if (res === 'short') return 'Ein Wort hat mindestens 4 Buchstaben.';
	if (res === 'dup') return 'Das hast du schon gefunden.';
	return 'Das ist keins der gesuchten Wörter.';
}

/** the step to show: the first whose word isn't found yet (null: all found) */
export const nextStep = found => STEPS.find(s => !found.includes(s.w)) || null;
