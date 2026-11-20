#!/usr/bin/env python3
# themes.py — which words of themes.txt gen.py can use, and why the others not.
#	python3 gen/themes.py [--data ../wortnetz-private/gen]
import argparse, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen

ap = argparse.ArgumentParser()
ap.add_argument('--data', default=os.environ.get('WORTNETZ_DATA', os.path.join(HERE, '..', '..', 'wortnetz-private', 'gen')))
a = ap.parse_args()
gen.load(a.data)


def why(w):
	if w not in gen.LEX: return 'not in the lexicon'
	if gen.bad(w): return 'bad'
	r = gen.why_not_target(w, hand=True)
	if r: return r
	if not gen.form_ok(w): return 'no base form'
	return None


total = 0
for (name, window, words), (_, _, ok) in zip(gen.themes_file(os.path.join(HERE, 'themes.txt')), gen.THEMES):
	miss = [f'{w} ({why(w)})' for w in words if w not in ok]
	total += len(ok)
	print(f"{name}{' @' + '..'.join(window) if window else ''}: {len(ok)} usable"
		+ (', not: ' + ', '.join(miss) if miss else ''))
print(len(gen.THEMES), 'groups,', total, 'usable words,', len(gen.THEME), 'distinct')
