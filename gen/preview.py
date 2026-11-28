#!/usr/bin/env python3
# preview.py — a fresh board to play on this computer, before it is ever in a batch.
#
#	python3 gen/preview.py [--days N] [--easy] [--seed S] [--port 8003] [--data ...]
#	python3 gen/preview.py --stop
#
# Makes N new boards (default 1) with today's generator and word lists, the last one dated today
# (Berlin) and the others the days before it, so the Archive has some. Nothing comes from
# puzzles/ or goes into it: the batches there are only read, so a preview never takes a headline
# or a pair of theme words a real day has (no day is spoiled). The page is copied from this
# checkout into a folder under the system's temp folder with a one-batch puzzles/, and served
# on 127.0.0.1:<port>/wortnetz/ by a server in the background; a second run swaps in new boards
# and keeps that server. The port is fixed so the browser keeps the preview's storage (solves,
# factor, settings) between runs, apart from the real site's. The checkout isn't archived, so its
# service worker runs as "dev" (network first): a new board shows at the next reload.
import argparse, datetime, json, os, random, secrets, shutil, sys, tempfile, threading, time
import urllib.error, urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

PORT = 8003
HOME = os.path.join(tempfile.gettempdir(), 'wortnetz-preview')   # state.json, server.log, srv/
SITE = ['index.html', 'app.css', 'icon.svg', 'manifest.json', 'config.json', 'sw.js', 'icons', 'src', 'vendor']
STOP_PATH = '/.preview-stop'


def berlin_today():
	from zoneinfo import ZoneInfo
	return datetime.datetime.now(ZoneInfo('Europe/Berlin')).date()


# ---------- the boards ----------

def used(puzzles):
	"""what the real batches hold (read only): their headlines and theme-word pairs"""
	import gen
	avoid, pairs = set(), set()
	for fn, b in gen.batches(puzzles):
		for d in b['days']:
			avoid.add(d['headline'])
			th = d.get('theme')
			if th: pairs |= gen.pairs_of(th['words'])
	return avoid, pairs


def make_board(rng, day, avoid, pairs, easy=False, longs=()):
	"""one new board for day: a normal one from a random theme group in its window, or an easy
	one (a long compound as its headline, as gen.py's easy days). None when nothing came good"""
	import gen
	groups = [g for g in gen.THEMES if gen.in_window(g[1], day) and len(g[2]) >= 2]
	rng.shuffle(groups)
	seed = rng.randrange(1 << 32)
	if easy:
		attempts = 0
		for w, z in longs:
			if w in avoid: continue
			parts = gen.split_compound(w)[::2]
			own = [g for g in groups if set(parts) & set(g[2])]
			for g in own + [g for g in groups[:8] if g not in own]:
				fit = [x for x in gen.easy_words(g, w) if x not in parts] + [x for x in g[2] if x in parts]
				if len(fit) < 2: continue
				attempts += 1
				b = gen.board(seed, g, avoid | set(parts), pairs, headline=w, place_words=fit)[0]
				if b: return b
				if attempts >= 40: return None
		return None
	for g in groups[:10]:
		b = gen.board(seed, g, avoid, pairs)[0]
		if b: return b
	return None


def make_batch(days, seed, puzzles, easy=False, today=None, log=print):
	"""days new boards, the last one dated today: a batch as gen.py writes it"""
	import gen
	today = today or berlin_today()
	start = today - datetime.timedelta(days=days - 1)
	rng = random.Random(seed)
	avoid, pairs = used(puzzles)
	longs = []
	if easy:
		import hunbonus
		longs = [(w, z) for w, z in gen.long_compounds(hunbonus.D) if len(w) <= 12]
		for w, z in longs: gen.HEADZ[w] = z
		rng.shuffle(longs)
	out = []
	for k in range(days):
		day = start + datetime.timedelta(days=k)
		t0 = time.time()
		b = make_board(rng, day, avoid, pairs, easy, longs)
		if not b and easy:
			log(f'{day}: no easy board, a normal one')
			b = make_board(rng, day, avoid, pairs)
		if not b: sys.exit(f'preview.py: {day}: no board came good (another --seed?)')
		avoid.add(b['headline'])
		if b['easy']: avoid |= set(gen.split_compound(b['headline'])[::2])
		pairs |= gen.pairs_of(b['theme']['words'])
		b['date'] = str(day)
		out.append(b)
		log(f"{day} {b['id']}{' easy' if b['easy'] else ''}, {len(b['targets'])} targets, "
			f"{len(b['bonus'])} bonus, {time.time() - t0:.0f} s")
	return {'v': 1, 'kind': 'wortnetz-batch', 'gen': gen.GEN, 'seed': seed, 'preview': True, 'start': str(start),
		'made': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), 'days': out}


# ---------- the site ----------

def write_site(srv, batch):
	"""the page from this checkout and the one batch, into srv/wortnetz/ (built beside it, then
	swapped in, so a running server never serves half of it)"""
	os.makedirs(srv, exist_ok=True)
	new, cur, old = (os.path.join(srv, n) for n in ('wortnetz.new', 'wortnetz', 'wortnetz.old'))
	for d in (new, old): shutil.rmtree(d, ignore_errors=True)
	os.makedirs(os.path.join(new, 'puzzles'))
	for name in SITE:
		src = os.path.join(ROOT, name)
		if os.path.isdir(src): shutil.copytree(src, os.path.join(new, name))
		else: shutil.copy2(src, os.path.join(new, name))
	fn = f"batch-{batch['start']}.json"
	with open(os.path.join(new, 'puzzles', fn), 'w', encoding='utf-8') as f:
		json.dump(batch, f, ensure_ascii=False, separators=(',', ':'))
	with open(os.path.join(new, 'puzzles', 'index.json'), 'w', encoding='utf-8') as f:
		json.dump({'v': 1, 'batches': [{'file': fn, 'start': batch['start'], 'days': len(batch['days'])}]}, f, indent='\t')
		f.write('\n')
	if os.path.exists(cur): os.rename(cur, old)
	os.rename(new, cur)
	shutil.rmtree(old, ignore_errors=True)
	return cur


