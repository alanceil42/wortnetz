#!/usr/bin/env python3
# wortnetz generator 4: a batch of daily puzzles.
#
#	python3 gen/gen.py --days 365 --start 2026-11-26           writes puzzles/batch-2026-11-26.json
#	                   [--out puzzles] [--data ../wortnetz-private/gen] [--seed 1]
#	python3 gen/gen.py --board 501 [--theme Auto]               one themed board, printed (a probe)
#	python3 gen/gen.py --redo 2027-01-05,2027-03-02             new boards for these days only (after
#	                                                            a list fix; the other days stay)
#
# What changed for 0.2 (generator 4):
# - a board is the best of MAX_TRIES tries, no wall time: a seed always gives the same board
# - themes: every board places 2-3 words of one group from themes.txt first, then fills;
#   theme words are targets even when rare; the group and its words are kept per board
# - no headline twice and no pair of theme words twice across all batches in --out, not only
#   within one; a new batch cuts the earlier batches at its start
# - disallow.txt is read from the data folder (private), like the lexicon
# - base forms: nouns.tsv (nouns.py, from Wiktionary) says which words
#   are noun lemmas (AUGE, KATZE, MEINUNG) and which only plurals (GESETZE, HÜTE, THEMEN);
#   Hunspell stores AUGE as Aug + e exactly like GESETZE as Gesetz + e
# - no zu-infinitive as a target (ANZULEGEN); easy days skip a compound that already failed
#
# Generator 3 (0.1):
# Grown from generator 2, a prototype. What changed for 0.1:
# - one JSON per batch, one puzzle per day from --start; puzzles/index.json lists the batches
# - each board's id is a hash of its letters and lines (g2-302 once named two boards)
# - easy boards ("a nice breather"): about two a week, never on two days in a row, each
#   with a 12-16 letter compound as its headline whose two parts are targets too
# - no inflected verb form as a target (BRICHT, TRAF, GALT: igerman98 stores strong-verb forms as
#   stems of their own); the imperative rule no longer needs form + T in wordfreq (EICH: EICHT
#   isn't in its top 200,000, so the old rule never fired)
# - allow.txt: bonus words the lexicon lacks (BRIE, DART, LEIN), never targets
# - each target carries what the page's expected time needs: z (Zipf) and fam (its stem's family)
#
# Data (--data, or WORTNETZ_DATA): lexicon.tsv (lexicon.py), nounstems.txt, lowstems.txt,
# nouns.tsv (nouns.py), disallow.txt and the igerman98 dictionary in package/ (npm pack
# dictionary-de@3.0.0). The other word lists and themes.txt are here in gen/.
import argparse, datetime, hashlib, itertools, json, os, random, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_TRIES = int(os.environ.get('MAX_TRIES', 1000))  # board attempts per board (no wall time: a seed always gives the same board)
CAP = 300            # placements enumerated per word (randomised DFS, then best by reuse)
N = 4
GEN = 'g4'
MIN_GAP = 28         # days before a theme group comes back (a seasonal one: SEASON_GAP)
SEASON_GAP = 6
EASY_PROBE = 250     # an easy board's pairing of headline and group is dropped if these tries keep none

DATA = None
LEX = {}             # WORD -> (zipf_de, zipf_en, kind, stem, flags)
NAMES = STOP = BAD = NOUNS = LOWS = ALLOW = LEMMA = PLURAL = set()
TARGET = set(); PRE = set(); POOL = []; SEEDS = []; LONG = []
THEMES = []          # (name, window or None, [usable words]); window = ('MM-DD', 'MM-DD')
THEME = set()        # every usable theme word


def wordfile(path):
	try:
		with open(path, encoding='utf-8') as f:
			return {w for l in f for w in l.split('#')[0].upper().split()}
	except FileNotFoundError:
		return set()


def bad(w):
	return any(w.startswith(b) for b in BAD)


def namelike(w):
	z, ze, kind, stem, flags = LEX[w]
	return stem[:1].isupper() and set(flags) <= set('SmR')


def up(s):
	return s.upper().replace('ß', 'SS')


def verbform(w):
	"""an inflected verb form igerman98 keeps as a stem of its own: fand/Z, galt/VZ, bricht/VXW"""
	z, ze, kind, stem, flags = LEX[w]
	f = set(flags)
	return bool(stem[:1].islower() and f and f <= set("EVWXZ") and f & set("VWXZ") and w not in NOUNS)


def imperative(w):
	"""a verb stem used as imperative or first person: STEH, SETZ, EICH (eichen), WANDER"""
	z, ze, kind, stem, flags = LEX[w]
	if kind != 'infl' or not stem[:1].islower() or w.endswith('E') or w in NOUNS:
		return False
	if w.endswith('ER') and w[:-2] in LEX:
		return False                                   # a comparative (MILDER)
	st = up(stem)
	if st.endswith('EN') and w == st[:-2]:
		return True                                    # eichen -> EICH (not needing EICHT)
	if re.search('[LR]N$', st) and w == st[:-1]:
		return True                                    # wandern -> WANDER
	return (w + 'T') in LEX and LEX[w + 'T'][3] == stem   # the old rule, still right where it fires


