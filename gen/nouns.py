#!/usr/bin/env python3
# nouns.py — which words are German noun lemmas and which are only noun plurals, from
# Wiktionary's noun table (pip package german-nouns 1.2.5, CC BY-SA 4.0). Writes nouns.tsv into
# the data folder, read by gen.py's base-form rule:
#	WORD <tab> L     a common noun's lemma (AUGE, KATZE, MEINUNG, LEUTE)
#	WORD <tab> P     the nominative plural of a common noun, and no lemma itself (GESETZE, HÜTE)
#	WORD <tab> N     a name (place, first name, surname, other proper name), no common noun:
#	                 DARMSTADT, BACHMANN, STOCKHOLM, which the lexicon took for free compounds
#
#	pip install --no-deps german-nouns==1.2.5      (only its CSV is used; the deps need lxml)
#	python3 gen/nouns.py [--data ../wortnetz-private/gen]
#
# Why: igerman98 stores AUGE as Aug + e, exactly as it stores GESETZE as Gesetz + e (same flags),
# so Hunspell alone can't tell a singular in -e from a plural in -e; Wiktionary can.
import argparse, csv, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
# rows that are no common noun: places, names, abbreviations, multi-word entries, affixes
NOT_COMMON = {'Toponym', 'Vorname', 'Nachname', 'Eigenname', 'Abkürzung', 'Straßenname',
	'Buchstabe', 'Symbol', 'Affix', 'Suffix', 'Gebundenes Lexem', 'Wortverbindung',
	'Redewendung', 'Geflügeltes Wort', 'Grußformel', 'Zahlklassifikator', 'Deklinierte Form',
	'adjektivische Deklination'}   # VERDÄCHTIGER, UNSCHULDIGE: adjective forms, not base forms
NAME = {'Toponym', 'Vorname', 'Nachname', 'Eigenname', 'Straßenname'}
WORD = re.compile(r'[A-ZÄÖÜ]{2,16}')


def up(s):
	return s.strip().upper().replace('ß', 'SS')


def main():
	ap = argparse.ArgumentParser(description='noun lemmas and plurals from german-nouns')
	ap.add_argument('--data', default=os.environ.get('WORTNETZ_DATA', os.path.join(HERE, '..', '..', 'wortnetz-private', 'gen')))
	a = ap.parse_args()
	import german_nouns
	src = os.path.join(list(german_nouns.__path__)[0], 'nouns.csv')   # a namespace package: no __file__
	lem, plu, names = set(), set(), set()
	with open(src, encoding='utf-8') as f:
		for row in csv.DictReader(f):
			pos = {p.strip() for p in row['pos'].split(',')}
			if pos & NAME:
				w = up(row['lemma'])
				if WORD.fullmatch(w): names.add(w)
			if 'Substantiv' not in pos or pos & NOT_COMMON: continue
			w = up(row['lemma'])
			if WORD.fullmatch(w): lem.add(w)
			for k, v in row.items():
				if k and k.startswith('nominativ plural') and v:
					p = up(v)
					if WORD.fullmatch(p): plu.add(p)
	out = os.path.join(a.data, 'nouns.tsv')
	with open(out, 'w', encoding='utf-8') as f:
		for w in sorted(lem): f.write(f'{w}\tL\n')
		for w in sorted(plu - lem): f.write(f'{w}\tP\n')
		for w in sorted(names - lem - plu): f.write(f'{w}\tN\n')
	print(f'{out}: {len(lem)} lemmas, {len(plu - lem)} plurals only, {len(names - lem - plu)} names')


if __name__ == '__main__':
	main()
