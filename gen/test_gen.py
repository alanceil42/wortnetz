#!/usr/bin/env python3
# test_gen.py — the generator's rules; needs the private data (--data or
# WORTNETZ_DATA, default ../wortnetz-private/gen). Run by tools/test.sh.
#	python3 gen/test_gen.py
import os, subprocess, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen

DATA = os.environ.get('WORTNETZ_DATA', os.path.join(HERE, '..', '..', 'wortnetz-private', 'gen'))
gen.load(DATA)


class Targets(unittest.TestCase):
	def test_base_forms_in(self):
		# nouns Hunspell stores as stem + ending
		for w in ('MEINUNG', 'WOHNUNG', 'ZEITUNG', 'KUPPLUNG', 'AUGE', 'KATZE', 'NOTE', 'MARKE'):
			self.assertTrue(w in gen.TARGET, w)

	def test_plurals_and_inflections_out(self):
		for w in ('JAHRE', 'DINGE', 'GESETZE', 'GESETZES', 'HÜTE', 'GRÜNDE', 'THEMEN', 'ÄSTE', 'KÜHE',
				'SCHIFFE', 'BRICHT', 'TRAF', 'GALT', 'EICH'):
			self.assertFalse(w in gen.TARGET, w)

	def test_verb_forms_listed_as_nouns_out(self):
		# Wiktionary lists them as nouns too, Hunspell reads them as verb or adjective forms
		for w in ('SCHAUTE', 'FÜHRE', 'NEUE', 'DEUTSCHE', 'NICHTS'):
			self.assertFalse(w in gen.TARGET, w)

	def test_infinitives_that_are_plurals_stay(self):
		# TRAGEN, WARTEN are also some noun's plural; the verb wins
		for w in ('TRAGEN', 'WARTEN', 'SUCHEN', 'FÜHREN'):
			self.assertTrue(w in gen.TARGET, w)

	def test_sharp_s_words(self):
		# wordfreq folds ß into ss; the lexicon tries both (lexicon.py)
		for w in ('STRASSE', 'GROSS', 'FUSS', 'WEISS'):
			self.assertTrue(w in gen.LEX, w)
		for w in ('STRASSE', 'FUSS'):
			self.assertTrue(w in gen.TARGET, w)

	def test_participles(self):
		# without Hunspell's adjective flag too (0.2); infinitives in GE- stay
		for w in ('GEKLICKT', 'GEGUCKT', 'GEHOLFEN', 'NACHGEGANGEN', 'ANGEDACHT'):
			self.assertFalse(w in gen.TARGET, w)
		for w in ('GEHÖREN', 'GEWINNEN', 'GESTATTEN', 'BEKANNT', 'GESUND'):
			self.assertTrue(w in gen.TARGET, w)

	def test_zu_infinitives(self):
		# a rule instead of bonusonly.txt entries; hinzu- verbs of their own stay
		for w in ('ANZULEGEN', 'ABZUSEHEN', 'AUFZUHÖREN', 'ZUZUGEBEN', 'HINZUZUFÜGEN'):
			self.assertFalse(w in gen.TARGET, w)
		for w in ('HINZUGEBEN', 'HINZUKOMMEN', 'ANZUG', 'AUSZUG'):
			self.assertTrue(w in gen.TARGET, w)

	def test_names(self):
		self.assertTrue('FREUDE' in gen.TARGET)            # read as Freud + e, a noun all the same
		for w in ('PRAGER', 'LONDONER', 'BERLINS', 'JOHANNES', 'DARMSTADT', 'BODENSEE'):
			self.assertFalse(w in gen.LEX, w)
		self.assertFalse('BACHMANN' in gen.TARGET)     # a compound Wiktionary lacks: a bonus word at most

	def test_compounds(self):
		self.assertTrue('BLEISTIFT' in gen.TARGET)         # a compound Wiktionary has
		for w in ('BAHNHOFS', 'FACHKRÄFTEN', 'ZEITRAUMS', 'MITGLIEDERN'):
			self.assertFalse(w in gen.TARGET, w)

	def test_compound_parts_out(self):
		# igerman98 keeps Zeige-, Sende- as compound parts; 0.1 took them for stems
		for w in ('ZEIGE', 'SENDE', 'WERBE', 'PUNKTE', 'TEILE', 'GEISTER', 'ALTEN'):
			self.assertFalse(w in gen.TARGET, w)

	def test_short_imperatives(self):
		# bonus words, never targets (0.2.2): LIEG was rejected on 2026-11-22
		for w in ('LIEG', 'BEKOMM', 'VERLIER', 'TRENN', 'LERN'):
			self.assertTrue(w in gen.LEX and w not in gen.TARGET, w)
		# GEB, NEHM: gib, nimm; ABHOL, ANGEH: separable; ÖFFN, RECHN: needs -e; MÖCHT, BRÄUCHT: no imperative
		for w in ('NEHM', 'ABHOL', 'ANGEH', 'MITBRING', 'ÖFFN', 'RECHN', 'MÖCHT', 'BRÄUCHT', 'BITT'):
			self.assertFalse(w in gen.LEX, w)

	def test_allow_list(self):
		# found when traced, never targets: LIEK on 2026-11-22, sailing words with it
		for w in ('LIEK', 'BRIE', 'GAFFEL', 'KLAMPE', 'FIEREN', 'SEEMEILE'):
			self.assertTrue(w in gen.LEX and w not in gen.TARGET, w)

	def test_four_letter_bonus_only(self):
		# 2026-11-22: GEIL, SOLI and others are words, never targets
		for w in ('GEIL', 'SOLI', 'KITA', 'LIES', 'USER', 'ORAL', 'SARG'):
			self.assertTrue(w in gen.LEX and w not in gen.TARGET, w)

	def test_bad_from_data(self):
		self.assertFalse(os.path.exists(os.path.join(HERE, 'disallow.txt')), 'disallow.txt belongs in the data folder')
		self.assertTrue(gen.bad('NAZI') and gen.bad('NAZIS'))
		self.assertFalse('NAZI' in gen.LEX)


