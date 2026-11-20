#!/usr/bin/env python3
# words.py — the reading tool: every target and bonus word of a batch, sorted, with how
# many boards hold it, so each one can be read before a batch ships.
#
#	python3 gen/words.py puzzles/batch-2026-11-26.json                 all targets, then all bonus words
#	                     [--kind targets|bonus|headlines|themes]       one kind only
#	                     [--seen read.txt] [--mark]                    skip words in read.txt; --mark adds
#	                                                                   the words shown to it
#	python3 gen/words.py puzzles/batch-2026-11-26.json --where BORDELL  the boards a word is on
#
# A word is shown as WORD or WORD:n (n boards), wrapped at 100 characters.
import argparse, collections, json, os, sys, textwrap


def main():
	ap = argparse.ArgumentParser(description='read every word of a batch')
	ap.add_argument('batch')
	ap.add_argument('--kind', choices=('targets', 'bonus', 'headlines', 'themes'))
	ap.add_argument('--seen', help='a file of words already read (one or more a line)')
	ap.add_argument('--mark', action='store_true', help='add the words shown to --seen')
	ap.add_argument('--where', help='list the boards this word is on')
	a = ap.parse_args()
	b = json.load(open(a.batch, encoding='utf-8'))
	if a.where:
		w = a.where.upper()
		for d in b['days']:
			kind = 'target' if w in d['targets'] else 'bonus' if w in d['bonus'] else None
			if kind:
				print(d['date'], d['id'], kind, d.get('theme', {}).get('group', '-'), '|',
					' '.join(sorted(d['targets'], key=lambda x: (-len(x), x))))
		return
	seen = set()
	if a.seen and os.path.exists(a.seen):
		with open(a.seen, encoding='utf-8') as f:
			seen = {x for l in f for x in l.split()}
	kinds = {
		'targets': lambda d: d['targets'],
		'bonus': lambda d: d['bonus'],
		'headlines': lambda d: [d['headline']],
		'themes': lambda d: [f"{d['theme']['group']}:{'+'.join(d['theme']['words'])}"] if d.get('theme') else [],
	}
	shown = []
	for kind in ([a.kind] if a.kind else ['targets', 'bonus']):
		c = collections.Counter(w for d in b['days'] for w in kinds[kind](d))
		ws = sorted(w for w in c if w not in seen or kind in ('headlines', 'themes'))
		print(f'== {kind}: {len(ws)} words' + (f' (of {len(c)}, the rest read before)' if len(ws) < len(c) else ''))
		print(textwrap.fill(' '.join(w if c[w] == 1 else f'{w}:{c[w]}' for w in ws), 100))
		if kind in ('targets', 'bonus'): shown += ws
	if a.mark and a.seen:
		with open(a.seen, 'a', encoding='utf-8') as f:
			f.write(textwrap.fill(' '.join(shown), 100) + '\n')


if __name__ == '__main__':
	main()
