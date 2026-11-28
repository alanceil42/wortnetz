#!/usr/bin/env python3
# check.py — the batches in puzzles/ against the lexicon and today's word lists:
# - generator 4 batches (0.2 on): every target allowed by today's rules (an easy board's
#   headline: its two parts are), every board with 2-3 words of one theme group as targets,
#   no word of disallow.txt anywhere, no bonusonly.txt word as a target, consecutive days
# - all batches together: no headline twice, no pair of theme words twice, and index.json
#   lists every batch file, without overlapping days
# - days before gen/rules-from.txt's date (and 0.1's batch) were made under older rules and stay
#   as played: their dates, headlines and theme pairs are checked, their words only reported
# - --bonus (about 5 minutes): every bonus list from the rules date on is what today's lists give
#   (after a list change, gen.py --rebonus brings them in step)
#	python3 gen/check.py [puzzles/batch-*.json ...] [--data ../wortnetz-private/gen] [--bonus]
import argparse, datetime, glob, itertools, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen

ap = argparse.ArgumentParser()
ap.add_argument('files', nargs='*')
ap.add_argument('--data', default=os.environ.get('WORTNETZ_DATA', os.path.join(HERE, '..', '..', 'wortnetz-private', 'gen')))
ap.add_argument('--bonus', action='store_true', help="also the bonus lists against today's lists (slow)")
a = ap.parse_args()
gen.load(a.data)
PUZ = os.path.join(HERE, '..', 'puzzles')
files = a.files or sorted(glob.glob(os.path.join(PUZ, 'batch-*.json')))
bad = 0; notes = 0
FROM = gen.rules_from()   # the first day the word rules hold for


def fail(msg):
	global bad
	print(msg); bad += 1


# allow.txt: found when traced, a bonus word, never a target; a board of their own shows it,
# since a batch may never trace them
letters = list('BETINGVORSTAGXXX')
found = gen.trace(letters, {(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (6, 7), (7, 8), (8, 9), (9, 10),
	(10, 11), (11, 12)})
for w in ('BETING', 'VORSTAG'):
	if w not in found or w in gen.TARGET:
		fail(f'allow list: {w} is not a bonus word')

groups = {name: set(words) for name, window, words in gen.themes_file(os.path.join(HERE, 'themes.txt'))}
heads, pairs = {}, {}
for fn in files:
	b = json.load(open(fn, encoding='utf-8'))
	g4 = b.get('gen', '') >= 'g4'
	start = datetime.date.fromisoformat(b['start'])
	for k, d in enumerate(b['days']):
		day = d['date']
		if g4 and day != str(start + datetime.timedelta(days=k)):
			fail(f'{day}: day {k} of the batch should be {start + datetime.timedelta(days=k)}')
		ruled = g4 and day >= FROM
		h = d['headline']
		if h in heads: fail(f'{day}: headline {h} again (first {heads[h]})')
		heads[h] = day
		th = d.get('theme')
		if th:
			for p in itertools.combinations(sorted(th['words']), 2):
				if p in pairs: fail(f'{day}: theme pair {p[0]}+{p[1]} again (first {pairs[p]})')
				pairs[p] = day
		elif ruled:
			fail(f'{day}: no theme')
		for w in list(d['targets']) + list(d['bonus']):
			if ruled and gen.bad(w): fail(f'{day}: {w} matches disallow.txt or disallow-exact.txt')
		for w in ('BRICHT', 'TRAF', 'GALT', 'EICH', 'ALTMARK', 'JAHRE', 'DINGE', 'GESETZE', 'GESETZES'):
			if w in d['targets'] and ruled: fail(f'{day}: {w} is a target')
		if not ruled:
			for w in d['targets']:
				if w in gen.STOP or (w in gen.LEX and w not in gen.TARGET and w != h):
					notes += 1
			continue
		if th:
			ws = th['words']
			if th['group'] not in groups: fail(f'{day}: theme group {th["group"]} not in themes.txt')
			elif not 2 <= len(ws) <= 3 or not set(ws) <= groups[th['group']] or not set(ws) <= set(d['targets']):
				fail(f'{day}: theme {th["group"]} {ws}: not 2-3 of its words as targets')
			elif sorted(w for w in d['targets'] if w in groups[th['group']]) != sorted(ws):
				fail(f'{day}: theme {th["group"]}: recorded {ws}, the board has more of its words')
		for w in d['targets']:
			if d.get('easy') and w == h:
				if w in gen.STOP or w in gen.NAMES: fail(f'{day}: headline {w} is on bonusonly.txt or names.txt')
				parts = gen.split_compound(w)
				if not parts or parts[0] not in d['targets'] or parts[2] not in d['targets']:
					fail(f'{day}: headline {w} without its parts')
				continue
			if w in gen.STOP: fail(f'{day}: {w} is on bonusonly.txt')
			elif w not in gen.LEX: fail(f'{day}: {w} not in the lexicon')
			elif w not in gen.TARGET: fail(f"{day}: {w} is no target now ({gen.why_not_target(w) or 'not a base form'})")
	old = sum(1 for d in b['days'] if not (g4 and d['date'] >= FROM))
	print(f"{os.path.basename(fn)}: {len(b['days'])} days checked" + (f' ({old} as played: words reported only)' if old else ''))

# --bonus: the stored bonus lists against today's lists
if a.bonus:
	import hunbonus
	hunbonus.init(os.path.join(a.data, 'package', 'index'), gen)
	for fn in files:
		b = json.load(open(fn, encoding='utf-8'))
		if b.get('gen', '') < 'g4': continue
		off = 0
		for d in b['days']:
			if d['date'] < FROM: continue
			want = set(gen.bonus_words(d['letters'], {tuple(e) for e in d['edges']}, d['targets']))
			if want != set(d['bonus']):
				off += 1
				if off <= 5: fail(f"{d['date']}: bonus list off: +{sorted(want - set(d['bonus']))} -{sorted(set(d['bonus']) - want)}")
		if off > 5: fail(f'{os.path.basename(fn)}: {off - 5} more days with a bonus list off; gen.py --rebonus')
		print(f'{os.path.basename(fn)}: bonus lists checked')

# index.json: every batch file, by start, no overlap
idx = json.load(open(os.path.join(PUZ, 'index.json'), encoding='utf-8'))['batches']
names = sorted(os.path.basename(f) for f in glob.glob(os.path.join(PUZ, 'batch-*.json')))
if sorted(i['file'] for i in idx) != names: fail(f'index.json lists {[i["file"] for i in idx]}, the folder has {names}')
end = None
for i in sorted(idx, key=lambda i: i['start']):
	b = json.load(open(os.path.join(PUZ, i['file']), encoding='utf-8'))
	if len(b['days']) != i['days']: fail(f"index.json: {i['file']} has {len(b['days'])} days, not {i['days']}")
	s = datetime.date.fromisoformat(i['start'])
	if end and s <= end: fail(f"index.json: {i['file']} starts {s}, the batch before ends {end}")
	end = s + datetime.timedelta(days=i['days'] - 1)
if notes: print(f"note: {notes} targets of days as played would not be targets under today's rules")
print('check:', 'FAILED' if bad else 'OK', bad, 'problems')
sys.exit(1 if bad else 0)
