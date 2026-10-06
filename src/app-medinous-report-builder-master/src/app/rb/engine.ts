/**
 * Report engine for the two-role model (IT builds templates, staff run them).
 * Ported from the manager's prototype. Sample data stands in for the .NET API; every function here is what the
 * server is expected to do, so NOTES-for-backend.md describes the same rules.
 */

export type ColType = 'text' | 'date' | 'int' | 'money' | 'calc';
export type SumFn = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countd';

export interface Col {
  id: string; label: string; type: ColType; desc?: string; sum: SumFn[];
  grp?: boolean; restricted?: boolean; rel?: boolean;
}
export interface CalcCol extends Col {
  type: 'calc'; op: CalcOp; a: Operand; b: Operand; kfmt: 'num' | 'money' | 'pct'; dp: number;
}
export type CalcOp = 'add' | 'sub' | 'mul' | 'div' | 'pct';
export interface Operand { kind: 'col' | 'num'; v: string }

export interface Filter {
  id: number; col: string; op: string; vals?: string[]; text?: string; a?: string; b?: string; preset?: string; fixed?: boolean;
}
export interface Period { preset: string; a?: string; b?: string }
export interface Sort { col: string; dir: 'asc' | 'desc' }
export interface Rule { id: number; col: string; op: 'gt' | 'lt' | 'eq' | 'between' | 'contains'; a: string; b?: string; sw: string; applies: 'detail' | 'summary' | 'both' }
export interface SummaryTab { id: string; name: string; groups: string[]; sums: Record<string, SumFn> }
export interface Display { mode: 'table' | 'chart' | 'both'; type: 'bar' | 'line' | 'pie' | 'doughnut'; label: string; values: string[]; orient: 'portrait' | 'landscape' }

export interface Template {
  id: string; title: string; desc: string; module: string; entity: string;
  cols: string[]; fmt: Record<string, string>; groups: string[]; sums: Record<string, SumFn>;
  show: { detail: boolean; sub: boolean; grand: boolean }; start: 'expanded' | 'collapsed';
  sorts: Sort[]; calcs: CalcCol[]; display: Display; rules: Rule[]; drill: { col: string; target: string }[];
  widths: Record<string, number>; wrap: string[]; pins: string[];
  scope: Filter[]; summaries: SummaryTab[]; expiry: number; places: string[];
  status: 'draft' | 'published'; removed: boolean; heavy: boolean; edited: string;
}
export interface Share { mode: 'private' | 'people' | 'module'; people: string[] }
export interface MyReport {
  id: string; tid: string; name: string; period: Period; conds: Filter[]; hidden: string[]; sorts: Sort[];
  notify: Notify; openNow: boolean; owner: string; share: Share;
}
export type Notify = 'none' | 'app' | 'email';
export interface Criteria { period: Period; conds: Filter[]; hidden: string[]; sorts: Sort[] }
export interface Spec {
  cols: string[]; fmt: Record<string, string>; groups: string[]; sums: Record<string, SumFn>;
  show: Template['show']; calcs: CalcCol[]; display: Display; rules: Rule[]; drill: Template['drill'];
  sorts: Sort[]; filters: Filter[]; start: Template['start'];
}
export type Row = Record<string, any> & { _i: number };

