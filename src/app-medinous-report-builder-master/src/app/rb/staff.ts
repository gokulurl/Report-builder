/**
 * Staff model (colleague's prototype, Oct 2026): a staff member's own reports with simplified filters
 * (pick values, or a from–to range; no operators), staff-chosen grouping (≤2 levels) and a plain-language summary.
 */
import { CAT, Clause, Filter, Period, Row, Sort, Spec, SumFn, Template, colOf, effective, fdate, isNum, resolveRange, rowsFor } from './engine';

export const QUICK = ['today', 'yesterday', 'last7', 'last30', 'thismonth', 'lastmonth', 'thisyear'];
export const MORE = ['last90', 'last365', 'thisquarter', 'lastquarter'];
const p2 = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

let qid = 1;
export const newClause = (field: string, o: Partial<Clause> = {}): Clause =>
  Object.assign({ id: qid++, field, vals: [], exclude: false, from: '', to: '' }, o);
export const isAmount = (f: string) => isNum(colOf(f));

/** Old operator filters → clauses, for versions saved before the simplified filters. */
export function fromConds(conds: Filter[]): Clause[] {
  return conds.map((f) =>
    isAmount(f.col)
      ? newClause(f.col, { from: f.op === 'gt' || f.op === 'between' ? String(f.a ?? '') : '', to: f.op === 'lt' ? String(f.a ?? '') : f.op === 'between' ? String(f.b ?? '') : '' })
      : newClause(f.col, { vals: [...(f.vals || [])], exclude: f.op === 'notin' }),
  );
}

export function clauseErr(c: Clause) {
  if (isAmount(c.field)) {
    const a = parseFloat(c.from), b = parseFloat(c.to);
    if (c.from === '' && c.to === '') return 'Enter at least one amount';
    if ((c.from !== '' && isNaN(a)) || (c.to !== '' && isNaN(b))) return 'Enter numbers only';
    if (!isNaN(a) && !isNaN(b) && a > b) return 'The first amount must not be larger than the second';
    return '';
  }
  return c.vals.length ? '' : 'Pick at least one value';
}
export function testClause(c: Clause, r: Row) {
  const v = r[c.field];
  if (isAmount(c.field)) { const a = parseFloat(c.from), b = parseFloat(c.to); return (isNaN(a) || v >= a) && (isNaN(b) || v <= b); }
  const hit = c.vals.includes(v);
  return c.exclude ? !hit : hit;
}
/** Several values in one filter means any of them; different filters must all match. Unfinished filters are ignored. */
export const evalAll = (cl: Clause[], r: Row) => cl.filter((c) => !clauseErr(c)).every((c) => testClause(c, r));

const orList = (a: string[]) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1]);
export function clauseText(c: Clause) {
  const col = colOf(c.field);
  if (isAmount(c.field)) {
    const f = (x: string) => (col.type === 'money' ? 'KD ' + x : x);
    if (c.from !== '' && c.to !== '') return `${col.label} is between ${f(c.from)} and ${f(c.to)}`;
    if (c.from !== '') return `${col.label} is at least ${f(c.from)}`;
    return `${col.label} is at most ${f(c.to)}`;
  }
  return `${col.label} ${c.exclude ? 'is not' : 'is'} ${orList(c.vals)}`;
}

/** When staff change the grouping, totals come from each amount column's natural summary. */
export function autoSums(t: Template): Record<string, SumFn> {
  const o: Record<string, SumFn> = {};
  t.cols.forEach((c) => {
    const col = colOf(c, t.calcs);
    if (col.type === 'money' || col.type === 'int') o[c] = col.sum.includes('sum') ? 'sum' : col.sum[0] || 'avg';
    if (c === 'inv') o[c] = 'countd';
  });
  return Object.assign(o, t.sums);
}

export interface Doc { period: Period; clauses: Clause[]; hidden: string[]; sorts: Sort[]; groups: string[] }

/** Template + a staff report's settings → what runs. */
export function buildR(t: Template, d: Doc): Spec {
  const R = effective(t, { period: d.period, conds: [], hidden: d.hidden, sorts: d.sorts });
  const g = d.groups || [];
  const same = JSON.stringify(g) === JSON.stringify(t.groups.slice(0, 2));
  R.groups = [...g];
  R.sums = g.length ? autoSums(t) : t.sums;
  R.show = g.length ? (same ? t.show : { detail: true, sub: true, grand: true }) : { detail: true, sub: false, grand: true };
  R.start = same ? t.start : 'expanded';
  R.display = { ...t.display, label: g[0] || t.display.label };
  if (t.display.mode !== 'table' && !g.length && t.groups.length) R.display.label = t.groups[0];
  return R;
}
export const rowsForDoc = (t: Template, d: Doc) => rowsFor(buildR(t, d)).filter((r) => evalAll(d.clauses, r));

/** "Shows service lines dated from … to …, where …, grouped by …. Always limited to …." */
export function docSentence(t: Template, d: Doc, noun: string) {
  const r = resolveRange(d.period);
  const per = r && r.from && r.to ? (+r.from === +r.to ? `on ${fdate(r.from)}` : `from ${fdate(r.from)} to ${fdate(r.to)}`) : '(choose a period)';
  const parts = d.clauses.filter((c) => !clauseErr(c)).map(clauseText);
  let s = `Shows ${noun} dated ${per}`;
  if (parts.length) s += `, where ${parts.join(', and ')}`;
  if (d.groups.length) s += `, grouped by ${d.groups.map((x) => colOf(x).label).join(', then by ')}`;
  if (t.scope.length) s += `. Always limited to ${t.scope.map((f) => colOf(f.col).label + ' ' + (f.vals || []).join(', ')).join('; ')}`;
  return s + '.';
}

export const groupable = () => CAT.filter((c) => c.grp);

/** Columns staff may not hide: grouped by, used in a formula, or used for drill-through. */
export function lockedColD(t: Template, d: Doc, id: string) {
  if (d.groups.includes(id)) return 'Grouped by this';
  if (t.calcs.some((k) => k.a.v === id || k.b.v === id)) return 'Used in a formula';
  if (t.drill.some((x) => x.col === id)) return 'Opens another report';
  return '';
}

/** Next time a schedule fires, from today. */
export function nextRun(freq: string, time: string, today: Date) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(today); d.setHours(h, m, 0, 0);
  const ok = (x: Date) => freq.startsWith('Working') ? [0, 1, 2, 3, 4].includes(x.getDay()) : freq.startsWith('Every Sunday') ? x.getDay() === 0 : freq.startsWith('First') ? x.getDate() === 1 : true;
  const nowish = new Date(today.getFullYear(), today.getMonth(), today.getDate(), new Date().getHours(), new Date().getMinutes());
  let i = 0;
  while ((d <= nowish || !ok(d)) && i < 40) { d.setDate(d.getDate() + 1); i++; }
  return d;
}

/** Topic headings for templates in the New report tree. */
export const TOPICS: Record<string, string> = { t1: 'Revenue', t2: 'Revenue', t4: 'Revenue', t7: 'Revenue', t3: 'Pharmacy', t5: 'Invoices and follow-up', t6: 'Invoices and follow-up' };