SEP = ('', 'AB', 'AN', 'AUF', 'AUS', 'BEI', 'DAR', 'EIN', 'FEST', 'HER', 'HIN', 'MIT', 'NACH', 'UM',
	'VOR', 'WEG', 'ZU', 'ZURÜCK', 'ÜBER', 'DURCH')


def participle(w):
	"""a past participle: GELEBT, GELEISTET, ZUGETRAUT, BEMERKT (Hunspell keeps them as adjectives),
	and since 0.2 also without the adjective flag: GEKLICKT, GEGUCKT, GEHOLFEN, NACHGEGANGEN"""
	z, ze, kind, stem, flags = LEX[w]
	if not stem[:1].islower():
		return False
	def verb(v):
		return v in LEX and LEX[v][2] == 'base' and LEX[v][3][:1].islower()
	for pre in SEP:
		r = w[len(pre):]
		if not w.startswith(pre) or not r.startswith('GE') or len(r) < 5: continue
		r = r[2:]
		if r.endswith('ET') and verb(pre + r[:-2] + 'EN'): return True
		if r.endswith('T') and (verb(pre + r[:-1] + 'EN') or verb(pre + r[:-1] + 'N')): return True
		if r.endswith('EN') and len(r) >= 5 and 'I' not in flags: return True   # strong: GEHOLFEN; not GEWINNEN (an infinitive, flag I)
	if w[:2] in ('BE', 'ER', 'GE', 'VE', 'ZE', 'EN') and w.endswith('T'):
		if verb(w[:-1] + 'EN') or (w.endswith('ET') and verb(w[:-2] + 'EN')): return True
	return False


def zu_infinitive(w):
	"""a zu-infinitive Hunspell keeps as a stem of its own: ANZULEGEN, ABZUSEHEN, ZUZUGEBEN (0.2,
	189 targets); not a verb of its own in HINZU- (hinzugeben, hinzukommen: flag I)"""
	z, ze, kind, stem, flags = LEX[w]
	if 'I' in flags or not stem[:1].islower(): return False
	for pre in SEP[1:]:
		if w.startswith(pre + 'ZU') and len(w) > len(pre) + 4:
			v = pre + w[len(pre) + 2:]
			if v.endswith('N') and v in LEX and LEX[v][2] == 'base' and LEX[v][3][:1].islower(): return True
	return False


def plural(w):
	"""a noun plural Hunspell keeps as a stem for compounds: THEMEN, KONTEN, FIRMEN, MEDIEN, NAMEN"""
	z, ze, kind, stem, flags = LEX[w]
	if not stem[:1].isupper() or not w.endswith('N') or w in LEMMA: return False   # SAMEN, DRACHEN
	sing = [w[:-2] + 'A', w[:-2] + 'O', w[:-2] + 'UM', w[:-1]] if w.endswith('EN') else [w[:-1]]
	return any(s != w and s in NOUNS and s in LEX and LEX[s][2] == 'base' for s in sing)


def why_not_target(w, hand=False):
	"""None when w may be a target; hand: a word picked by hand (a theme word), which
	may be rare or an English loan"""
	z, ze, kind, stem, flags = LEX[w]
	if w in ALLOW and kind == 'allow': return 'allow'
	if w in STOP: return 'stop'
	if namelike(w) and ze >= 3.0 and w not in LEMMA: return 'name?'
	if not hand and z < 3.0 + (0.3 if len(w) == 4 else 0): return 'rare'
	if not hand and ze - z >= 1.0: return 'english'
	if verbform(w): return 'verbform'
	if imperative(w): return 'imperative'
	if participle(w): return 'participle'
	if zu_infinitive(w): return 'zu-infinitive'
	if plural(w): return 'plural'
	return None


