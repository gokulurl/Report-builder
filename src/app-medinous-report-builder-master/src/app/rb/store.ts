import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CalcCol, DATASETS, Filter, MyReport, Notify, Row, Spec, Template, TODAY, colOf, periodDays, periodErr, rangeText } from './engine';
import { Doc, buildR, clauseErr, docSentence, evalAll, fromConds } from './staff';
import { rowsFor } from './engine';

export type Role = 'admin' | 'user';
export interface Schedule { id: number; src: string; freq: string; time: string; deliver: string[]; fmt: string; on: boolean }
/** `key` is the report the note belongs to ("rep:m1" or "tpl:t3"); opening it shows that report's Results tab. */
export interface Note { id: number; text: string; key: string; at: Date; read: boolean; email: boolean }
export interface Folder { id: string; name: string }
/** The open report's working copy. Saved reports keep their own values until Save. */
export interface DocState extends Doc { kind: 'tpl' | 'rep'; id: string; tid: string; name: string; owner: string; saved: string }
export interface Run { R: Spec; rows: Row[]; snap: string; at: Date; until: Date; ms: number; sentence: string }
export interface Job { t0: number; name: string; snap: string }

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v));
let fid = 100, ruid = 1;
export const nextFilterId = () => fid++;
export const nextRuleId = () => ruid++;
export const snapOf = (d: Doc) => JSON.stringify({ period: d.period, clauses: d.clauses.map((c) => ({ field: c.field, vals: c.vals, exclude: c.exclude, from: c.from, to: c.to })), hidden: d.hidden, sorts: d.sorts, groups: d.groups });

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
  private tid = 20; private repid = 1; private schid = 1; private nid = 1;

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
    { id: 'm' + this.repid++, tid: 't5', name: 'Warba open invoices, last 30 days', period: { preset: 'last30' }, conds: [{ id: fid++, col: 'sponsor', op: 'in', vals: ['Warba'] }], hidden: ['mobile'], sorts: [{ col: 'net', dir: 'desc' }], notify: 'none', openNow: true, owner: 'me', share: { mode: 'people', people: ['Rahul Nair'] }, folder: 'fd', fav: true },
    { id: 'm' + this.repid++, tid: 't1', name: 'Radiology revenue, last month', period: { preset: 'lastmonth' }, conds: [{ id: fid++, col: 'rtype', op: 'in', vals: ['Radiology'] }], hidden: [], sorts: [], notify: 'none', openNow: true, owner: 'me', share: { mode: 'private', people: [] } },
    { id: 'm' + this.repid++, tid: 't4', name: 'Month-end discounts', period: { preset: 'lastmonth' }, conds: [], hidden: [], sorts: [], notify: 'none', openNow: true, owner: 'me', share: { mode: 'private', people: [] }, folder: 'fm' },
    { id: 'm' + this.repid++, tid: 't5', name: 'Insurance invoices over KD 100', period: { preset: 'last90' }, conds: [{ id: fid++, col: 'scat', op: 'in', vals: ['Insurance'] }, { id: fid++, col: 'net', op: 'gt', a: '100' }], hidden: [], sorts: [{ col: 'net', dir: 'desc' }], notify: 'none', openNow: true, owner: 'Fatima Al Sabah', share: { mode: 'people', people: ['me'] }, fav: true },
  ];
  folders: Folder[] = [{ id: 'fd', name: 'Daily checks' }, { id: 'fm', name: 'Month end' }];
  scheds: Schedule[] = [{ id: this.schid++, src: 'm1', freq: 'Working days (Sun to Thu)', time: '07:30', deliver: ['Dashboard', 'In-app notification'], fmt: 'Excel', on: true }];
  notes: Note[] = [];
  /** Last finished run and any running job, per report key, so a run survives leaving the page. */
  runs: Record<string, Run> = {};
  jobs: Record<string, Job> = {};
  /** The open report's working copy, per key, so switching away and back keeps unsaved changes. */
  docs: Record<string, DocState> = {};
  /** Template the person last started from; New report opens on it. */
  lastTemplate = '';

  constructor(private router: Router) {
    this.reps.forEach((r, i) => {
      r.clauses = fromConds(r.conds); r.groups = this.tpl(r.tid).groups.slice(0, 2); r.modified = new Date(2026, 9, 1 + i);
    });
  }

  bump() { this.rev.update((v) => v + 1); }
  setRole(r: Role) { this.role.set(r); sessionStorage.setItem('rb-role', r); }
  home() { return this.role() === 'admin' ? '/it' : '/reports'; }
  toast(text: string, open?: string, bad = false) {
    this.toastMsg.set({ text, open, bad }); clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMsg.set(null), 4200);
  }

  tpl(id: string) { return this.templates.find((t) => t.id === id)!; }
  rep(id: string) { return this.reps.find((r) => r.id === id); }
  ds(t: Template) { return DATASETS[t.entity]; }
  periodLabel(t: Template) { return colOf(this.ds(t).periodCol).label; }
  noun(t: Template) { return this.ds(t).noun || 'records'; }
  scopeText(t: Template) { return t.scope.map((f) => colOf(f.col).label + ' ' + (f.vals || []).join(', ')).join('; '); }
  library() { return this.templates.filter((t) => !t.removed && t.status === 'published' && t.places.includes('Billing')); }

  /* ---------- the open report ---------- */
  /** Open a report (or a template as a new unsaved one). Keeps any unsaved working copy from earlier. */
  doc(kind: 'tpl' | 'rep', id: string): DocState {
    const key = kind + ':' + id;
    if (!this.docs[key]) {
      let d: DocState;
      if (kind === 'rep') {
        const r = this.rep(id)!;
        d = { kind, id, tid: r.tid, name: r.name, owner: r.owner, period: clone(r.period), clauses: clone(r.clauses || []), hidden: [...r.hidden], sorts: clone(r.sorts), groups: [...(r.groups || [])], saved: '' };
      } else {
        const t = this.tpl(id);
        d = { kind, id, tid: id, name: t.title, owner: 'me', period: clone(this.ds(t).defaultPeriod), clauses: [], hidden: [], sorts: [], groups: t.groups.slice(0, 2), saved: '' };
      }
      d.saved = snapOf(d); this.docs[key] = d;
    }
    return this.docs[key];
  }
  keyOf(d: DocState) { return d.kind + ':' + d.id; }
  dirty(d: DocState) { return snapOf(d) !== d.saved; }
  errors(d: DocState) { return d.clauses.filter((c) => clauseErr(c)).length + (periodErr(d.period) ? 1 : 0); }
  forcedBackground(t: Template, d: Doc) { return periodDays(d.period) > this.ds(t).maxInteractiveDays; }

  /** Returns 'invalid' when Settings need fixing, 'reused' when the same settings ran within the validity window. */
  run(d: DocState, notify: Notify): 'invalid' | 'reused' | 'started' {
    d.clauses.forEach((c) => (c.touched = true));
    if (this.errors(d)) { this.bump(); return 'invalid'; }
    const t = this.tpl(d.tid), key = this.keyOf(d), snap = snapOf(d);
    const last = this.runs[key];
    if (last && last.snap === snap && last.until > new Date()) { this.toast(`Same settings as the run at ${last.at.toTimeString().slice(0, 5)}. Showing that result`); return 'reused'; }
    const job: Job = { t0: Date.now(), name: d.name, snap }; this.jobs[key] = job;
    const dur = t.heavy || this.forcedBackground(t, d) ? 14000 : 600;
    const tick = setInterval(() => (this.jobs[key] === job ? this.bump() : clearInterval(tick)), 1000);
    setTimeout(() => {
      if (this.jobs[key] !== job) return;
      clearInterval(tick);
      const R = buildR(t, d);
      const rows = rowsFor(R).filter((r) => evalAll(d.clauses, r));
      if (d.kind === 'rep') { const rr = this.rep(d.id); if (rr) rr.lastRun = new Date(); }
      this.runs[key] = { R, rows, snap, at: new Date(), until: new Date(Date.now() + t.expiry * 60000), ms: (Date.now() - job.t0) / 1000, sentence: docSentence(t, d, this.noun(t)).replace(/^Shows \S+ \S+ /, '') };
      delete this.jobs[key];
      const here = this.router.url.startsWith(`/report/${d.kind}/${d.id}`);
      if (dur > 5000 || notify !== 'none' || !here) {
        this.notes.unshift({ id: this.nid++, text: `${d.name} is ready`, key, at: new Date(), read: false, email: notify === 'email' });
        this.toast(`${d.name} is ready${notify === 'email' ? '. A link was also emailed to you' : ''}`, here ? undefined : key);
      }
      this.bump();
    }, dur);
    this.bump();
    return 'started';
  }
  cancel(d: DocState) { delete this.jobs[this.keyOf(d)]; this.toast('Run cancelled'); this.bump(); }

  /** Save the working copy into the user's own report. */
  save(d: DocState) {
    const r = this.rep(d.id)!;
    Object.assign(r, { period: clone(d.period), clauses: clone(d.clauses), hidden: [...d.hidden], sorts: clone(d.sorts), groups: [...d.groups], modified: new Date() });
    d.saved = snapOf(d); this.bump();
  }
  /** Save the working copy as a new report of the user's own; the open report becomes that one. */
  saveAs(d: DocState, name: string, folder: string | null = null): MyReport {
    const r: MyReport = {
      id: 'm' + this.repid++, tid: d.tid, name, period: clone(d.period), conds: [], clauses: clone(d.clauses), hidden: [...d.hidden], sorts: clone(d.sorts), groups: [...d.groups],
      notify: 'none', openNow: true, owner: 'me', share: { mode: 'private', people: [] }, folder, modified: new Date(),
    };
    this.reps.push(r);
    const oldKey = this.keyOf(d);
    Object.assign(d, { kind: 'rep', id: r.id, name, owner: 'me' }); d.saved = snapOf(d);
    this.docs[this.keyOf(d)] = d; delete this.docs[oldKey];
    if (this.runs[oldKey]) { this.runs[this.keyOf(d)] = this.runs[oldKey]; delete this.runs[oldKey]; }
    this.bump(); return r;
  }
  /** New report from a template or a copy of another report. */
  createReport(o: { tid: string; name: string; period: MyReport['period']; from?: MyReport | null; folder: string | null }): MyReport {
    const src = o.from;
    const r: MyReport = {
      id: 'm' + this.repid++, tid: o.tid, name: o.name, period: clone(o.period), conds: [], clauses: src ? clone(src.clauses || []) : [],
      groups: src ? [...(src.groups || [])] : this.tpl(o.tid).groups.slice(0, 2), hidden: src ? [...src.hidden] : [], sorts: src ? clone(src.sorts) : [],
      notify: 'none', openNow: true, owner: 'me', share: { mode: 'private', people: [] }, folder: o.folder, modified: new Date(),
    };
    this.reps.push(r); this.bump(); return r;
  }
  duplicate(r: MyReport) {
    const c: MyReport = Object.assign(clone(r), { id: 'm' + this.repid++, name: r.name + ' (copy)', owner: 'me', share: { mode: 'private', people: [] }, lastRun: null, modified: new Date(), fav: false });
    this.reps.push(c); this.bump(); return c;
  }
  deleteRep(id: string) {
    this.reps = this.reps.filter((r) => r.id !== id); this.scheds = this.scheds.filter((s) => s.src !== id);
    delete this.docs['rep:' + id]; delete this.runs['rep:' + id]; this.bump();
  }
  addSchedule(s: Omit<Schedule, 'id'>) { this.scheds.push({ id: this.schid++, ...s }); this.bump(); }
  addFolder(name: string) { const f = { id: 'f' + Date.now(), name }; this.folders.push(f); this.bump(); return f; }
  periodText(r: MyReport) { return `${this.periodLabel(this.tpl(r.tid))}: ${rangeText(r.period, true)}`; }

  /* ---------- templates (IT) ---------- */
  newTemplateId() { return 't' + this.tid++; }
  blankTemplate(module: string, entity: string): Template {
    return T_({ id: this.newTemplateId(), title: 'Untitled template', status: 'draft', module, entity, places: [module] });
  }
  saveTemplate(d: Template) {
    const def = clone(d); def.edited = '12 Oct 2026';
    const i = this.templates.findIndex((t) => t.id === d.id);
    if (i >= 0) this.templates[i] = def; else this.templates.push(def);
    this.bump();
  }
  clone<T>(o: T) { return clone(o); }
  get today() { return TODAY; }
  calcsOf(id: string): CalcCol[] { return this.tpl(id)?.calcs || []; }
}
