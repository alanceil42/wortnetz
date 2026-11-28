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
		# GEB, NEHM: gib, nimm; ABHOL, ANGEH: separable; ÖFFN, RECHN: needs -e; MÖCHT, BRÄUCHT: no
		# imperative. The rule makes none of them (the word list has some as spoken first persons)
		imp = {x for x, stem in gen.short_imperatives()}
		for w in ('NEHM', 'ABHOL', 'ANGEH', 'MITBRING', 'ÖFFN', 'RECHN', 'MÖCHT', 'BRÄUCHT', 'BITT'):
			self.assertFalse(w in imp, w)
		for w in ('ÖFFN', 'RECHN'):
			self.assertFalse(w in gen.LEX, w)

	def test_allow_list(self):
		# found when traced, never targets: sailing words the word list lacks
		for w in ('BETING', 'VORSTAG', 'MEERRETTICH'):
			self.assertTrue(w in gen.LEX and w not in gen.TARGET, w)
		# LIEK (rejected on 2026-11-22) and its fellows are in the word list now
		for w in ('LIEK', 'BRIE', 'GAFFEL', 'KLAMPE', 'FIEREN', 'SEEMEILE'):
			self.assertTrue(w in gen.LEX, w)

	def test_four_letter_bonus_only(self):
		# 2026-11-22: GEIL, SOLI and others are words, never targets
		for w in ('GEIL', 'SOLI', 'KITA', 'LIES', 'USER', 'ORAL', 'SARG'):
			self.assertTrue(w in gen.LEX and w not in gen.TARGET, w)

	def test_bad_from_data(self):
		self.assertFalse(os.path.exists(os.path.join(HERE, 'disallow.txt')), 'disallow.txt belongs in the data folder')
		self.assertTrue(gen.bad('NAZI') and gen.bad('NAZIS'))
		self.assertFalse('NAZI' in gen.LEX)

	def test_bad_exact(self):
		# disallow-exact.txt: the word only, where a prefix would take real words with it
		self.assertFalse(os.path.exists(os.path.join(HERE, 'disallow-exact.txt')), 'it belongs in the data folder')
		self.assertTrue(gen.bad('ASSI') and gen.bad('TÜRK'))
		self.assertFalse(gen.bad('ASSISTENT') or gen.bad('TÜRKE') or gen.bad('FISTEL'))


class WordList(unittest.TestCase):
	# the Scrabble-style word list is the base (lexicon.py); wordfreq and Hunspell fill its gaps
	def test_words_hunspell_lacks(self):
		# ZEDER was rejected on 2026-11-28: igerman98 lacks it; the word list has it
		for w in ('ZEDER', 'MINZE', 'HUMMEL', 'REIHER', 'ILTIS', 'SCHLEHE'):
			self.assertTrue(w in gen.LEX, w)

	def test_rarer_simple_nouns(self):
		# simple nouns down to NOUN_FLOOR; compounds and other words keep 3.0
		for w in ('ZEDER', 'ILTIS', 'QUALLE', 'ERBSE'):
			self.assertTrue(w in gen.TARGET, w)
		self.assertLess(gen.LEX['ZEDER'][0], 3.0)

	def test_names_the_list_lacks_or_holds(self):
		# not in the list: no word (JAPAN, EUROPA, CHRISTIAN were targets of 0.2)
		for w in ('JAPAN', 'EUROPA', 'CHRISTIAN', 'JOHANN'):
			self.assertFalse(w in gen.LEX, w)
		# in the list, but Wiktionary has them only as names
		for w in ('LAURA', 'SEEHOFER', 'SOLINGEN'):
			self.assertFalse(w in gen.LEX, w)

	def test_gaps_of_the_list(self):
		# the list lacks some verbs and attested compounds; the 0.2 lexicon's reading stays
		for w in ('HINBEKOMMEN', 'APFELKUCHEN'):
			self.assertTrue(w in gen.TARGET, w)

	def test_inflections_from_the_list(self):
		# every form is a word; targets stay base forms
		for w in ('ZEDERN', 'SCHWÄCHST', 'BEKUNDE'):
			self.assertTrue(w in gen.LEX and w not in gen.TARGET, w)

	def test_pick_weight(self):
		# off by default; on, common words weigh 1 and rare ones fade out
		self.assertEqual(gen.pick_weight(1.0), 1.0)
		sd, gen.PICK_SD = gen.PICK_SD, 0.4
		try:
			self.assertGreater(gen.pick_weight(4.0), 0.99)
			self.assertAlmostEqual(gen.pick_weight(gen.PICK_MID), 0.5)
			self.assertLess(gen.pick_weight(1.5), 0.01)
		finally:
			gen.PICK_SD = sd


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