def form_ok(w):
	"""base forms only"""
	z, ze, kind, stem, flags = LEX[w]
	# a noun plural that is no lemma (GESETZE; HÜTE, THEMEN, which Hunspell keeps as stems), unless
	# it is also a verb or adjective in its base form (TRAGEN, WARTEN: DIE TRAGEN is no noun of ours)
	if w in PLURAL and w not in LEMMA and not (kind == 'base' and stem[:1].islower()) \
		and not (w in LOWS and w not in NOUNS): return False
	if kind == 'base': return True
	# a free compound only when Wiktionary has it as a noun lemma: the frequency list also holds
	# inflected compounds (BAHNHOFS, FACHKRÄFTEN) and compound names (DARMSTADT, BACHMANN)
	if kind == 'comp': return w in LEMMA
	# lexicon.tsv keeps only Hunspell's first reading: SCHRAUBE came out as a form of schrauben,
	# but it is also the noun Schraube. A word that is itself a noun stem is a base form. (0.1 also
	# took any lowercase stem: that let in compound parts like ZEIGE- and plurals like PUNKTE.)
	if w in NOUNS: return True
	# a noun lemma Hunspell stores as a noun stem + ending: AUGE (Aug + e), KATZE, MEINUNG (Meinen +
	# ung); not a verb or adjective form Wiktionary also lists as a noun (SCHAUTE, FÜHRE, NEUE), and
	# not the plural of a noun that is a lemma itself (SCHIFFE, ZELTE)
	if w not in LEMMA or not stem[:1].isupper(): return False
	return not (w in PLURAL or w[:-1] == up(stem) or w[:-2] == up(stem)) or up(stem) not in LEMMA


def fold(s):
	return s.upper().translate(str.maketrans('ÄÖÜ', 'AOU'))


def family(w):
	stem = LEX[w][3] if w in LEX else ''
	return fold(stem or w)[:5]


def load(data):
	"""the lexicon and the word lists; data is the folder with lexicon.tsv and friends"""
	global DATA, NAMES, STOP, BAD, NOUNS, LOWS, ALLOW, LEMMA, PLURAL, TARGET, PRE, POOL, SEEDS, THEMES, THEME
	DATA = data
	for need in ('lexicon.tsv', 'nounstems.txt', 'lowstems.txt', 'nouns.tsv', 'disallow.txt'):
		if not os.path.exists(os.path.join(data, need)):
			sys.exit(f'gen.py: {need} missing in {data} (--data)')
	NAMES = wordfile(os.path.join(HERE, 'names.txt'))   # not a word at all
	STOP = wordfile(os.path.join(HERE, 'bonusonly.txt'))     # a word, but no target (bonus only)
	BAD = wordfile(os.path.join(data, 'disallow.txt'))       # vulgar or slur: no word, nor any word starting with it
	ALLOW = wordfile(os.path.join(HERE, 'allow.txt'))   # bonus words the lexicon lacks
	NOUNS = wordfile(os.path.join(data, 'nounstems.txt'))
	LOWS = wordfile(os.path.join(data, 'lowstems.txt'))
	LEMMA, PLURAL, wnames = set(), set(), set()
	with open(os.path.join(data, 'nouns.tsv'), encoding='utf-8') as f:
		for line in f:
			w, k = line.split()
			{'L': LEMMA, 'P': PLURAL, 'N': wnames}[k].add(w)
	LEX.clear()
	with open(os.path.join(data, 'lexicon.tsv'), encoding='utf-8') as f:
		for line in f:
			w, z, ze, kind, stem, flags = line.rstrip('\n').split('\t')
			if kind == 'name' or len(w) > 16 or w in NAMES or bad(w): continue
			if kind == 'comp' and w in wnames: continue          # DARMSTADT, BODENSEE: a name, no word
			# BERLINS, PRAGER (a name and its -er), but FREUDE (Freud + e) is a noun
			if up(stem) in NAMES and (w not in LEMMA or w == up(stem) + 'ER'): continue
			LEX[w] = (float(z), float(ze), kind, stem, flags)
	for w in ALLOW:
		if w not in LEX and not bad(w): LEX[w] = (0.0, 0.0, 'allow', w.capitalize(), '')
	TARGET = {w for w in LEX if why_not_target(w) is None and form_ok(w)}
	THEMES, THEME = [], set()
	for name, window, words in themes_file(os.path.join(HERE, 'themes.txt')):
		ok = [w for w in words if theme_ok(w)]
		THEMES.append((name, window, ok)); THEME |= set(ok)
	TARGET |= THEME
	PRE = {w[:i] for w in LEX for i in range(1, len(w))}
	POOL = sorted(w for w in TARGET if 4 <= len(w) <= 9)
	SEEDS = sorted(w for w in POOL if 7 <= len(w) <= 9 and LEX[w][0] >= 3.3)


def themes_file(path):
	"""themes.txt: one group a line, 'Name: WORD WORD ...' or 'Name @MM-DD..MM-DD: ...' for a
	group that only comes in that window of the year"""
	out = []
	with open(path, encoding='utf-8') as f:
		for l in f:
			l = l.split('#')[0].strip()
			if not l: continue
			name, ws = l.split(':', 1)
			m = re.fullmatch(r'(.+?)\s*@(\d\d-\d\d)\.\.(\d\d-\d\d)', name.strip())
			window = (m.group(2), m.group(3)) if m else None
			out.append(((m.group(1) if m else name).strip(), window, ws.upper().split()))
	return out


