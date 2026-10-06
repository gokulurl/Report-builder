import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  CalcCol, Criteria, DATASETS, Filter, MyReport, Notify, Period, Row, Sort, Spec, Template, TODAY,
  colOf, effective, fSummary, periodDays, periodErr, rangeText, rowsFor,
} from './engine';

export type Role = 'admin' | 'user';
export interface Result {
  id: string; tid: string; key: string; src: string; name: string; crit: Criteria; R: Spec;
  status: 'running' | 'ready'; t0: number; ranAt: Date; validUntil: Date; stripText: string; rows: Row[];
  reused: boolean; notify: Notify; ms?: number; savedName?: string; keepUntil?: Date;
}
export interface Schedule { id: number; src: string; freq: string; time: string; deliver: string[]; fmt: string; on: boolean }
export interface Note { id: number; text: string; res: string; at: Date; read: boolean; email: boolean }
export interface ViewState { sort: Sort | null; rowf: { col: string; vals: string[] }[]; pins: string[]; widths: Record<string, number>; wrap: string[]; density: '' | 'compact'; stab: number }
export interface LiveView extends ViewState { find: string; only: boolean; page: number; collapsed: string[] | null; active: number | null }
export interface NamedView { id: number; name: string; def: boolean; state: ViewState }

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v));
let fid = 100, ruid = 1;
export const nextFilterId = () => fid++;
export const nextRuleId = () => ruid++;

const FX = (col: string, vals: string[]): Filter => ({ id: fid++, col, op: 'in', vals, fixed: true });
const TBASE = (): Template => ({
  id: '', title: '', desc: '', module: 'Billing', entity: 'inv_detail', cols: [], fmt: {}, groups: [], sums: {},
  show: { detail: true, sub: true, grand: true }, start: 'expanded', sorts: [], calcs: [],
  display: { mode: 'table', type: 'bar', label: '', values: [], orient: 'portrait' }, rules: [], drill: [], widths: {}, wrap: [], pins: [],
  scope: [], summaries: [], expiry: 60, places: ['Billing'], status: 'published', removed: false, heavy: false, edited: '02 Oct 2026',
});
const T_ = (o: Partial<Template>): Template => Object.assign(TBASE(), o);

@Injectable({ providedIn: 'root' })
export class RbStore {
  /** Bumped on every change; screens read it so they redraw (the data itself is plain objects). */
  readonly rev = signal(0);
  readonly role = signal<Role>((sessionStorage.getItem('rb-role') as Role) || 'user');
  readonly toastMsg = signal<{ text: string; open?: string; bad?: boolean } | null>(null);
  private toastTimer: any;
  private tid = 20; private repid = 1; private resid = 1; private schid = 1; private nid = 1;

