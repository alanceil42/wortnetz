# Bonus words beyond the frequency list: every Hunspell form (no free compound, no name) the
# board traces. From generator 2; init() replaces its fixed paths.
import itertools

D = None
L = None
gen = None
_cache = {}


def init(dicpath, genmodule):
	"""load the igerman98 dictionary (package/index of dictionary-de) for the generator module"""
	global D, L, gen
	from spylls.hunspell import Dictionary
	D = Dictionary.from_files(dicpath)
	L = D.lookuper
	gen = genmodule


def known(w):
	"""w in capitals (SS for ß); True when Hunspell knows it as a stem with affixes, not a name"""
	from spylls.hunspell.algo.capitalization import Type as CT
	if w in _cache: return _cache[w]
	low = w.lower()
	variants = {low}
	n = low.count('ss')
	if n:
		parts = low.split('ss')
		for combo in itertools.product(('ss', 'ß'), repeat=n):
			variants.add(''.join(p + (combo[i] if i < n else '') for i, p in enumerate(parts)))
	ok = False
	for v in variants:
		for form, ct in ((v, CT.NO), (v.capitalize(), CT.INIT)):
			for f in L.affix_forms(form, captype=ct):
				e = f.in_dictionary
				if e is None: continue
				st = e.stem.upper().replace('ß', 'SS')
				if e.stem[:1].isupper() and set(e.flags) <= {'S'}: continue      # name
				if st in gen.NAMES: continue
				if set(e.flags) <= set('hij'): continue                          # compound part only
				ok = True; break
			if ok: break
		if ok: break
	_cache[w] = ok
	return ok


def extra(letters, edges, have):
	"""words of 4-12 letters along the lines that Hunspell knows and `have` lacks: {word: [paths]}"""
	adj = {i: [] for i in range(16)}
	for a, b in edges: adj[a].append(b); adj[b].append(a)
	out = {}
	def dfs(path, s):
		if len(s) >= 4 and s not in have and s not in gen.NAMES and not gen.bad(s) and known(s):
			out.setdefault(s, []).append(list(path))
		if len(path) >= 12: return
		for j in adj[path[-1]]:
			if j not in path:
				path.append(j); dfs(path, s + letters[j]); path.pop()
	for i in range(16): dfs([i], letters[i])
	return out