class Themes(unittest.TestCase):
	def test_groups(self):
		self.assertGreaterEqual(len(gen.THEMES), 50)
		for name, window, words in gen.THEMES:
			self.assertGreaterEqual(len(words), 8, name)
			self.assertLessEqual(len(words), 14, name)

	def test_theme_words_are_targets(self):
		self.assertTrue(gen.THEME <= gen.TARGET)
		for w in ('TULPE', 'MÖWE', 'DÜNE', 'BUCHE'):         # rare, or a verb form first: by hand
			self.assertTrue(w in gen.THEME, w)

	def test_windows(self):
		import datetime
		w = dict((n, win) for n, win, ws in gen.THEMES)['Advent']
		self.assertTrue(gen.in_window(w, datetime.date(2026, 12, 3)))
		self.assertFalse(gen.in_window(w, datetime.date(2027, 1, 3)))
		self.assertTrue(gen.in_window(('12-01', '02-28'), datetime.date(2027, 1, 3)))


class Seeds(unittest.TestCase):
	def test_same_seed_same_board(self):
		# tries only, no wall time; and no dependence on Python's hash seed
		ids = []
		for hs in ('1', '2'):
			env = dict(os.environ, PYTHONHASHSEED=hs, MAX_TRIES='300')
			out = subprocess.run([sys.executable, os.path.join(HERE, 'gen.py'), '--board', '501', '--data', DATA],
				capture_output=True, text=True, env=env, check=True).stdout
			ids.append(out.split('"id": "')[1][:11])
		self.assertEqual(ids[0], ids[1])

	def test_redo_changes_only_its_day(self):
		# after a list fix only the days with a slip get new boards
		import json, tempfile
		out = tempfile.mkdtemp()
		env = dict(os.environ, MAX_TRIES='150')
		g = [sys.executable, os.path.join(HERE, 'gen.py'), '--data', DATA, '--out', out]
		subprocess.run(g + ['--days', '3', '--start', '2030-03-02'], capture_output=True, env=env, check=True)
		f = os.path.join(out, 'batch-2030-03-02.json')
		before = json.load(open(f, encoding='utf-8'))['days']
		subprocess.run(g + ['--redo', '2030-03-03'], capture_output=True, env=env, check=True)
		after = json.load(open(f, encoding='utf-8'))['days']
		self.assertEqual([d['id'] for d in after][::2], [d['id'] for d in before][::2])
		self.assertNotEqual(after[1]['id'], before[1]['id'])
		self.assertEqual(after[1]['redo'], 1)
		self.assertEqual(after[1]['theme']['group'], before[1]['theme']['group'])
		self.assertEqual(len({d['headline'] for d in after}), 3)


if __name__ == '__main__':
	unittest.main(verbosity=1)