  templates: Template[] = [
    T_({ id: 't1', title: 'Revenue by sponsor and revenue type', desc: 'Billed revenue per sponsor, split by revenue type', cols: ['inv', 'date', 'svc', 'qty', 'net'], groups: ['sponsor', 'rtype'], sums: { inv: 'countd', qty: 'sum', net: 'sum' }, start: 'collapsed',
      rules: [{ id: ruid++, col: 'net', op: 'gt', a: '500', sw: 'gbg', applies: 'summary' }],
      summaries: [{ id: 's1', name: 'By doctor', groups: ['doc'], sums: { inv: 'countd', net: 'sum' } }, { id: 's2', name: 'By department', groups: ['dept'], sums: { inv: 'countd', qty: 'sum', net: 'sum' } }] }),
    T_({ id: 't2', title: 'Revenue by department', desc: 'One line per department, with a chart. Click a department to see its lines', cols: ['dept', 'inv', 'net'], groups: ['dept'], sums: { inv: 'countd', net: 'sum' }, show: { detail: false, sub: true, grand: true },
      display: { mode: 'both', type: 'bar', label: 'dept', values: ['net'], orient: 'portrait' }, drill: [{ col: 'dept', target: 't7' }], places: ['Billing', 'Administration'] }),
    T_({ id: 't3', title: 'Pharmacy sales by item', desc: 'Quantity and value of each item dispensed', cols: ['inv', 'date', 'pname', 'qty', 'net'], groups: ['svc'], sums: { qty: 'sum', net: 'sum' }, start: 'collapsed',
      display: { mode: 'both', type: 'doughnut', label: 'svc', values: ['net'], orient: 'portrait' }, scope: [FX('rtype', ['Pharmacy'])] }),
    T_({ id: 't4', title: 'Discounts given by sponsor', desc: 'Gross, discount and discount rate per insurance sponsor', cols: ['inv', 'svc', 'gross', 'disc', 'k1'], groups: ['sponsor'], sums: { gross: 'sum', disc: 'sum', k1: 'sum' }, start: 'collapsed',
      calcs: [{ id: 'k1', label: 'Discount rate', type: 'calc', op: 'pct', a: { kind: 'col', v: 'disc' }, b: { kind: 'col', v: 'gross' }, kfmt: 'pct', dp: 1, sum: ['sum'] }], scope: [FX('scat', ['Insurance'])] }),
    T_({ id: 't5', title: 'Open invoices to follow up', desc: 'Open invoices with the patient contact number, largest first', cols: ['inv', 'date', 'pname', 'mobile', 'sponsor', 'net'], sums: { net: 'sum' }, sorts: [{ col: 'net', dir: 'desc' }],
      scope: [FX('status', ['Open'])], rules: [{ id: ruid++, col: 'net', op: 'gt', a: '150', sw: 'rbg', applies: 'detail' }], pins: ['inv'], places: ['Billing', 'Registration'],
      summaries: [{ id: 's3', name: 'By sponsor', groups: ['sponsor'], sums: { inv: 'countd', net: 'sum' } }, { id: 's4', name: 'By patient', groups: ['pname'], sums: { inv: 'countd', net: 'sum' } }] }),
    T_({ id: 't6', title: 'Invoice detail', desc: 'Every billed line. Large report, often runs in the background', cols: ['inv', 'date', 'pname', 'sponsor', 'svc', 'rtype', 'doc', 'qty', 'gross', 'disc', 'net'], sums: { net: 'sum' }, heavy: true }),
    T_({ id: 't7', title: 'Service lines by department', desc: 'Every billed line with department and doctor', cols: ['inv', 'date', 'pname', 'dept', 'svc', 'doc', 'net'], sums: { net: 'sum' }, sorts: [{ col: 'date', dir: 'desc' }] }),
  ];
  reps: MyReport[] = [
    { id: 'm' + this.repid++, tid: 't5', name: 'Warba open invoices, last 30 days', period: { preset: 'last30' }, conds: [{ id: fid++, col: 'sponsor', op: 'in', vals: ['Warba'] }], hidden: ['mobile'], sorts: [{ col: 'net', dir: 'desc' }], notify: 'none', openNow: true, owner: 'me', share: { mode: 'people', people: ['Rahul Nair'] } },
    { id: 'm' + this.repid++, tid: 't1', name: 'Radiology revenue, last month', period: { preset: 'lastmonth' }, conds: [{ id: fid++, col: 'rtype', op: 'in', vals: ['Radiology'] }], hidden: [], sorts: [], notify: 'none', openNow: true, owner: 'me', share: { mode: 'private', people: [] } },
    { id: 'm' + this.repid++, tid: 't4', name: 'Month-end discounts', period: { preset: 'lastmonth' }, conds: [], hidden: [], sorts: [], notify: 'none', openNow: true, owner: 'me', share: { mode: 'private', people: [] } },
    { id: 'm' + this.repid++, tid: 't5', name: 'Insurance invoices over KD 100', period: { preset: 'last90' }, conds: [{ id: fid++, col: 'scat', op: 'in', vals: ['Insurance'] }, { id: fid++, col: 'net', op: 'gt', a: '100' }], hidden: [], sorts: [{ col: 'net', dir: 'desc' }], notify: 'none', openNow: true, owner: 'Fatima Al Sabah', share: { mode: 'people', people: ['me'] } },
  ];
  results: Result[] = [];
  scheds: Schedule[] = [{ id: this.schid++, src: 'm1', freq: 'Working days (Sun to Thu)', time: '07:30', deliver: ['Dashboard', 'In-app notification'], fmt: 'Excel', on: true }];
  notes: Note[] = [];
  views: Record<string, LiveView> = {};
  namedViews: Record<string, NamedView[]> = {};
  fav = new Set(['t1', 't2']);
  /** Results opened by drill-through, newest last, so the page can offer "Back to …". */
  backStack: string[] = [];