def theme_ok(w):
	"""a theme word is a target if the lexicon has it as a base form and only its frequency
	or an English count would keep it out (TULPE, MÖWE)"""
	return w in LEX and not bad(w) and why_not_target(w, hand=True) is None and (form_ok(w) or w in LEMMA)


def in_window(window, day):
	if not window: return True
	md = day.strftime('%m-%d')
	a, b = window
	return a <= md <= b if a <= b else (md >= a or md <= b)


# ---------- easy boards: a long compound whose parts are targets ----------
LINKS = ('', 'S', 'N', 'EN', 'ES', 'E', 'ER')


def split_compound(w):
	"""(first, link, head) when w is first + link + head, both parts targets of 4+ letters"""
	for i in range(4, len(w) - 3):
		a = w[:i]
		for link in LINKS:
			b = w[i + len(link):] if w[i:i + len(link)] == link else None
			if b and len(b) >= 4 and a in TARGET and b in TARGET and b in NOUNS:
				return a, link, b
	return None


def umlaut_plural(b):
	"""PLÄTZE, KRÄFTE, LÄNDER: an umlaut plural whose singular is a noun stem (Hunspell keeps
	some umlaut plurals as stems of their own, as HÜTE)"""
	for i in range(len(b) - 1, -1, -1):
		if b[i] in 'ÄÖÜ':
			s = b[:i] + {'Ä': 'A', 'Ö': 'O', 'Ü': 'U'}[b[i]] + b[i + 1:]
			return any(s.endswith(e) and s[:len(s) - len(e)] in NOUNS for e in ('E', 'ER'))
	return False


def long_compounds(dic):
	"""12-16 letter nouns from wordfreq (Zipf >= 2.5) that Hunspell takes capitalised only, split
	into two target parts. The wordfreq and Hunspell part is cached in DATA/long.tsv (wordfreq is
	needed once); the rules are applied on every run, so the cache doesn't go stale with them."""
	cache = os.path.join(DATA, 'long.tsv')
	if os.path.exists(cache):
		with open(cache, encoding='utf-8') as f:
			first = f.readline()
		if not first.startswith('# raw'): os.remove(cache)        # 0.1's cache held filtered words
	if not os.path.exists(cache):
		from wordfreq import top_n_list, zipf_frequency
		raw = []
		for w in top_n_list('de', 300000):
			if not re.fullmatch(r'[a-zäöü]{12,16}', w): continue      # no ß: SS would make it longer
			z = zipf_frequency(w, 'de')
			if z < 2.5: continue
			# a noun: Hunspell takes it capitalised only (adverbs, verbs, adjectives also lowercase)
			if not dic.lookup(w.capitalize()) or dic.lookup(w): continue
			raw.append((w.upper(), z))
		with open(cache, 'w', encoding='utf-8') as f:
			f.write('# raw: 12-16 letter wordfreq nouns, Hunspell capitalised only (gen.py long_compounds)\n')
			f.writelines(f'{w}\t{z:.2f}\n' for w, z in raw)
	with open(cache, encoding='utf-8') as f:
		raw = [(l.split('\t')[0], float(l.split('\t')[1])) for l in f if l.strip() and not l.startswith('#')]
	out = []
	for W, z in raw:
		if bad(W) or W in STOP or W in NAMES: continue
		parts = split_compound(W)
		if not parts: continue
		h = LEX[parts[2]]
		if h[2] != 'base' or not h[3][:1].isupper() or up(h[3]) != parts[2] or umlaut_plural(parts[2]): continue   # head: a noun in its base form
		if W not in LEMMA: continue                                  # a compound Wiktionary has (no DARMSTADT)
		out.append((W, z))
	return out


# ---------- the board ----------
NB = []
for i in range(N * N):
	r, c = divmod(i, N)
	NB.append([(r + dr) * N + c + dc for dr in (-1, 0, 1) for dc in (-1, 0, 1)
		if (dr or dc) and 0 <= r + dr < N and 0 <= c + dc < N])


def E(a, b):
	return (a, b) if a < b else (b, a)


def placements(word, letters, edges, need_reuse, rng):
	res = []
	def dfs(path, k):
		if len(res) >= CAP: return
		if k == len(word):
			reused = sum(1 for i in path if letters[i] is not None)
			if need_reuse and reused == 0: return
			olde = sum(1 for a, b in zip(path, path[1:]) if E(a, b) in edges)
			res.append((reused, len(path) - reused, olde, list(path))); return
		cand = list(NB[path[-1]]) if path else list(range(N * N))
		rng.shuffle(cand)
		for i in cand:
			if i in path: continue
			if letters[i] is None or letters[i] == word[k]:
				path.append(i); dfs(path, k + 1); path.pop()
	dfs([], 0)
	return res


