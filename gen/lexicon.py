# Build the German lexicon -> lexicon.tsv, one line a word:
# WORD  zipf_de  zipf_en  kind(base/infl/comp/name/enz)  stem  flags  src(e/h)
#	python3 gen/lexicon.py ../wortnetz-private/gen/package/index ../wortnetz-private/gen/words \
#		../wortnetz-private/gen/lexicon.tsv
#
# Which strings are words comes from a Scrabble-style list (enz/german-wordlist, CC0; its file
# `words` copied into the data folder): Duden-led, every inflected form, no names, places or
# abbreviations. It holds ~99.7% of the bonus words the 0.2 lexicon gave, and words igerman98
# lacks (ZEDER, MINZE, HUMMEL). src e: in that list.
# wordfreq gives each word its frequency; igerman98 Hunspell gives the stem and flags gen.py's
# rules read (base form, verb form, name), for the words in wordfreq's top 200,000 as before.
# A word of that top 200,000 that the list lacks is kept as src h, as the 0.2 lexicon had it:
# gen.py keeps it only where the list has a gap (a free compound Wiktionary has as a noun, a
# verb or adjective such as HINBEKOMMEN), not where the list left out a name (JAPAN, CHRISTIAN).
# kind enz: in the list, but no Hunspell reading (outside the top 200,000, or unknown to
# Hunspell): a bonus word, a target only as a Wiktionary noun lemma (gen.py).
# wordfreq folds ß into ss (straße -> strasse) and Hunspell knows only the ß spelling, so each ss
# is tried both ways (with one way only, the lexicon had no ß word, not even GROSS or STRASSE).
import itertools, re, sys, time
from wordfreq import top_n_list, zipf_frequency
from spylls.hunspell import Dictionary
from spylls.hunspell.algo.capitalization import Type as CT

d = Dictionary.from_files(sys.argv[1])
L = d.lookuper
WORD = re.compile(r'[a-zäöüß]{4,12}')


def is_name(stem, flags):
	if stem.isupper(): return True                          # abbreviations
	return stem[0].isupper() and set(flags) <= {'S'}   # Rudi/S, Michael/S


def spellings(w):
	"""w as wordfreq has it, then with each ss as ß (all combinations)"""
	n = w.count('ss')
	if not n: return [w]
	parts = w.split('ss')
	return [w] + [''.join(p + (c[i] if i < n else '') for i, p in enumerate(parts))
		for c in itertools.product(('ss', 'ß'), repeat=n) if 'ß' in c]


def reading(v):
	best = None
	for form, ct in ((v, CT.NO), (v.capitalize(), CT.INIT)):
		for f in L.affix_forms(form, captype=ct):
			e = f.in_dictionary
			if e is None: continue
			fl = ''.join(sorted(e.flags))
			if is_name(e.stem, e.flags): best = best or ('name', e.stem, fl); continue
			kind = 'base' if e.stem.lower() == v else 'infl'
			return (kind, e.stem, fl)
	return best


def hunspell(w, z):
	"""(kind, stem, flags) of wordfreq's spelling w, or None"""
	best = None
	for v in spellings(w):
		r = reading(v)
		if r and r[0] != 'name': return r
		best = best or r
	if best is None and z >= 2.5 and any(d.lookup(v) or d.lookup(v.capitalize()) for v in spellings(w)):
		return ('comp', '', '')
	return best


def up(s):
	return s.upper().replace('ß', 'SS')


t0 = time.time()
enz = {}                         # WORD -> the list's spellings (Zeder; Albert and albert)
with open(sys.argv[2], encoding='utf-8') as f:
	for l in f:
		s = l.strip()
		if WORD.fullmatch(s.lower()) and 4 <= len(up(s)) <= 12: enz.setdefault(up(s), []).append(s)
top = [w for w in top_n_list('de', 200000) if WORD.fullmatch(w)]
inTop = set(top)
out = open(sys.argv[3], 'w', encoding='utf-8')
n = {'e': 0, 'h': 0}


def write(W, z, ze, r, src):
	out.write(f'{W}\t{z:.2f}\t{ze:.2f}\t{r[0]}\t{r[1]}\t{r[2]}\t{src}\n'); n[src] += 1


for W in sorted(enz):
	sp = enz[W]
	wf = W.lower()                                 # wordfreq's spelling: ss, never ß
	z = max(zipf_frequency(s.lower(), 'de') for s in sp)
	ze = zipf_frequency(wf, 'en')
	r = hunspell(wf, z) if wf in inTop else None
	if r is None:
		stem = next((s for s in sp if s[:1].isupper()), sp[0])   # a noun's capital where the list has one
		r = ('enz', stem, '')
	write(W, z, ze, r, 'e')
for w in top:
	W = up(w)
	if W in enz: continue
	z = zipf_frequency(w, 'de')
	r = hunspell(w, z)
	if r is None: continue
	write(W, z, zipf_frequency(w, 'en'), r, 'h')
print(n['e'], 'words from the list,', n['h'], 'from wordfreq and Hunspell only,',
	round(time.time() - t0), 's', file=sys.stderr)