  constructor(private router: Router) {}

  bump() { this.rev.update((v) => v + 1); }
  setRole(r: Role) { this.role.set(r); sessionStorage.setItem('rb-role', r); }
  home() { return this.role() === 'admin' ? '/it' : '/reports'; }
  toast(text: string, open?: string, bad = false) {
    this.toastMsg.set({ text, open, bad }); clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMsg.set(null), 4200);
  }

  tpl(id: string) { return this.templates.find((t) => t.id === id)!; }
  rep(id: string) { return this.reps.find((r) => r.id === id); }
  res(id: string) { return this.results.find((r) => r.id === id); }
  ds(t: Template) { return DATASETS[t.entity]; }
  periodLabel(t: Template) { return colOf(this.ds(t).periodCol).label; }
  strip(t: Template, c: Criteria) {
    const parts = [`${this.periodLabel(t)}: ${rangeText(c.period, true)}`];
    (c.conds || []).forEach((f) => parts.push(`${colOf(f.col, t.calcs).label} ${fSummary(f, t.calcs)}`));
    return parts.join(' · ');
  }
  scopeText(t: Template) { return t.scope.map((f) => colOf(f.col).label + ' ' + (f.vals || []).join(', ')).join('; '); }
  shareText(r: MyReport) {
    if (r.share.mode === 'private') return ''; if (r.share.mode === 'module') return 'Shared with Billing';
    const n = r.share.people.length; return `Shared with ${n} ${n === 1 ? 'person' : 'people'}`;
  }
  lastResult(src: string) { return this.results.filter((r) => r.src === src).slice(-1)[0]; }
  forcedBackground(t: Template, p: Period) { return periodDays(p) > this.ds(t).maxInteractiveDays; }
  expired(r: Result) { return r.status === 'ready' && r.validUntil < new Date() && !r.savedName; }

  /* ---------- running ---------- */
  startRun(t: Template, c: Criteria & { notify: Notify; openNow: boolean }, srcId: string, srcName: string): boolean {
    if (periodErr(c.period)) { this.toast('Set the period first', '', true); return false; }
    const key = JSON.stringify([t.id, c.period, c.conds, c.hidden, c.sorts]);
    // Same values inside the validity window reopen the same result instead of querying again
    const reuse = this.results.find((r) => r.key === key && r.status === 'ready' && !r.savedName && r.validUntil > new Date());
    if (reuse) { reuse.reused = true; this.router.navigate(['/result', reuse.id]); this.bump(); return true; }
    const R = effective(t, c);
    const r: Result = {
      id: 'res' + this.resid++, tid: t.id, key, src: srcId, name: srcName, crit: clone({ period: c.period, conds: c.conds, hidden: c.hidden, sorts: c.sorts }),
      R, status: 'running', t0: Date.now(), ranAt: new Date(), validUntil: new Date(Date.now() + t.expiry * 60000), stripText: this.strip(t, c), rows: [], reused: false, notify: c.notify,
    };
    this.results.push(r);
    const finish = () => {
      if (r.status !== 'running') return;
      r.rows = rowsFor(R); r.status = 'ready'; r.ranAt = new Date(); r.validUntil = new Date(Date.now() + t.expiry * 60000); r.ms = (Date.now() - r.t0) / 1000;
      const here = this.router.url === '/result/' + r.id;
      if (r.notify !== 'none' || !here) this.notes.unshift({ id: this.nid++, text: `${r.name} is ready`, res: r.id, at: new Date(), read: false, email: r.notify === 'email' });
      if (!here) this.toast(`${r.name} is ready${r.notify === 'email' ? '. A link was also emailed to you' : ''}`, r.id);
      this.bump();
    };
    const dur = t.heavy || this.forcedBackground(t, c.period) ? 15000 : 700;
    if (c.openNow) this.router.navigate(['/result', r.id]);
    else { this.router.navigate([this.home()], { queryParams: { tab: 'results' } }); this.toast('Running. You can carry on working; it will be in Results'); }
    const tick = setInterval(() => { if (r.status !== 'running') { clearInterval(tick); return; } this.bump(); }, 1000);
    setTimeout(finish, dur);
    this.bump();
    return true;
  }
  runRep(id: string) {
    const r = this.rep(id)!; const t = this.tpl(r.tid);
    this.startRun(t, { period: r.period, conds: r.conds, hidden: r.hidden, sorts: r.sorts, notify: r.notify, openNow: r.openNow }, r.id, r.name);
  }
  cancelRun(id: string) {
    const i = this.results.findIndex((x) => x.id === id); if (i >= 0) this.results.splice(i, 1);
    this.toast('Run cancelled'); this.bump();
  }

  /* ---------- views (look only; never re-query) ---------- */
  viewOf(r: Result): LiveView {
    const k = r.src;
    if (!this.views[k]) {
      const t = this.tpl(r.tid);
      this.views[k] = { sort: null, rowf: [], pins: [...t.pins], widths: { ...t.widths }, wrap: [...t.wrap], density: '', stab: 0, find: '', only: false, page: 0, collapsed: null, active: null };
      const d = (this.namedViews[k] || []).find((x) => x.def);
      if (d) { Object.assign(this.views[k], clone(d.state)); this.views[k].active = d.id; }
    }
    return this.views[k];
  }
  viewState(v: LiveView): ViewState {
    return clone({ sort: v.sort, rowf: v.rowf, pins: v.pins, widths: v.widths, wrap: v.wrap, density: v.density, stab: v.stab });
  }

  /* ---------- my versions ---------- */
  saveAsVersion(tid: string, name: string, c: Criteria & { notify: Notify; openNow: boolean }) {
    const r: MyReport = { id: 'm' + this.repid++, tid, name, period: clone(c.period), conds: clone(c.conds), hidden: [...c.hidden], sorts: clone(c.sorts), notify: c.notify, openNow: c.openNow, owner: 'me', share: { mode: 'private', people: [] } };
    this.reps.push(r); this.bump(); return r;
  }
  deleteRep(id: string) {
    this.reps = this.reps.filter((r) => r.id !== id); this.scheds = this.scheds.filter((s) => s.src !== id); this.bump();
  }
  addSchedule(s: Omit<Schedule, 'id'>) { this.scheds.push({ id: this.schid++, ...s }); this.bump(); }

  /* ---------- templates (IT) ---------- */
  newTemplateId() { return 't' + this.tid++; }
  blankTemplate(module: string, entity: string): Template {
    return T_({ id: this.newTemplateId(), title: 'Untitled template', status: 'draft', module, entity, places: [module] });
  }
  saveTemplate(d: Template) {
    const def = clone(d); def.edited = '06 Oct 2026';
    const i = this.templates.findIndex((t) => t.id === d.id);
    if (i >= 0) this.templates[i] = def; else this.templates.push(def);
    this.bump();
  }
  clone<T>(o: T) { return clone(o); }
  get today() { return TODAY; }
  calcsOf(id: string): CalcCol[] { return this.tpl(id)?.calcs || []; }
}