def build(rng, seed):
	letters = [None] * (N * N); edges = set(); placed = []
	p = placements(seed, letters, edges, False, rng)
	if not p: return None
	path = p[0][3]
	for i, ch in zip(path, seed): letters[i] = ch
	edges |= {E(a, b) for a, b in zip(path, path[1:])}; placed.append(seed)
	tries = 0
	while None in letters and tries < 3000:
		tries += 1
		w = rng.choice(POOL)
		if w in placed: continue
		p = [x for x in placements(w, letters, edges, True, rng) if x[1] >= 1]
		if not p: continue
		p.sort(key=lambda x: (-x[0], -x[2], rng.random()))
		path = p[0][3]
		for i, ch in zip(path, w): letters[i] = ch
		edges |= {E(a, b) for a, b in zip(path, path[1:])}; placed.append(w)
	if None in letters: return None
	return letters, edges


def trace(letters, edges):
	adj = {i: [] for i in range(N * N)}
	for a, b in edges: adj[a].append(b); adj[b].append(a)
	found = {}
	def dfs(path, s):
		if len(s) >= 4 and s in LEX: found.setdefault(s, []).append(list(path))
		if s not in PRE: return
		for j in adj[path[-1]]:
			if j not in path:
				path.append(j); dfs(path, s + letters[j]); path.pop()
	for i in range(N * N): dfs([i], letters[i])
	return found


def evaluate(letters, edges, extra=()):
	"""targets: every traceable target word (plus `extra`, an easy board's headline); lines no
	target uses are dropped and the search repeated"""
	for _ in range(4):
		found = trace(letters, edges)
		targets = {w: p for w, p in found.items() if w in TARGET or w in extra}
		used = set()
		for ps in targets.values():
			for p in ps: used |= {E(a, b) for a, b in zip(p, p[1:])}
		if used == edges: break
		edges = used
	nodes = {i for ps in targets.values() for p in ps for i in p}
	bonus = {w: p for w, p in found.items() if w not in targets}
	return edges, targets, bonus, nodes