/* ---------- catalogue: Billing › Invoice Detail ---------- */
const TEXT: SumFn[] = ['count', 'countd'];
const MONEY: SumFn[] = ['sum', 'avg', 'min', 'max'];
export const CAT: Col[] = [
  { id: 'inv', label: 'Invoice No.', type: 'text', desc: 'Repeats on every line of the invoice', sum: ['countd', 'count'] },
  { id: 'date', label: 'Invoice Date', type: 'date', desc: 'Date the invoice was raised', sum: ['min', 'max'], grp: true },
  { id: 'status', label: 'Invoice Status', type: 'text', desc: 'Open, Closed or Cancelled', sum: TEXT, grp: true },
  { id: 'itype', label: 'Invoice Type', type: 'text', desc: 'Outpatient or inpatient', sum: TEXT, grp: true },
  { id: 'pid', label: 'Patient ID', type: 'text', desc: 'Count distinct gives the number of patients', sum: ['countd'] },
  { id: 'pname', label: 'Patient Name', type: 'text', desc: 'First and last name', sum: ['countd'], grp: true },
  { id: 'mobile', label: 'Mobile', type: 'text', desc: 'Restricted. Exporting it asks for a reason', sum: ['count'], restricted: true },
  { id: 'sponsor', label: 'Sponsor', type: 'text', desc: 'Current sponsor of the invoice', sum: TEXT, grp: true, rel: true },
  { id: 'scat', label: 'Sponsor Category', type: 'text', desc: 'Insurance or cash', sum: TEXT, grp: true, rel: true },
  { id: 'svc', label: 'Service Name', type: 'text', desc: 'Billed service or item', sum: TEXT, grp: true },
  { id: 'rtype', label: 'Revenue Type', type: 'text', desc: 'Revenue grouping of the service', sum: TEXT, grp: true },
  { id: 'doc', label: 'Doctor', type: 'text', desc: 'Ordering doctor', sum: TEXT, grp: true },
  { id: 'dept', label: 'Department', type: 'text', desc: 'Department that raised the request', sum: TEXT, grp: true },
  { id: 'qty', label: 'Quantity', type: 'int', desc: 'Whole number of units', sum: ['sum', 'avg', 'min', 'max'] },
  { id: 'price', label: 'Unit Price', type: 'money', desc: 'Price per unit. Totalling unit prices has no meaning', sum: ['avg', 'min', 'max'] },
  { id: 'gross', label: 'Gross Amount', type: 'money', desc: 'Line value before discount', sum: MONEY },
  { id: 'disc', label: 'Discount', type: 'money', desc: 'Line discount', sum: ['sum', 'avg'] },
  { id: 'net', label: 'Net Amount', type: 'money', desc: 'Line value after discount', sum: MONEY },
  { id: 'ppart', label: 'Patient Part', type: 'money', desc: 'Share paid by the patient', sum: ['sum', 'avg'] },
  { id: 'cpart', label: 'Company Part', type: 'money', desc: 'Share paid by the sponsor', sum: ['sum', 'avg'] },
];
export const SUMLBL: Record<SumFn, string> = { sum: 'Total', avg: 'Average', min: 'Minimum', max: 'Maximum', count: 'Count', countd: 'Count distinct' };
export const OPS: Record<CalcOp, string> = { add: '+', sub: '−', mul: '×', div: '÷', pct: 'as % of' };
export const OPNAME: Record<CalcOp, string> = { add: 'Add', sub: 'Subtract', mul: 'Multiply', div: 'Divide', pct: 'Percent of' };
export const PRESETS: Record<string, string> = {
  any: 'Any time', today: 'Today', last7: 'Last 7 days', last30: 'Last 30 days', last90: 'Last 90 days', last365: 'Last 365 days',
  thismonth: 'This month', lastmonth: 'Last month', thisquarter: 'This quarter', lastquarter: 'Last quarter', thisyear: 'This year',
};
export const PHINT: Record<string, string> = { thismonth: '(to date)', thisquarter: '(to date)', thisyear: '(to date)', lastmonth: '(full month)', lastquarter: '(full quarter)' };
export const PERIOD_GROUPS: [string, string[]][] = [
  ['Up to and including today', ['today', 'last7', 'last30', 'last90', 'last365']],
  ['Calendar periods', ['lastmonth', 'thismonth', 'lastquarter', 'thisquarter', 'thisyear']],
];
export const NFMT: Record<string, string> = { auto: 'As registered', whole: 'Whole number (1,234)', d2: '2 decimals (1,234.56)', d3: '3 decimals (1,234.567)', money: 'Currency (KD 1,234.500)', money0: 'Currency, no decimals (KD 1,235)', pct: 'Percent (56%)' };
export const DFMT: Record<string, string> = { medium: 'Medium (06 Oct 2026)', short: 'Short (06/10/2026)', long: 'Long (6 October 2026)', iso: 'ISO (2026-10-06)' };
export const MODULES = ['Billing', 'Registration', 'Administration'];
export const ENTITIES: Record<string, { id: string; name: string; row: string; sample: boolean }[]> = {
  Billing: [{ id: 'inv_detail', name: 'Invoice Detail', row: 'One row is a billed service line', sample: true }, { id: 'inv_header', name: 'Invoice Header', row: 'One row is an invoice', sample: false }],
  Registration: [{ id: 'pat_reg', name: 'Patient Registration', row: 'One row is a registered patient', sample: false }, { id: 'pat_visit', name: 'Patient Visit', row: 'One row is a visit', sample: false }],
  Administration: [{ id: 'users', name: 'User Accounts', row: 'One row is a user account', sample: false }],
};
export const SWATCH: Record<string, { bg: string; fg: string; n: string }> = {
  gbg: { bg: '#e7f6ee', fg: '#1f7a45', n: 'Green fill' }, rbg: { bg: '#fdeceb', fg: '#b42318', n: 'Red fill' },
  abg: { bg: '#fff4e0', fg: '#9a5b00', n: 'Amber fill' }, bbg: { bg: '#e8f1fc', fg: '#00448a', n: 'Blue fill' },
  rtx: { bg: '', fg: '#d92d20', n: 'Red text' }, gtx: { bg: '', fg: '#1f9d55', n: 'Green text' },
};
export const PALETTE = ['#0065cb', '#1f9d55', '#c77700', '#6b4ea8', '#fe6300', '#00448a', '#5fa0e9', '#d92d20'];

