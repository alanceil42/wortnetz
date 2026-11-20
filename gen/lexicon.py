# Build the German lexicon: wordfreq list x igerman98 Hunspell -> lexicon.tsv
# WORD  zipf_de  zipf_en  kind(base/infl/comp/name)  stem  flags
#	python3 gen/lexicon.py ../wortnetz-private/gen/package/index ../wortnetz-private/gen/lexicon.tsv
# wordfreq folds ß into ss (straße -> strasse) and Hunspell knows only the ß spelling, so each ss
# is tried both ways (with one way only, the lexicon had no ß word, not even GROSS or STRASSE).
import itertools, re, sys, time
from wordfreq import top_n_list, zipf_frequency
from spylls.hunspell import Dictionary
from spylls.hunspell.algo.capitalization import Type as CT

d = Dictionary.from_files(sys.argv[1])
L = d.lookuper
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


out = open(sys.argv[2], 'w')
n = 0; t0 = time.time()
for w in top_n_list('de', 200000):
	if not re.fullmatch(r'[a-zäöüß]{4,12}', w): continue
	z = zipf_frequency(w, 'de')
	best = None
	for v in spellings(w):
		r = reading(v)
		if r and r[0] != 'name': best = r; break
		best = best or r
	if best is None:
		if z >= 2.5 and any(d.lookup(v) or d.lookup(v.capitalize()) for v in spellings(w)): best = ('comp', '', '')
		else: continue
	up = w.upper().replace('ß', 'SS')
	ze = zipf_frequency(w, 'en')
	out.write(f'{up}\t{z:.2f}\t{ze:.2f}\t{best[0]}\t{best[1]}\t{best[2]}\n'); n += 1
print(n, 'words', round(time.time()-t0), 's', file=sys.stderr)