def score(targets, bonus):
	fams = {}
	for w in targets: fams[family(w)] = fams.get(family(w), 0) + 1
	big = max(fams.values())
	n7 = sum(1 for w in targets if len(w) >= 7)
	head = max(len(w) for w in targets)
	return (- 6 * abs(len(targets) - 14) - 5 * max(0, n7 - 3) + (4 if head >= 9 else 0)
		+ 2 * min(len(bonus), 6) + 3 * len(fams) - 4 * max(0, big - len(targets) // 3))


def board_id(letters, edges):
	s = ''.join(letters) + ';' + ','.join(f'{a}-{b}' for a, b in sorted(edges))
	return 'b' + hashlib.sha1(s.encode('utf-8')).hexdigest()[:10]


def place(word, letters, edges, rng, min_new=1):
	"""put word on the board along its best placement (most reuse, then most old lines);
	False when it doesn't fit"""
	p = [x for x in placements(word, letters, edges, False, rng) if x[1] >= min_new]
	if not p: return False
	p.sort(key=lambda x: (-x[0], -x[2], rng.random()))
	path = p[0][3]
	for i, ch in zip(path, word): letters[i] = ch
	edges |= {E(a, b) for a, b in zip(path, path[1:])}
	return True


def pairs_of(words):
	return {tuple(sorted(p)) for p in itertools.combinations(words, 2)}


def themed_build(rng, words, pairs, headline=None):
	"""Themes, as measured before they were built in: 2 or 3 words of the group first
	(an easy board: after its headline), then the fill as build() does"""
	letters = [None] * (N * N); edges = set(); placed = []
	if headline:
		if not place(headline, letters, edges, rng, 0): return None
		placed.append(headline)
	have = [w for w in words if headline and w in split_compound(headline)[::2]]   # KERZE in KERZENSCHEIN
	rest = [w for w in words if w not in have]
	k = max(1, rng.choice((2, 3)) - len(have)) if len(words) >= 3 else max(1, 2 - len(have))
	if len(rest) < k: return None
	for _ in range(20):
		pick = rng.sample(rest, k)
		if not pairs_of(pick + have) & pairs: break
	else:
		return None
	for w in pick:
		if not place(w, letters, edges, rng, 0 if headline else 1): return None
		placed.append(w)
	tries = 0
	while None in letters and tries < 3000:
		tries += 1
		w = rng.choice(POOL)
		if w in placed: continue
		if place(w, letters, edges, rng): placed.append(w)
	if None in letters: return None
	return letters, edges


def need(word, head):
	"""letters word needs beyond those of head (an easy board's headline)"""
	have = list(head); n = 0
	for ch in word:
		if ch in have: have.remove(ch)
		else: n += 1
	return n


def easy_words(group, head):
	"""the group's words that fit next to head: they need no more letters than the cells left"""
	return [w for w in group[2] if need(w, head) <= N * N - len(head)]


def board(seed, group, avoid=frozenset(), pairs=frozenset(), headline=None, place_words=None):
	"""the best of MAX_TRIES tries with 2-3 words of group (name, window, words) as targets.
	avoid: headlines already used (all batches); pairs: theme-word pairs already used;
	headline: an easy board's long compound, placed first; place_words: the group words to
	place (default all)"""
	rng = random.Random(seed); t0 = time.time()
	best = None; tries = 0; kept = 0
	name, window, words = group
	extra = set()
	if headline:
		extra = {headline}
		for i in range(1, len(headline)): PRE.add(headline[:i])
	while tries < MAX_TRIES:
		if headline and tries == EASY_PROBE and not kept: break   # this pairing won't come good
		tries += 1
		b = themed_build(rng, place_words or words, pairs, headline)
		if not b: continue
		letters, edges = b
		edges, targets, bonus, nodes = evaluate(letters, edges, extra)
		if len(nodes) < N * N or not (12 <= len(targets) <= 16): continue
		if max(len(w) for w in targets) < 7: continue
		th = sorted(w for w in targets if w in words)
		if not 2 <= len(th) <= 3 or pairs_of(th) & pairs: continue
		if not headline and max(targets, key=lambda w: (len(w), w)) in avoid: continue   # no headline twice
		if headline:
			parts = split_compound(headline)
			if headline not in targets or not parts or parts[0] not in targets or parts[2] not in targets: continue
		kept += 1
		s = score(targets, bonus)
		if not best or s > best[0]: best = (s, letters, edges, targets, bonus, th)
	if not best: return None, tries, kept, time.time() - t0
	s, letters, edges, targets, bonus, th = best
	import hunbonus
	for w, ps in hunbonus.extra(letters, edges, set(targets) | set(bonus)).items(): bonus[w] = ps
	head = headline or max(targets, key=lambda w: (len(w), w))
	return {
		'id': board_id(letters, edges), 'seed': seed, 'score': s, 'easy': bool(headline), 'headline': head,
		'theme': {'group': name, 'words': th},
		'letters': letters, 'edges': sorted(list(e) for e in edges),
		'targets': {w: {'z': round(LEX[w][0] if w in LEX else HEADZ.get(w, 0.0), 2), 'fam': family(w), 'paths': p}
			for w, p in sorted(targets.items())},
		'bonus': sorted(bonus),
	}, tries, kept, time.time() - t0


HEADZ = {}   # an easy board's headline: its wordfreq Zipf (the lexicon stops at 12 letters)


def easy_days(n, rng, per_week=2):
	"""which day indexes get an easy board: per_week in each 7 days, never two days in a row"""
	days = set()
	for w0 in range(0, n, 7):
		span = list(range(w0, min(n, w0 + 7)))
		k = round(per_week * len(span) / 7)
		for _ in range(200):
			pick = sorted(rng.sample(span, k)) if k <= len(span) else span
			ok = all(b - a >= 2 for a, b in zip(pick, pick[1:])) and not (pick and pick[0] - 1 in days)
			if ok: days |= set(pick); break
	return days


def ranked_groups(day, last, order):
	"""the theme groups for day, best first: a group in its window that has rested longest
	against its gap (MIN_GAP, a seasonal one SEASON_GAP); last: name -> date last used;
	order: name -> rank among groups never used (random, from the batch seed).
	A group never used counts as rested twice its gap, so a seasonal group used once in its
	window comes back before all unused groups are through (run 4: Advent once in its 27 days);
	a seasonal group never used comes first on its window's first day"""
	def key(g):
		name, window, words = g
		gap = SEASON_GAP if window else MIN_GAP
		if name in last: r = (day - last[name]).days / gap
		else: r = 1e9 if window else 2.0 - order[name] / 1000
		return (-r, order[name])
	return sorted((g for g in THEMES if in_window(g[1], day) and len(g[2]) >= 2), key=key)


def batches(out):
	"""every batch file in out: [(file name, batch)] by start date"""
	res = []
	for fn in sorted(os.listdir(out)):
		if re.fullmatch(r'batch-\d{4}-\d{2}-\d{2}\.json', fn):
			with open(os.path.join(out, fn), encoding='utf-8') as f:
				res.append((fn, json.load(f)))
	return res


def redo(a, dates):
	"""new boards for the given days only, inside their batch (after a list fix: every other
	day keeps its board and id). A redone day keeps its theme group (and an easy day its
	headline when that still works) and avoids every other day's headline and theme pairs in
	all batches; its seed is the day's seed with the redo count, recorded as 'redo'"""
	import hunbonus
	all_b = batches(a.out)
	want = set(dates)
	hit = [(fn, b) for fn, b in all_b if want & {d['date'] for d in b['days']}]
	if len(hit) != 1: sys.exit(f'gen.py --redo: the days must lie in one batch (found {len(hit)})')
	fn, batch = hit[0]
	if want - {d['date'] for d in batch['days']}: sys.exit(f'gen.py --redo: {sorted(want)} not all in {fn}')
	avoid, pairs = set(), set()
	for _, b in all_b:
		for d in b['days']:
			if d['date'] in want: continue
			avoid.add(d['headline'])
			if d.get('easy') and split_compound(d['headline']): avoid |= set(split_compound(d['headline'])[::2])
			if d.get('theme'): pairs |= pairs_of(d['theme']['words'])
	longs = [w for w, z in long_compounds(hunbonus.D) if len(w) <= 14]
	for w, z in long_compounds(hunbonus.D): HEADZ[w] = z
	groups = {g[0]: g for g in THEMES}
	for i, d in enumerate(batch['days']):
		if d['date'] not in want: continue
		day = datetime.date.fromisoformat(d['date'])
		n = d.get('redo', 0) + 1
		seed = int(hashlib.sha1(f"{batch['seed']}-{day}-redo{n}".encode()).hexdigest()[:8], 16)
		g = groups.get(d.get('theme', {}).get('group'))
		b = None
		if g and d.get('easy'):
			# the same headline if it is still fine, else other compounds in a seeded order, at most 20
			rest = [w for w in longs if w != d['headline']]
			random.Random(seed).shuffle(rest)
			attempts = 0
			for w in ([d['headline']] if d['headline'] in longs else []) + rest:
				parts = split_compound(w)
				if w in avoid or not parts: continue
				fit = [x for x in easy_words(g, w) if x not in parts[::2]] + [x for x in g[2] if x in parts[::2]]
				if len(fit) < 2: continue
				attempts += 1
				b, tries, kept, dt = board(seed, g, avoid | set(parts[::2]), pairs, headline=w, place_words=fit)
				if b or attempts >= 20: break
		for gg in ([g] if g else []) + [x for x in THEMES if x is not g and in_window(x[1], day) and len(x[2]) >= 2]:
			if b: break
			for s2 in range(seed, seed + 3):
				b, tries, kept, dt = board(s2, gg, avoid, pairs)
				if b: break
		if not b: sys.exit(f'{day}: no board for the redo')
		b['date'] = d['date']; b['redo'] = n
		batch['days'][i] = b
		avoid.add(b['headline'])
		if b['easy']: avoid |= set(split_compound(b['headline'])[::2])
		pairs |= pairs_of(b['theme']['words'])
		print(f"{day} redo {n}: {d['id']} -> {b['id']}{' easy' if b['easy'] else ''} [{b['theme']['group']}: "
			f"{' '.join(b['theme']['words'])}] {len(b['targets'])} targets | "
			+ ' '.join(sorted(b['targets'], key=lambda w: (-len(w), w))), flush=True)
	write_json(os.path.join(a.out, fn), batch, separators=(',', ':'))
	print('wrote', fn, flush=True)


def write_json(path, obj, **kw):
	with open(path + '.part', 'w', encoding='utf-8') as f:
		json.dump(obj, f, ensure_ascii=False, **kw)
		if kw.get('indent'): f.write('\n')
	os.replace(path + '.part', path)


def main():
	ap = argparse.ArgumentParser(description='wortnetz generator 4')
	ap.add_argument('--days', type=int, default=365)
	ap.add_argument('--start', help='first day, YYYY-MM-DD (Europe/Berlin)')
	ap.add_argument('--out', default=os.path.join(HERE, '..', 'puzzles'))
	ap.add_argument('--data', default=os.environ.get('WORTNETZ_DATA', os.path.join(HERE, '..', '..', 'wortnetz-private', 'gen')))
	ap.add_argument('--seed', type=int, default=1, help='the batch seed (boards, themes and easy days follow from it)')
	ap.add_argument('--board', type=int, help='probe: one themed board with this seed, printed')
	ap.add_argument('--theme', help="the probe's theme group (default: one picked by the seed)")
	ap.add_argument('--redo', help='YYYY-MM-DD,...: new boards for these days only, in their batch')
	a = ap.parse_args()
	load(a.data)
	sys.path.insert(0, HERE)
	import hunbonus
	hunbonus.init(os.path.join(a.data, 'package', 'index'), sys.modules[__name__])
	if a.redo:
		redo(a, [s.strip() for s in a.redo.split(',') if s.strip()])
		return
	if a.board is not None:
		groups = [g for g in THEMES if len(g[2]) >= 2]
		g = next((g for g in groups if g[0] == a.theme), None) if a.theme else groups[a.board % len(groups)]
		if not g: sys.exit(f'no theme group {a.theme}')
		b, tries, kept, dt = board(a.board, g)
		print(json.dumps(b, ensure_ascii=False)[:2000] if b else 'no board', tries, kept, round(dt, 1))
		return
	start = datetime.date.fromisoformat(a.start)
	name = f'batch-{start}.json'
	out = os.path.join(a.out, name)
	os.makedirs(a.out, exist_ok=True)
	# earlier batches: cut at our start (their days from here on are replaced), and what
	# they used: headlines, theme pairs, when each group came last
	avoid, pairs, last = set(), set(), {}
	for fn, b in batches(a.out):
		if fn == name: continue
		if b['start'] >= str(start):
			sys.exit(f'gen.py: {fn} starts on or after {start}; remove it first')
		keep = [d for d in b['days'] if d['date'] < str(start)]
		if len(keep) < len(b['days']):
			print(f'{fn}: cut to {len(keep)} days (was {len(b["days"])}), the rest is replaced', flush=True)
			b['days'] = keep
			write_json(os.path.join(a.out, fn), b, separators=(',', ':'))
		for d in keep:
			avoid.add(d['headline'])
			th = d.get('theme')
			if th:
				pairs |= pairs_of(th['words'])
				last[th['group']] = datetime.date.fromisoformat(d['date'])
	rng = random.Random(f'{a.seed}-{start}')
	easy = easy_days(a.days, rng)
	names = [g[0] for g in THEMES]; rng.shuffle(names)
	order = {n: i for i, n in enumerate(names)}
	longs = [(w, z) for w, z in long_compounds(hunbonus.D) if len(w) <= 14]
	for w, z in longs: HEADZ[w] = z
	rng.shuffle(longs)
	days, heads, spent = [], set(), set()
	for k in range(a.days):
		day = start + datetime.timedelta(days=k)
		seed = int(hashlib.sha1(f'{a.seed}-{day}'.encode()).hexdigest()[:8], 16)
		b = None
		groups = ranked_groups(day, last, order)
		if k in easy:
			# an easy board: the next long compound with one of the first groups whose words fit
			# into its letters (2-4 cells are left), at most 40 attempts, else a normal board.
			# A compound that gave no board with any of its groups is spent: later easy days go on
			# from the next one (run 3 retried the same few on every easy day: 3 easy boards in 19)
			attempts = 0
			for w, z in longs:
				if w in heads or w in avoid or w in spent: continue
				parts = split_compound(w)[::2]
				# first the groups one of its parts belongs to (KERZENSCHEIN: Advent), then the others
				own = [g for g in groups[:20] if set(parts) & set(g[2])]
				whole = True
				for g in own + [g for g in groups[:8] if g not in own]:
					fit = [x for x in easy_words(g, w) if x not in parts] + [x for x in g[2] if x in parts]
					if len(fit) < 2: continue
					attempts += 1
					b, tries, kept, dt = board(seed, g, avoid | set(split_compound(w)[::2]), pairs, headline=w, place_words=fit)
					if b: break
					if attempts >= 40: whole = False; break
				if b:
					heads.add(w); break
				if whole: spent.add(w)
				if attempts >= 40:
					print(f'{day}: no easy board in 40 attempts, a normal one', flush=True); break
		for g in groups:
			if b: break
			for s2 in range(seed, seed + 3):
				b, tries, kept, dt = board(s2, g, avoid, pairs)
				if b: break
			if not b: print(f'{day}: group {g[0]} gave no board', flush=True)
		if not b: sys.exit(f'{day}: no board in any group')
		avoid.add(b['headline'])
		if b['easy']: avoid |= set(split_compound(b['headline'])[::2])
		pairs |= pairs_of(b['theme']['words'])
		last[b['theme']['group']] = day
		b['date'] = str(day)
		days.append(b)
		print(f"{day} {b['id']}{' easy' if b['easy'] else ''} [{b['theme']['group']}: {' '.join(b['theme']['words'])}] "
			f"{len(b['targets'])} targets, {len(b['bonus'])} bonus, {tries} tries, {kept} kept, {dt:.0f} s | "
			+ ' '.join(sorted(b['targets'], key=lambda w: (-len(w), w))), flush=True)
		batch = {'v': 1, 'kind': 'wortnetz-batch', 'gen': GEN, 'seed': a.seed, 'start': str(start),
			'made': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), 'days': days}
		with open(out + '.part', 'w', encoding='utf-8') as f:
			json.dump(batch, f, ensure_ascii=False, separators=(',', ':'))
	os.replace(out + '.part', out)
	# the index the page reads: every batch file in the folder, by start date
	idx = [{'file': fn, 'start': b['start'], 'days': len(b['days'])} for fn, b in batches(a.out)]
	write_json(os.path.join(a.out, 'index.json'), {'v': 1, 'batches': idx}, indent='\t')
	print('wrote', out, 'and index.json', flush=True)


if __name__ == '__main__':
	main()