/** Data set settings, set once by Medinous per data set (not per template). */
export const DATASETS: Record<string, { periodCol: string; noun: string; defaultPeriod: Period; maxInteractiveDays: number; actions: { id: string; label: string; single?: boolean }[] }> = {
  inv_detail: {
    periodCol: 'date', noun: 'service lines', defaultPeriod: { preset: 'last30' }, maxInteractiveDays: 366,
    actions: [
      { id: 'openinv', label: 'Open invoice', single: true }, { id: 'openpat', label: 'Open patient record', single: true },
      { id: 'follow', label: 'Add to my follow-up list' }, { id: 'remind', label: 'Send payment reminder' }, { id: 'assign', label: 'Assign to a colleague' },
    ],
  },
};
export const COLLEAGUES = ['Fatima Al Sabah', 'Rahul Nair', 'Noura Al Mutairi', 'Joseph Mathew', 'Aisha Khan'];

/* ---------- sample rows ---------- */
export const TODAY = new Date(2026, 9, 6);
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const SPONS = [['Warba', 'Insurance'], ['Gulf Insurance', 'Insurance'], ['Kuwait Insurance Co', 'Insurance'], ['Cash Customer', 'Cash']];
const SVCS: [string, string, string, number][] = [['MRI Brain', 'Radiology', 'Radiology', 180], ['CT Head', 'Radiology', 'Radiology', 90], ['X-Ray Chest PA View', 'Radiology', 'Radiology', 35], ['CBC', 'Laboratory', 'Laboratory', 8], ['Blood Culture', 'Laboratory', 'Laboratory', 14], ['Lipid Profile', 'Laboratory', 'Laboratory', 12], ['Consultation', 'Clinic', 'General Practice', 25], ['Follow-up Visit', 'Clinic', 'General Practice', 15], ['Physiotherapy Session', 'Rehab', 'Physiotherapy', 20], ['Dental Scaling', 'Dental', 'Dental', 45], ['Paracetamol 500 mg', 'Pharmacy', 'Pharmacy', 2], ['Amoxicillin 625 mg', 'Pharmacy', 'Pharmacy', 7]];
const DOCS = ['Roshini V D', 'Ahmed Saleh', 'Maya Thomas', 'Fahad Al Rashed'];
const PATS = [['265', 'Amsha Al Haddad'], ['261', 'Jiya Jose'], ['202626', 'Noha Fathehi'], ['2026747', 'Sudha Joseph'], ['2026199', 'Soujanya Kulkarni'], ['1664', 'Fahad Al Mutairi'], ['2081', 'Sara Al Enezi'], ['3120', 'Omar Haddad'], ['3307', 'Leena Varghese'], ['3411', 'Yousef Al Ali'], ['3550', 'Mariam Khan'], ['3702', 'Ravi Menon']];
export const ROWS: Row[] = [];
for (let i = 0; i < 70; i++) {
  const p = pick(PATS), sp = pick(SPONS);
  const d = new Date(2026, 7 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 28)); if (d > TODAY) d.setMonth(8);
  const inv = 'AOP0926' + String(11000 + i * 7).padStart(5, '0');
  const status = rnd() < .72 ? 'Open' : (rnd() < .8 ? 'Closed' : 'Cancelled'); const itype = rnd() < .85 ? 'Outpatient' : 'Inpatient';
  const mobile = '+965 9' + String(1000000 + Math.floor(rnd() * 8999999));
  for (let l = 0, n = 1 + Math.floor(rnd() * 3); l < n; l++) {
    const s = pick(SVCS); const qty = s[1] === 'Pharmacy' ? 1 + Math.floor(rnd() * 4) : (s[1] === 'Rehab' ? 1 + Math.floor(rnd() * 3) : 1);
    const gross = +(s[3] * qty).toFixed(3); const disc = sp[1] === 'Insurance' && rnd() < .35 ? +(gross * .1).toFixed(3) : 0; const net = +(gross - disc).toFixed(3);
    const ppart = sp[1] === 'Cash' ? net : +(net * .2).toFixed(3);
    ROWS.push({ _i: ROWS.length, inv, date: d, status, itype, pid: p[0], pname: p[1], mobile, sponsor: sp[0], scat: sp[1], svc: s[0], rtype: s[1], doc: pick(DOCS), dept: s[2], qty, price: s[3], gross, disc, net, ppart, cpart: +(net - ppart).toFixed(3) });
  }
}

