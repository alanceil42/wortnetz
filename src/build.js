// Which version runs: the release and, filled in by
// `git archive` (.gitattributes: export-subst), the commit it was made from. A checkout that was
// not archived shows the placeholders, which buildInfo() turns into null.
export const VERSION = '0.2.3';
const RAW = { commit: '$Format:%h$', date: '$Format:%cs$' };

export function buildInfo() {
	const real = v => (v && !v.startsWith('$Format') ? v : null);
	return { app: 'wortnetz', version: VERSION, commit: real(RAW.commit), date: real(RAW.date) };
}