class Preview(unittest.TestCase):
	"""gen/preview.py: fresh boards apart from puzzles/, a site copy, the server"""
	PUZZLES = os.path.join(HERE, '..', 'puzzles')

	def snapshot(self):
		import hashlib
		return {fn: hashlib.sha1(open(os.path.join(self.PUZZLES, fn), 'rb').read()).hexdigest()
			for fn in sorted(os.listdir(self.PUZZLES))}

	def test_boards_and_site(self):
		import datetime, json, tempfile, hunbonus, preview
		hunbonus.init(os.path.join(DATA, 'package', 'index'), gen)
		before = self.snapshot()
		tries, gen.MAX_TRIES = gen.MAX_TRIES, 150
		try:
			today = datetime.date(2027, 3, 2)
			batch = preview.make_batch(2, 7, self.PUZZLES, today=today, log=lambda s: None)
			again = preview.make_batch(2, 7, self.PUZZLES, today=today, log=lambda s: None)
		finally:
			gen.MAX_TRIES = tries
		self.assertEqual([d['date'] for d in batch['days']], ['2027-03-01', '2027-03-02'])
		self.assertEqual([d['id'] for d in batch['days']], [d['id'] for d in again['days']])   # a seed, the same boards
		avoid, pairs = preview.used(self.PUZZLES)
		for d in batch['days']:
			self.assertNotIn(d['headline'], avoid)             # no real day's headline shown early
			self.assertFalse(gen.pairs_of(d['theme']['words']) & pairs)
		srv = tempfile.mkdtemp()
		site = preview.write_site(srv, batch)
		site = preview.write_site(srv, batch)                  # a second run replaces the first
		self.assertEqual(sorted(os.listdir(srv)), ['wortnetz'])
		idx = json.load(open(os.path.join(site, 'puzzles', 'index.json'), encoding='utf-8'))
		self.assertEqual(idx['batches'], [{'file': 'batch-2027-03-01.json', 'start': '2027-03-01', 'days': 2}])
		self.assertEqual(sorted(os.listdir(os.path.join(site, 'puzzles'))), ['batch-2027-03-01.json', 'index.json'])
		# not archived: the worker runs as "dev", network first, so a new board shows on reload
		self.assertIn("'$Format:%h$'", open(os.path.join(site, 'sw.js'), encoding='utf-8').read())
		for f in ('index.html', 'src/ui/app.js', 'vendor/xxl-scorer/src/ui/debug.js', 'icons/icon-192.png'):
			self.assertTrue(os.path.isfile(os.path.join(site, f)), f)
		# the recorder: in the copy only, before the page's script; the repository's page has none
		html = open(os.path.join(site, 'index.html'), encoding='utf-8').read()
		self.assertIn('<script src="preview-record.js"></script>\n' + preview.APP_TAG, html)
		self.assertIn(preview.RECORD_PATH, open(os.path.join(site, 'preview-record.js'), encoding='utf-8').read())
		self.assertNotIn('preview-record', open(os.path.join(HERE, '..', 'index.html'), encoding='utf-8').read())
		self.assertEqual(self.snapshot(), before)               # puzzles/ untouched
		# --show: a recorded game on a preview board, word by word; games on other boards left out
		boards = os.path.join(srv, 'boards.json'); record = os.path.join(srv, 'record.json')
		preview.remember(boards, batch)
		d = batch['days'][1]; w = sorted(d['targets'])[0]
		json.dump({'games': [{'puzzle': 'b00000000000', 'events': []}, {'puzzle': d['id'], 'startedAt': '2027-03-02T10:00:00Z',
			'events': [{'t': 0, 'ty': 'start'}, {'t': 4200, 'ty': 'word', 'w': w, 'res': 'target', 'path': [0, 1, 2, 3]},
				{'t': 9000, 'ty': 'hint', 'w': w, 'k': 1}]}], 'current': {}}, open(record, 'w', encoding='utf-8'))
		text = preview.show(preview.fetch_json(1, preview.RECORD_PATH, record), preview.fetch_json(1, preview.BOARDS_PATH, boards))
		self.assertTrue(text.startswith(f"2027-03-02 {d['id']}"), text)
		self.assertIn(f'0:04  {w}', text)
		self.assertIn('0:09  hint', text)
		self.assertNotIn(f' {w} ', text.split('not found:')[1] + ' ')
		self.assertNotIn('b00000000000', text)

	def test_server(self):
		import tempfile, threading, urllib.error, urllib.request, preview
		srv = tempfile.mkdtemp()
		os.makedirs(os.path.join(srv, 'wortnetz', 'src'))
		open(os.path.join(srv, 'wortnetz', 'src', 'a.js'), 'w').write('export {};\n')
		record = os.path.join(srv, 'record.json')
		s = preview.make_server(srv, 0, 'right', record)
		t = threading.Thread(target=s.serve_forever); t.start()
		base = f'http://127.0.0.1:{s.server_address[1]}'
		try:
			with urllib.request.urlopen(base + '/wortnetz/src/a.js') as r:
				self.assertEqual(r.headers['Content-Type'], 'text/javascript')   # module scripts need it
				self.assertEqual(r.headers['Cache-Control'], 'no-cache')
			# the record: only from the page's own origin, only JSON
			post = lambda body, origin: urllib.request.urlopen(urllib.request.Request(base + preview.RECORD_PATH,
				data=body, method='POST', headers={'Origin': origin}))
			self.assertEqual(post(b'{"games": []}', base).status, 204)
			self.assertEqual(open(record).read(), '{"games": []}')
			# read back through the server: --show works from a shell with another temp folder
			port = s.server_address[1]
			self.assertEqual(preview.fetch_json(port, preview.RECORD_PATH, None), {'games': []})
			with self.assertRaises(urllib.error.HTTPError) as e: urllib.request.urlopen(base + preview.BOARDS_PATH)
			self.assertEqual(e.exception.code, 404)                  # no boards.json yet
			for body, origin, code in ((b'{"x": 1}', 'http://elsewhere.example', 403), (b'{"x": 1}', None, 403), (b'not json', base, 400)):
				with self.assertRaises(urllib.error.HTTPError) as e:
					post(body, origin) if origin else urllib.request.urlopen(urllib.request.Request(base + preview.RECORD_PATH, data=body, method='POST'))
				self.assertEqual(e.exception.code, code)
			self.assertEqual(open(record).read(), '{"games": []}')
			stop = lambda tok: urllib.request.urlopen(urllib.request.Request(base + preview.STOP_PATH, data=tok, method='POST'))
			with self.assertRaises(urllib.error.HTTPError) as e: stop(b'wrong')
			self.assertEqual(e.exception.code, 403)
			self.assertEqual(stop(b'right').status, 204)
			t.join(5)
			self.assertFalse(t.is_alive())
		finally:
			if t.is_alive(): s.shutdown()
			s.server_close()


if __name__ == '__main__':
	unittest.main(verbosity=1)