/* ---------- formatting ---------- */
export const colOf = (id: string, calcs?: CalcCol[]): Col => (CAT.find((c) => c.id === id) || (calcs || []).find((c) => c.id === id))!;
export const isNum = (c?: Col) => !!c && (c.type === 'money' || c.type === 'int' || c.type === 'calc');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const p2 = (n: number) => String(n).padStart(2, '0');
export function fdate(d: Date | null | undefined, f = 'medium') {
  if (!d) return '';
  if (f === 'short') return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
  if (f === 'long') return `${d.getDate()} ${MONL[d.getMonth()]} ${d.getFullYear()}`;
  if (f === 'iso') return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  return `${p2(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
export const hm = (d: Date) => d.toTimeString().slice(0, 5);
const nf = (v: number, dp: number) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export function fval(c: Col, v: any, fn: SumFn | null, fmt?: Record<string, string>): string {
  if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) return '';
  if (fn === 'count' || fn === 'countd') return v.toLocaleString('en-US');
  const f = (fmt && fmt[c.id]) || 'auto';
  if (c.type === 'date') return fdate(v, f === 'auto' ? 'medium' : f);
  if (c.type === 'calc') {
    const k = c as CalcCol; const dp = k.dp ?? 2;
    if (k.kfmt === 'pct') return nf(v * 100, dp) + '%'; if (k.kfmt === 'money') return 'KD ' + nf(v, dp); return nf(v, dp);
  }
  if (isNum(c)) {
    const g = f === 'auto' ? (c.type === 'money' ? 'money' : (fn === 'avg' ? 'd2' : 'whole')) : f;
    if (g === 'whole') return nf(v, 0); if (g === 'd2') return nf(v, 2); if (g === 'd3') return nf(v, 3);
    if (g === 'money') return 'KD ' + nf(v, 3); if (g === 'money0') return 'KD ' + nf(v, 0); if (g === 'pct') return nf(v * 100, 0) + '%';
  }
  return String(v);
}

/* ---------- periods: one definition for filtering and for labels ---------- */
const dd = (y: number, m: number, d: number) => new Date(y, m, d);
export function resolveRange(v: Period | null) {
  if (!v) return null;
  if (v.preset === 'custom') return { from: v.a ? new Date(v.a) : null, to: v.b ? new Date(v.b) : null, kind: '', label: 'Custom dates' };
  const T = TODAY, y = T.getFullYear(), m = T.getMonth(), q = Math.floor(m / 3), back = (n: number) => new Date(+T - (n - 1) * 864e5);
  const R: Record<string, [Date, Date, string]> = {
    today: [T, T, 'roll'], last7: [back(7), T, 'roll'], last30: [back(30), T, 'roll'], last90: [back(90), T, 'roll'], last365: [back(365), T, 'roll'],
    thismonth: [dd(y, m, 1), T, 'cal'], lastmonth: [dd(y, m - 1, 1), dd(y, m, 0), ''], thisquarter: [dd(y, q * 3, 1), T, 'cal'],
    lastquarter: [dd(y, q * 3 - 3, 1), dd(y, q * 3, 0), ''], thisyear: [dd(y, 0, 1), T, 'cal'],
  };
  const r = R[v.preset];
  if (!r) return { from: null, to: null, kind: '', label: PRESETS[v.preset] || v.preset };
  return { from: r[0], to: r[1], kind: r[2], label: PRESETS[v.preset] };
}
export function rangeText(v: Period | null, short = false) {
  const r = resolveRange(v); if (!r) return ''; if (!r.from && !r.to) return r.label;
  const span = `${fdate(r.from)} to ${fdate(r.to)}`;
  const tail = r.kind === 'roll' ? ', includes today' : r.kind === 'cal' ? ', to date' : '';
  return short ? `${r.label} (${span})` : `${r.label}: ${span}${tail}`;
}
export function periodErr(p: Period | null) {
  if (!p) return 'Choose a period';
  if (p.preset === 'custom') { if (!p.a || !p.b) return 'Enter both dates'; if (new Date(p.a) > new Date(p.b)) return 'The first date must not be later than the second'; }
  return '';
}
export function periodDays(p: Period) { const r = resolveRange(p); if (!r || !r.from || !r.to) return 0; return Math.round((+r.to - +r.from) / 864e5) + 1; }
function inPreset(d: Date, p: string) {
  if (p === 'any') return true; const r = resolveRange({ preset: p }); if (!r || !r.from || !r.to) return true;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  return day(d) >= day(r.from) && day(d) <= day(r.to);
}

/* ---------- filters ---------- */
export function testF(f: Filter, r: Row, calcs: CalcCol[]): boolean {
  const c = colOf(f.col, calcs), v = r[f.col];
  if (f.op === 'empty') return v == null || v === ''; if (f.op === 'notempty') return !(v == null || v === '');
  if (c.type === 'date') {
    if (f.op === 'preset') return inPreset(v, f.preset || 'any');
    const a = f.a ? new Date(f.a) : null, b = f.b ? new Date(f.b) : null;
    if (f.op === 'after') return !a || v > a; if (f.op === 'before') return !a || v < a;
    if (f.op === 'dbetween') return (!a || v >= a) && (!b || v <= new Date(+b + 864e5 - 1)); return true;
  }
  if (c.type === 'text') {
    const s = String(v).toLowerCase(), t = (f.text || '').toLowerCase();
    if (f.op === 'in') return !f.vals || !f.vals.length || f.vals.includes(v);
    if (f.op === 'notin') return !(f.vals || []).includes(v);
    if (t.length < 2 && ['contains', 'starts', 'ends'].includes(f.op)) return true;
    if (f.op === 'contains') return s.includes(t); if (f.op === 'starts') return s.startsWith(t); if (f.op === 'ends') return s.endsWith(t);
    if (f.op === 'eq') return !t || s === t; if (f.op === 'ne') return !t || s !== t; return true;
  }
  const a = parseFloat(f.a ?? ''), b = parseFloat(f.b ?? '');
  if (f.op === 'gt') return isNaN(a) || v > a; if (f.op === 'lt') return isNaN(a) || v < a;
  if (f.op === 'eq') return isNaN(a) || v === a; if (f.op === 'ne') return isNaN(a) || v !== a;
  if (f.op === 'between') return (isNaN(a) || v >= a) && (isNaN(b) || v <= b); return true;
}
export function fSummary(f: Filter, calcs: CalcCol[] = []) {
  const c = colOf(f.col, calcs);
  if (f.op === 'empty') return 'is empty'; if (f.op === 'notempty') return 'is not empty';
  if (c.type === 'date') {
    if (f.op === 'preset') return `is in ${PRESETS[f.preset || 'any']}`; const fd = (x?: string) => x ? fdate(new Date(x)) : '…';
    return f.op === 'after' ? `is after ${fd(f.a)}` : f.op === 'before' ? `is before ${fd(f.a)}` : `is between ${fd(f.a)} and ${fd(f.b)}`;
  }
  if (c.type === 'text') {
    const T: Record<string, string> = { contains: 'contains', starts: 'starts with', ends: 'ends with', eq: 'equals', ne: 'does not equal' };
    if (T[f.op]) return `${T[f.op]} ${f.text || '…'}`;
    const v = f.vals || []; return (f.op === 'notin' ? 'is not ' : 'is ') + (v.length ? v.slice(0, 3).join(', ') + (v.length > 3 ? ` and ${v.length - 3} more` : '') : 'any value');
  }
  const T: Record<string, string> = { gt: 'is more than', lt: 'is less than', eq: 'equals', ne: 'does not equal', between: 'is between' };
  return `${T[f.op]} ${f.a || '…'}${f.op === 'between' ? ' and ' + (f.b || '…') : ''}`;
}
export function filterErr(f: Filter, calcs: CalcCol[] = []) {
  const c = colOf(f.col, calcs);
  if (['in', 'notin'].includes(f.op) && !(f.vals || []).length) return 'Choose at least one value';
  if (['contains', 'starts', 'ends'].includes(f.op) && (f.text || '').length < 2) return 'Enter at least two characters';
  if (isNum(c) && !['empty', 'notempty'].includes(f.op)) {
    if (f.a === '' || f.a == null) return 'Enter a value';
    if (!/^-?\d*\.?\d+$/.test(String(f.a).trim())) return 'Enter a number, for example 1234.56';
    if (f.op === 'between') { if (!f.b || isNaN(parseFloat(f.b))) return 'Enter the second number'; if (parseFloat(f.a) > parseFloat(f.b)) return 'The first value must not be greater than the second'; }
  }
  if (c.type === 'date' && ['after', 'before', 'dbetween'].includes(f.op)) {
    if (!f.a) return 'Enter a valid date';
    if (f.op === 'dbetween' && (!f.b || new Date(f.a) > new Date(f.b))) return f.b ? 'The first date must not be later than the second' : 'Enter the second date';
  }
  return '';
}
export function opsFor(c: Col): [string, string][] {
  if (c.type === 'text') return [['in', 'is any of'], ['notin', 'is none of'], ['contains', 'contains'], ['starts', 'starts with']];
  if (c.type === 'date') return [['preset', 'is in'], ['after', 'is after'], ['before', 'is before']];
  return [['gt', 'is more than'], ['lt', 'is less than'], ['between', 'is between'], ['eq', 'equals']];
}
export function distinct(id: string): [string, number][] {
  const n: Record<string, number> = {}; ROWS.forEach((r) => n[r[id]] = (n[r[id]] || 0) + 1);
  return Object.entries(n).sort((a, b) => b[1] - a[1]);
}

/* ---------- query ---------- */
const opv = (r: Row, o: Operand) => o.kind === 'num' ? parseFloat(o.v) : r[o.v];
function calcVal(k: CalcCol, r: Row) {
  const a = opv(r, k.a), b = opv(r, k.b); if (a == null || b == null || isNaN(a) || isNaN(b)) return NaN;
  return k.op === 'add' ? a + b : k.op === 'sub' ? a - b : k.op === 'mul' ? a * b : (b === 0 ? NaN : a / b);
}
export const cmp = (x: any, y: any) => x instanceof Date ? (+x - +y) : (typeof x === 'number' ? x - y : String(x).localeCompare(String(y)));
export function rowsFor(R: Spec): Row[] {
  const out = ROWS.filter((r) => R.filters.every((f) => testF(f, r, R.calcs)))
    .map((r) => { const o: Row = { ...r }; R.calcs.forEach((k) => o[k.id] = calcVal(k, r)); return o; });
  if (R.sorts.length) out.sort((a, b) => { for (const s of R.sorts) { const d = cmp(a[s.col], b[s.col]); if (d) return s.dir === 'asc' ? d : -d; } return 0; });
  return out;
}
export function agg(rows: Row[], id: string, fn: SumFn, calcs: CalcCol[]): number {
  const c = colOf(id, calcs);
  if (c.type === 'calc') {
    const k = c as CalcCol;
    if (k.op === 'div' || k.op === 'pct') { // ratios are recalculated from the totals, never averaged
      const tot = (o: Operand) => o.kind === 'num' ? parseFloat(o.v) : rows.reduce((s, r) => s + (r[o.v] || 0), 0);
      const B = tot(k.b); return B === 0 ? NaN : tot(k.a) / B;
    }
  }
  const vs = rows.map((r) => r[id]).filter((v) => v != null && !(typeof v === 'number' && isNaN(v)));
  if (fn === 'count') return vs.length; if (fn === 'countd') return new Set(vs.map((v) => v instanceof Date ? +v : v)).size;
  if (!vs.length) return NaN;
  if (fn === 'sum') return vs.reduce((a, b) => a + b, 0); if (fn === 'avg') return vs.reduce((a, b) => a + b, 0) / vs.length;
  if (fn === 'min') return vs.reduce((a, b) => a < b ? a : b); return vs.reduce((a, b) => a > b ? a : b);
}
export function ruleStyle(R: Spec, id: string, v: any, kind: 'detail' | 'summary'): Record<string, string> | null {
  for (const r of R.rules) {
    if (r.col !== id) continue; if (r.applies !== 'both' && r.applies !== kind) continue;
    let ok = false; const a = parseFloat(r.a), b = parseFloat(r.b ?? '');
    if (r.op === 'contains') ok = String(v ?? '').toLowerCase().includes(String(r.a || '').toLowerCase());
    else if (typeof v === 'number' && !isNaN(v)) {
      const c = colOf(id, R.calcs) as CalcCol; const vv = c.type === 'calc' && c.kfmt === 'pct' ? v * 100 : v;
      ok = r.op === 'gt' ? vv > a : r.op === 'lt' ? vv < a : r.op === 'eq' ? vv === a : (vv >= a && vv <= b);
    }
    if (ok) { const s = SWATCH[r.sw]; return { ...(s.bg ? { background: s.bg } : {}), color: s.fg, 'font-weight': '600' }; }
  }
  return null;
}
/** Columns a person may not hide, with the reason (PRD: staff can hide anything that isn't structural). */
export function lockedCol(t: Template, id: string) {
  if (t.groups.includes(id)) return 'Grouped by this'; if (t.groups.length && t.sums[id]) return 'Used in a summary';
  if (t.calcs.some((k) => k.a.v === id || k.b.v === id)) return 'Used in a formula'; if (t.drill.some((d) => d.col === id)) return 'Opens another report';
  return '';
}

/** Template + a person's values → what actually runs. */
export function effective(t: Template, c: Criteria): Spec {
  const pc = DATASETS[t.entity].periodCol, p = c.period;
  const pf: Filter = p.preset === 'custom' ? { id: -1, col: pc, op: 'dbetween', a: p.a, b: p.b } : { id: -1, col: pc, op: 'preset', preset: p.preset };
  return {
    cols: t.cols.filter((x) => !(c.hidden || []).includes(x)), fmt: t.fmt, groups: t.groups, sums: t.sums, show: t.show, calcs: t.calcs,
    display: t.display, rules: t.rules, drill: t.drill, sorts: c.sorts?.length ? c.sorts : t.sorts,
    filters: [...t.scope.map((f) => ({ ...f })), pf, ...(c.conds || [])], start: t.start,
  };
}

/* ---------- table model (grouping, subtotals, paging by whole groups) ---------- */
export const PAGE = 50;
export type TRow =
  | { k: 'detail'; row: Row; pad?: number }
  | { k: 'gh'; key: string; label: string; count: number; pad: number; collapsed: boolean; gcol: string }
  | { k: 'srow'; label: string; count: number; pad: number; rows: Row[]; gcol: string }
  | { k: 'sub'; label: string; pad: number; rows: Row[]; l2: boolean }
  | { k: 'grand'; rows: Row[] };
export interface TableModel { cols: string[]; rows: TRow[]; error?: string; info: { total?: number; from?: number; to?: number; groups?: number; pages: number; pg: number; unit?: 'lines' } }

const gkey = (R: Spec, r: Row, g: string) => r[g] instanceof Date ? fdate(r[g], R.fmt[g]) : r[g];
export function allKeys(R: Spec, rows: Row[]) {
  const ks: string[] = [];
  const walk = (rs: Row[], lvl: number, key: string) => {
    if (lvl >= R.groups.length) return; const g = R.groups[lvl]; const m = new Map<string, Row[]>();
    rs.forEach((r) => { const k = gkey(R, r, g); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
    m.forEach((grs, k) => { ks.push(key + '|' + k); walk(grs, lvl + 1, key + '|' + k); });
  };
  walk(rows, 0, ''); return ks;
}
export function matchRow(R: Spec, cols: string[], r: Row, q: string) {
  return !q || cols.some((id) => fval(colOf(id, R.calcs), r[id], null, R.fmt).toLowerCase().includes(q.toLowerCase()));
}
export function buildTable(R: Spec, rows: Row[], o: { collapsed: Set<string>; page: number; find: string; only: boolean; pins: string[] }): TableModel {
  let cs = R.cols.filter((id) => !R.groups.includes(id));
  const pins = o.pins.filter((p) => cs.includes(p)).slice(0, 2); cs = [...pins, ...cs.filter((c) => !pins.includes(c))];
  const grouped = R.groups.length > 0;
  if (grouped) {
    const top = new Set(rows.map((r) => R.groups.map((g) => gkey(R, r, g)).join('|')));
    if (top.size > 1000) return { cols: cs, rows: [], error: 'groups', info: { pages: 0, pg: 0 } };
  }
  const q = o.find.trim(); const hit = (r: Row) => matchRow(R, cs, r, q);
  if (!grouped) {
    const vis = q && o.only ? rows.filter(hit) : rows;
    const pages = Math.max(1, Math.ceil(vis.length / PAGE)); const pg = Math.min(o.page, pages - 1);
    const out: TRow[] = vis.slice(pg * PAGE, pg * PAGE + PAGE).map((row) => ({ k: 'detail', row }));
    if (R.show.grand && cs.some((id) => R.sums[id])) out.push({ k: 'grand', rows });
    return { cols: cs, rows: out, info: { total: vis.length, from: vis.length ? pg * PAGE + 1 : 0, to: Math.min(vis.length, pg * PAGE + PAGE), pages, pg, unit: 'lines' } };
  }
  const chunks: { rows: TRow[]; lines: number }[] = [];
  const walk = (rs: Row[], lvl: number, key: string, out: { rows: TRow[]; lines: number }[]) => {
    const g = R.groups[lvl]; const m = new Map<string, Row[]>();
    rs.forEach((r) => { const k = gkey(R, r, g); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
    const ents = [...m.entries()].sort((a, b) => cmp(a[1][0][g], b[1][0][g]));
    ents.forEach(([k, grs]) => {
      const gk = key + '|' + k, c = o.collapsed.has(gk), last = lvl === R.groups.length - 1, pad = 12 + lvl * 18;
      const shown = o.only && q ? grs.filter(hit) : grs; if (o.only && q && !shown.length) return;
      if (!R.show.detail && last) { out.push({ rows: [{ k: 'srow', label: k, count: grs.length, pad, rows: grs, gcol: g }], lines: 1 }); return; }
      const h: TRow[] = [{ k: 'gh', key: gk, label: k, count: grs.length, pad, collapsed: c, gcol: g }]; let lines = 1;
      if (!c) {
        if (last) { shown.forEach((row) => h.push({ k: 'detail', row })); lines += shown.length; }
        else { const sub: { rows: TRow[]; lines: number }[] = []; walk(grs, lvl + 1, gk, sub); sub.forEach((s) => { h.push(...s.rows); lines += s.lines; }); }
      }
      if (R.show.sub) { h.push({ k: 'sub', label: k + ' total', pad, rows: grs, l2: lvl > 0 }); lines++; }
      out.push({ rows: h, lines });
    });
  };
  walk(rows, 0, '', chunks);
  let body: TRow[] = []; let info: TableModel['info'];
  if (!R.show.detail && R.groups.length === 1) { body = chunks.flatMap((c) => c.rows); info = { groups: chunks.length, pages: 1, pg: 0 }; }
  else {
    const pages: typeof chunks[] = []; let cur: typeof chunks = [], n = 0;
    chunks.forEach((c) => { if (cur.length && n + c.lines > PAGE) { pages.push(cur); cur = []; n = 0; } cur.push(c); n += c.lines; });
    if (cur.length) pages.push(cur);
    const pg = Math.min(o.page, Math.max(0, pages.length - 1)); body = (pages[pg] || []).flatMap((c) => c.rows); info = { groups: chunks.length, pages: pages.length, pg };
  }
  if (R.show.grand && (!info.pages || info.pg === info.pages - 1)) body.push({ k: 'grand', rows });
  return { cols: cs, rows: body, info };
}

/* ---------- chart model ---------- */
export interface ChartModel { type: Display['type']; labels: string[]; series: { name: string; data: number[] }[]; capped: boolean; label: string; fmt: (i: number, v: number) => string }
export function chartModel(R: Spec, rows: Row[]): ChartModel | null {
  const d = R.display; if (!d.label || !d.values.length) return null;
  const lc = colOf(d.label, R.calcs); const m = new Map<string, Row[]>();
  rows.forEach((r) => { const k = gkey(R, r, d.label); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
  let cats = [...m.entries()].map(([k, rs]) => ({ k, v: d.values.map((v) => agg(rs, v, R.sums[v] || 'sum', R.calcs)), first: rs[0][d.label] }));
  if (lc.type === 'date') cats.sort((a, b) => a.first - b.first); else cats.sort((a, b) => (b.v[0] || 0) - (a.v[0] || 0));
  const capped = cats.length > 50; cats = cats.slice(0, 50);
  return {
    type: d.type, labels: cats.map((c) => c.k), capped, label: lc.label,
    series: d.values.map((v, i) => ({ name: colOf(v, R.calcs).label, data: cats.map((c) => c.v[i]) })),
    fmt: (i, v) => fval(colOf(d.values[i], R.calcs), v, R.sums[d.values[i]] || 'sum', R.fmt),
  };
}