# ---------- the server ----------

def make_server(srv, port, token):
	"""a static server for srv on 127.0.0.1:port (0: any free port); a POST to STOP_PATH with the
	token ends it (a later run can't signal the process: the sandbox keeps processes apart)"""
	class Handler(SimpleHTTPRequestHandler):
		extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript',
			'.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml'}

		def __init__(self, *a, **kw):
			super().__init__(*a, directory=srv, **kw)

		def end_headers(self):
			self.send_header('Cache-Control', 'no-cache')
			super().end_headers()

		def do_POST(self):
			body = self.rfile.read(min(int(self.headers.get('Content-Length') or 0), 200)).decode('ascii', 'replace')
			if self.path != STOP_PATH or not secrets.compare_digest(body, token):
				self.send_error(403); return
			self.send_response(204); self.end_headers()
			threading.Thread(target=self.server.shutdown, daemon=True).start()

		def log_message(self, *a): pass

	return ThreadingHTTPServer(('127.0.0.1', port), Handler)


def load_state():
	try:
		with open(os.path.join(HOME, 'state.json'), encoding='utf-8') as f: return json.load(f)
	except (OSError, ValueError):
		return None


def up(port):
	"""our server answers on port"""
	try:
		with urllib.request.urlopen(f'http://127.0.0.1:{port}/wortnetz/puzzles/index.json', timeout=1) as r:
			return r.status == 200
	except (urllib.error.URLError, OSError):
		return False


def stop(port):
	"""end the server a run started: True when one was asked to stop"""
	st = load_state()
	if not st or st.get('port') != port: return False
	req = urllib.request.Request(f'http://127.0.0.1:{port}{STOP_PATH}', data=st['token'].encode(), method='POST')
	try:
		urllib.request.urlopen(req, timeout=2).close()
	except (urllib.error.URLError, OSError):
		return False
	for _ in range(20):
		if not up(port): break
		time.sleep(0.1)
	return True


def serve_background(port):
	"""our server on port, started in the background unless it already runs"""
	st = load_state()
	if st and st.get('port') == port and up(port): return 'kept'
	if up(port) or busy(port):
		sys.exit(f'preview.py: port {port} is taken by another server (--port, or --stop first)')
	token = secrets.token_hex(16)
	with open(os.path.join(HOME, 'state.json'), 'w', encoding='utf-8') as f:
		json.dump({'port': port, 'token': token}, f)
	import subprocess
	log = open(os.path.join(HOME, 'server.log'), 'ab')
	subprocess.Popen([sys.executable, os.path.abspath(__file__), '--serve', '--port', str(port)],
		stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True, close_fds=True)
	for _ in range(50):
		if up(port): return 'started'
		time.sleep(0.1)
	sys.exit(f'preview.py: the server did not come up (see {os.path.join(HOME, "server.log")})')


def busy(port):
	import socket
	with socket.socket() as s:
		try: s.bind(('127.0.0.1', port)); return False
		except OSError: return True


def main():
	ap = argparse.ArgumentParser(description='a fresh board on this computer, never from or into puzzles/')
	ap.add_argument('--days', type=int, default=1, help='boards: today and the days before (default 1)')
	ap.add_argument('--easy', action='store_true', help='easy boards (a long compound as the headline)')
	ap.add_argument('--seed', type=int, help='the boards of an earlier run again (it prints its seed)')
	ap.add_argument('--port', type=int, default=PORT)
	ap.add_argument('--data', default=os.environ.get('WORTNETZ_DATA', os.path.join(ROOT, '..', 'wortnetz-private', 'gen')))
	ap.add_argument('--stop', action='store_true', help='end the preview server')
	ap.add_argument('--serve', action='store_true', help=argparse.SUPPRESS)   # the server itself
	a = ap.parse_args()
	if a.serve:
		st = load_state()
		make_server(os.path.join(HOME, 'srv'), a.port, st['token']).serve_forever()
		return
	if a.stop:
		print('preview server stopped' if stop(a.port) else f'no preview server on port {a.port}')
		return
	if not 1 <= a.days <= 30: sys.exit('preview.py: --days 1 to 30')
	import gen, hunbonus
	gen.load(a.data)
	hunbonus.init(os.path.join(a.data, 'package', 'index'), gen)
	seed = a.seed if a.seed is not None else secrets.randbelow(1 << 31)
	print(f'seed {seed}', flush=True)
	batch = make_batch(a.days, seed, os.path.join(ROOT, 'puzzles'), a.easy, log=lambda s: print(s, flush=True))
	os.makedirs(HOME, exist_ok=True)
	write_site(os.path.join(HOME, 'srv'), batch)
	how = serve_background(a.port)
	print(f'server {how}: http://127.0.0.1:{a.port}/wortnetz/  (python3 gen/preview.py --stop ends it)')


if __name__ == '__main__':
	main()
