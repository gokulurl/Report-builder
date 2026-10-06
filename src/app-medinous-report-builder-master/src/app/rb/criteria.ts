import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RbStore, nextFilterId } from './store';
import {
  CAT, Criteria, Filter, MyReport, Notify, PERIOD_GROUPS, PHINT, PRESETS, Period, Sort, Template,
  colOf, distinct, fSummary, filterErr, lockedCol, opsFor, periodErr, rangeText,
} from './engine';
import { RbDialog, RbPop } from './ui';
import { ShareDialog } from './share-dialog';

interface Crit extends Criteria { kind: 'tpl' | 'rep'; id: string; tid: string; name: string; notify: Notify; openNow: boolean }

/** Before the run: period, criteria, columns and sort. Nothing loads until Run. */
@Component({
  selector: 'rb-criteria',
  imports: [FormsModule, MatIconModule, RbDialog, RbPop, ShareDialog],
  template: `
    @let c = crit();
    @let t = tpl();
    <div class="rb-page" [attr.data-rev]="s.rev()">
      <div class="rb-crumb">
        <button class="fx-link" (click)="router.navigate([s.home()])"><mat-icon>chevron_left</mat-icon>{{ s.role() === 'admin' ? 'Templates' : 'Billing reports' }}</button>
        <span class="muted">/</span><span>{{ c.name }}</span>
        @if (s.role() === 'admin') { <span class="rb-pill">Previewing as staff see it</span> }
      </div>
      <div class="rb-cwrap">
        <section class="fx-card rb-cform">
          <div class="rb-ch">
            <h1 class="rb-ctitle">{{ c.name }}</h1>
            @if (sharedBy()) { <div class="rb-reuse"><mat-icon>ios_share</mat-icon>Shared with you by {{ sharedBy() }}. You can run it and save your own copy. Changes here are not saved to theirs.</div> }
            <p class="muted tiny">{{ c.kind === 'rep' ? 'Your version of ' + t.title : t.desc }}. Check the period and filters, then run. No data loads until you click Run.</p>
          </div>

          <div class="rb-sec">
            <div class="rb-sh">Period <span class="req">*</span></div>
            <p class="muted tiny">Which {{ s.ds(t).noun }} to include, by <b>{{ s.periodLabel(t) }}</b>. Only rows dated inside this period are counted.</p>
            <div class="rb-pf" [class.bad]="periodError()">
              <div class="rb-prow">
                <select class="rb-sel" [ngModel]="c.period.preset" (ngModelChange)="setPeriod($event)" aria-label="Period" style="min-width:240px">
                  @for (g of periodGroups; track g[0]) {
                    <optgroup [label]="g[0]">@for (k of g[1]; track k) { <option [value]="k">{{ presets[k] }} {{ phint[k] || '' }}</option> }</optgroup>
                  }
                  <optgroup label="Other"><option value="custom">Custom dates</option></optgroup>
                </select>
                @if (c.period.preset === 'custom') {
                  <input type="date" class="rb-inp" [ngModel]="c.period.a" (ngModelChange)="c.period.a = $event; touch()" aria-label="From" />
                  <span class="muted">to</span>
                  <input type="date" class="rb-inp" [ngModel]="c.period.b" (ngModelChange)="c.period.b = $event; touch()" aria-label="To" />
                }
              </div>
              @if (!pe()) { <div class="rb-resolved"><mat-icon>event</mat-icon>{{ rangeText(c.period) }}</div> }
              @if (periodError()) { <div class="rb-ferr">{{ periodError() }}</div> }
              @if (!pe() && s.forcedBackground(t, c.period)) { <div class="rb-hint"><mat-icon>schedule</mat-icon>Periods longer than one year run in the background. You'll be notified when the result is ready.</div> }
            </div>
          </div>

          <div class="rb-sec">
            <div class="rb-sh">Criteria<span class="r muted tiny">optional, changes what the report searches for</span></div>
            @for (f of c.conds; track f.id; let i = $index) {
              @if (editing() === f.id) {
                <div class="rb-fcard edit">
                  <b>{{ colLabel(f.col) }}</b>
                  <select class="rb-sel full" [ngModel]="f.op" (ngModelChange)="f.op = $event; ferr.set('')" aria-label="Operator">
                    @for (o of ops(f); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
                  </select>
                  @switch (kind(f)) {
                    @case ('list') {
                      <div class="rb-vals">
                        @for (v of values(f.col); track v[0]) {
                          <label class="rb-vrow"><input type="checkbox" [checked]="(f.vals || []).includes(v[0])" (change)="toggleVal(f, v[0])" />{{ v[0] }}<span class="c">{{ v[1] }}</span></label>
                        }
                      </div>
                    }
                    @case ('text') { <input class="rb-inp full" [(ngModel)]="f.text" placeholder="At least 2 characters" aria-label="Value" /> }
                    @case ('preset') {
                      <select class="rb-sel full" [(ngModel)]="f.preset">@for (p of presetKeys; track p) { <option [value]="p">{{ presets[p] }}</option> }</select>
                    }
                    @case ('date') { <input type="date" class="rb-inp" [(ngModel)]="f.a" aria-label="Date" /> }
                    @default {
                      <div class="rb-prow">
                        <input class="rb-inp w100" [(ngModel)]="f.a" inputmode="decimal" aria-label="Value" />
                        @if (f.op === 'between') { <span class="muted">and</span><input class="rb-inp w100" [(ngModel)]="f.b" inputmode="decimal" aria-label="Second value" /> }
                      </div>
                    }
                  }
                  @if (ferr()) { <div class="rb-ferr">{{ ferr() }}</div> }
                  <div class="rb-fcard-acts"><button class="fx-btn fx-btn-primary fx-btn-sm" (click)="done(f)">Done</button></div>
                </div>
              } @else {
                <div class="rb-fcard" tabindex="0" (click)="edit(f.id)" (keydown.enter)="edit(f.id)">
                  <div class="rb-fhead"><b>{{ colLabel(f.col) }}</b>
                    <button class="fx-icon-btn sm" (click)="$event.stopPropagation(); removeCond(i)" aria-label="Remove criterion"><mat-icon>close</mat-icon></button></div>
                  <div class="muted tiny">{{ fsum(f) }}</div>
                </div>
              }
            }
            @if (!c.conds.length) { <p class="muted tiny">No criteria. Add one to narrow what the report finds, for example Invoice Status is Open or Sponsor is Warba.</p> }
            <button class="fx-link" (click)="picker.set($any($event.currentTarget))"><mat-icon>add</mat-icon>Add criterion</button>
          </div>

          @if (t.scope.length) {
            <div class="rb-sec">
              <div class="rb-sh">Data restrictions<span class="r muted tiny">set by IT, always applied</span></div>
              <div class="rb-chips">@for (f of t.scope; track f.id) { <span class="rb-chip lock"><mat-icon>lock</mat-icon>{{ colLabel(f.col) }} {{ fsum(f) }}</span> }</div>
            </div>
          }

          <div class="rb-sec">
            <div class="rb-sh">Columns<span class="r muted tiny">{{ t.cols.length - c.hidden.length }} of {{ t.cols.length }} shown</span></div>
            <div class="rb-cgrid">
              @for (id of t.cols; track id) {
                @let lr = locked(id);
                <label class="rb-ccol" [class.lk]="lr">
                  <input type="checkbox" [checked]="!c.hidden.includes(id)" [disabled]="!!lr" (change)="toggleCol(id)" />
                  <span>{{ colLabel(id) }}</span>
                  @if (restricted(id)) { <span class="rb-mk res">Restricted</span> }
                  @if (lr) { <span class="muted tiny rb-lockr"><mat-icon>lock</mat-icon>{{ lr }}</span> }
                </label>
              }
            </div>
          </div>

          <div class="rb-sec">
            <div class="rb-sh">Sort order</div>
            @for (i of [0, 1, 2]; track i) {
              @if (i === 0 || c.sorts[i - 1]) {
                <div class="rb-prow">
                  <span class="muted tiny rb-sortlab">{{ sortLabels[i] }}</span>
                  <select class="rb-sel grow" [ngModel]="c.sorts[i]?.col || ''" (ngModelChange)="setSort(i, $event)" [attr.aria-label]="sortLabels[i]">
                    <option value="">{{ i === 0 ? (t.sorts.length ? 'Report order: ' + colLabel(t.sorts[0].col) : 'Report order') : 'None' }}</option>
                    @for (id of sortable(); track id) { <option [value]="id">{{ colLabel(id) }}</option> }
                  </select>
                  @if (c.sorts[i]) {
                    <select class="rb-sel" [(ngModel)]="c.sorts[i].dir" aria-label="Direction"><option value="asc">Ascending</option><option value="desc">Descending</option></select>
                  }
                </div>
              }
            }
          </div>

          <div class="rb-sec">
            <div class="rb-sh">When it runs</div>
            <label class="fx-switch"><input type="checkbox" [(ngModel)]="c.openNow" /><span class="fx-switch-track"></span>
              <span><b>Open results as soon as they are ready</b><br /><span class="muted tiny">Turn off to carry on working. The result waits in Results</span></span></label>
            <div class="rb-prow" style="margin-top:10px">
              <span class="muted tiny">Tell me when it's ready</span>
              <select class="rb-sel" [(ngModel)]="c.notify" aria-label="Notification">
                <option value="none">Only on this screen</option><option value="app">In-app notification</option><option value="email">In-app and email link</option>
              </select>
            </div>
          </div>
        </section>

        <aside class="fx-card rb-csum">
          <div class="rb-sh">What will run</div>
          <div class="rb-sumline"><span class="muted tiny">Report</span><b>{{ t.title }}</b></div>
          <div class="rb-sumline"><span class="muted tiny">Period on {{ s.periodLabel(t) }}</span><b [class.warnt]="pe()">{{ pe() || rangeText(c.period) }}</b></div>
          @for (f of c.conds; track f.id) { <div class="rb-sumline"><span class="muted tiny">{{ colLabel(f.col) }}</span><b>{{ fsum(f) }}</b></div> }
          @for (f of t.scope; track f.id) { <div class="rb-sumline"><span class="muted tiny"><mat-icon class="xs">lock</mat-icon> {{ colLabel(f.col) }}</span><b>{{ (f.vals || []).join(', ') }}</b></div> }
          <div class="rb-sumline"><span class="muted tiny">Columns</span><b>{{ t.cols.length - c.hidden.length }} of {{ t.cols.length }}</b></div>
          <p class="muted tiny">Results stay valid for {{ expiryText(t.expiry) }}. Running the same values again in that time reopens the same result.@if ((!pe() && s.forcedBackground(t, c.period)) || t.heavy) { This run will probably go to the background.}</p>
          <button class="fx-btn fx-btn-primary rb-runbtn" (click)="run()"><mat-icon>play_arrow</mat-icon>Run report</button>
          <div class="rb-btnrow">
            @if (mine()) { <button class="fx-btn fx-btn-secondary" (click)="saveMine()"><mat-icon>save</mat-icon>Save</button> }
            <button class="fx-btn fx-btn-secondary" (click)="openSaveAs()"><mat-icon>add</mat-icon>{{ mine() ? 'Save as new version' : 'Save as my version' }}</button>
          </div>
          <div class="rb-btnrow">
            <button class="fx-btn fx-btn-secondary" (click)="schedOpen.set(true)"><mat-icon>event_repeat</mat-icon>Schedule</button>
            @if (mine()) { <button class="fx-btn fx-btn-secondary" (click)="sharing.set(mine()!)"><mat-icon>ios_share</mat-icon>Share</button> }
          </div>
        </aside>
      </div>
    </div>

    @if (picker(); as el) {
      <rb-pop [anchor]="el" (closed)="picker.set(null)">
        <div class="rb-mlab">Search for</div>
        <label class="fx-search rb-popsearch"><mat-icon>search</mat-icon><input [(ngModel)]="pq" placeholder="Search columns" aria-label="Search columns" /></label>
        @for (col of filterable(); track col.id) { <button class="rb-mi" (click)="addCond(col.id)">{{ col.label }}</button> }
        @empty { <div class="rb-mlab">No columns match</div> }
      </rb-pop>
    }
    @if (saveAsOpen()) {
      <rb-dialog title="Save as my version" (closed)="saveAsOpen.set(false)">
        <p class="muted tiny">Saves your period, filters, columns and sort, so next time you open it they are already set. Relative periods stay relative. Only you see it.</p>
        <input class="rb-inp full tall" [(ngModel)]="saveName" aria-label="Name" />
        @if (saveErr()) { <div class="rb-ferr">{{ saveErr() }}</div> }
        <ng-container foot>
          <button class="fx-btn fx-btn-secondary" (click)="saveAsOpen.set(false)">Cancel</button>
          <button class="fx-btn fx-btn-primary" (click)="saveAs()">Save</button>
        </ng-container>
      </rb-dialog>
    }
    @if (schedOpen()) {
      <rb-dialog [title]="'Schedule ' + c.name" (closed)="schedOpen.set(false)">
        <p class="muted tiny">Runs with the period and filters on this screen. {{ presets[c.period.preset] || 'Custom dates' }} stays relative, so it always means the period before each run. It runs with your permissions at the time it runs.</p>
        <div class="rb-frm">
          <label>How often<select class="rb-sel" [(ngModel)]="sched.freq">@for (f of freqs; track f) { <option>{{ f }}</option> }</select></label>
          <label>Time<input class="rb-inp" type="time" [(ngModel)]="sched.time" /></label>
          <label>Format<select class="rb-sel" [(ngModel)]="sched.fmt"><option>Excel</option><option>PDF</option><option>CSV</option></select></label>
        </div>
        <div class="rb-flab">Deliver to</div>
        <label class="rb-mrow"><input type="checkbox" checked disabled /><div><b>My dashboard</b><div class="muted tiny">Always. In Results</div></div></label>
        <label class="rb-mrow"><input type="checkbox" [(ngModel)]="sched.app" /><div><b>In-app notification</b></div></label>
        <label class="rb-mrow"><input type="checkbox" [(ngModel)]="sched.email" /><div><b>Email</b><div class="muted tiny">A link to the result. Opening it needs a login</div></div></label>
        @if (pe()) { <div class="rb-ferr">Set the period first.</div> }
        <ng-container foot>
          <button class="fx-btn fx-btn-secondary" (click)="schedOpen.set(false)">Cancel</button>
          <button class="fx-btn fx-btn-primary" [disabled]="!!pe()" (click)="createSchedule()">Create schedule</button>
        </ng-container>
      </rb-dialog>
    }
    @if (sharing(); as r) { <rb-share [report]="r" (closed)="sharing.set(null)" /> }`,
})
export class RbCriteria {
  presets = PRESETS; phint = PHINT; periodGroups = PERIOD_GROUPS; rangeText = rangeText;
  presetKeys = Object.keys(PRESETS);
  sortLabels = ['Sort by', 'Then by', 'And finally'];
  freqs = ['Every day', 'Working days (Sun to Thu)', 'Every Sunday', 'First day of the month'];
  crit = signal<Crit>(null!);
  editing = signal<number | null>(null);
  ferr = signal('');
  touched = signal(false);
  picker = signal<HTMLElement | null>(null);
  pq = '';
  saveAsOpen = signal(false); saveName = ''; saveErr = signal('');
  schedOpen = signal(false);
  sched = { freq: 'Working days (Sun to Thu)', time: '20:00', fmt: 'Excel', app: true, email: false };
  sharing = signal<MyReport | null>(null);

  constructor(public s: RbStore, public router: Router, route: ActivatedRoute) {
    route.paramMap.subscribe((p) => {
      const kind = p.get('kind') as 'tpl' | 'rep', id = p.get('id')!;
      const from = history.state?.crit as Criteria | undefined; // "Change values" from a result
      if (kind === 'rep') {
        const r = s.rep(id)!;
        this.crit.set({ kind, id, tid: r.tid, name: r.name, period: s.clone(r.period), conds: s.clone(r.conds), hidden: [...r.hidden], sorts: s.clone(r.sorts), notify: r.notify, openNow: r.openNow });
      } else {
        const t = s.tpl(id);
        this.crit.set({ kind, id, tid: id, name: t.title, period: s.clone(s.ds(t).defaultPeriod), conds: [], hidden: [], sorts: [], notify: 'none', openNow: true });
      }
      if (from) Object.assign(this.crit(), s.clone(from), { name: history.state?.name || this.crit().name });
      this.editing.set(null); this.touched.set(false);
    });
  }

  tpl = computed<Template>(() => { this.s.rev(); return this.s.tpl(this.crit().tid); });
  mine = computed(() => { this.s.rev(); const c = this.crit(); const r = c.kind === 'rep' ? this.s.rep(c.id) : undefined; return r && r.owner === 'me' ? r : null; });
  sharedBy = computed(() => { this.s.rev(); const c = this.crit(); const r = c.kind === 'rep' ? this.s.rep(c.id) : undefined; return r && r.owner !== 'me' ? r.owner : ''; });
  pe = () => { this.s.rev(); return periodErr(this.crit().period); };
  periodError = () => (this.touched() ? this.pe() : '');
  sortable = () => this.tpl().cols.filter((id) => !this.crit().hidden.includes(id));
  filterable = () => {
    const t = this.tpl(); const q = this.pq.toLowerCase();
    return CAT.filter((c) => c.id !== this.s.ds(t).periodCol && !c.restricted && c.type !== 'date' && (!q || c.label.toLowerCase().includes(q)));
  };

  touch() { this.touched.set(true); this.s.bump(); }
  colLabel(id: string) { return colOf(id, this.tpl().calcs).label; }
  restricted(id: string) { return !!colOf(id, this.tpl().calcs).restricted; }
  locked(id: string) { return lockedCol(this.tpl(), id); }
  fsum(f: Filter) { return fSummary(f, this.tpl().calcs); }
  ops(f: Filter) { return opsFor(colOf(f.col, this.tpl().calcs)); }
  values(col: string) { return distinct(col); }
  kind(f: Filter) {
    const c = colOf(f.col, this.tpl().calcs);
    if (c.type === 'text') return ['in', 'notin'].includes(f.op) ? 'list' : 'text';
    if (c.type === 'date') return f.op === 'preset' ? 'preset' : 'date';
    return 'num';
  }
  expiryText(m: number) { return m < 60 ? m + ' minutes' : m === 60 ? '1 hour' : m === 1440 ? '1 day' : m / 60 + ' hours'; }

  setPeriod(v: string) { this.crit().period = v === 'custom' ? { preset: 'custom', a: '', b: '' } : { preset: v }; this.touch(); }
  addCond(col: string) {
    const ty = colOf(col).type; const f: Filter = { id: nextFilterId(), col, op: ty === 'text' ? 'in' : ty === 'date' ? 'preset' : 'gt', vals: [], preset: 'thismonth', a: '' };
    this.crit().conds.push(f); this.editing.set(f.id); this.ferr.set(''); this.picker.set(null); this.pq = ''; this.s.bump();
  }
  edit(id: number) { this.editing.set(id); this.ferr.set(''); }
  done(f: Filter) { const e = filterErr(f, this.tpl().calcs); if (e) { this.ferr.set(e); return; } this.editing.set(null); this.ferr.set(''); this.s.bump(); }
  removeCond(i: number) { this.crit().conds.splice(i, 1); this.editing.set(null); this.s.bump(); }
  toggleVal(f: Filter, v: string) { f.vals = f.vals || []; f.vals = f.vals.includes(v) ? f.vals.filter((x) => x !== v) : [...f.vals, v]; this.ferr.set(''); this.s.bump(); }
  toggleCol(id: string) {
    const c = this.crit(); c.hidden = c.hidden.includes(id) ? c.hidden.filter((x) => x !== id) : [...c.hidden, id];
    c.sorts = c.sorts.filter((s) => !c.hidden.includes(s.col)); this.s.bump();
  }
  setSort(i: number, col: string) {
    const c = this.crit();
    if (!col) c.sorts = c.sorts.slice(0, i); else c.sorts[i] = { col, dir: (c.sorts[i] || ({} as Sort)).dir || 'asc' };
    this.s.bump();
  }

  private finishEditing(): boolean {
    const f = this.crit().conds.find((x) => x.id === this.editing());
    if (f) { const e = filterErr(f, this.tpl().calcs); if (e) { this.ferr.set(e); return false; } this.editing.set(null); }
    return true;
  }
  run() {
    this.touched.set(true);
    if (!this.finishEditing()) return;
    const c = this.crit(), t = this.tpl();
    this.s.startRun(t, c, c.kind === 'rep' ? c.id : t.id, c.name);
  }
  saveMine() {
    if (!this.finishEditing()) return;
    const r = this.mine()!; const c = this.crit();
    Object.assign(r, { period: this.s.clone(c.period), conds: this.s.clone(c.conds), hidden: [...c.hidden], sorts: this.s.clone(c.sorts), notify: c.notify, openNow: c.openNow });
    this.s.bump(); this.s.toast('Your version is saved');
  }
  openSaveAs() {
    if (!this.finishEditing()) return;
    const c = this.crit(); this.saveName = this.mine() ? c.name + ' (copy)' : c.name; this.saveErr.set(''); this.saveAsOpen.set(true);
  }
  saveAs() {
    const n = this.saveName.trim();
    if (n.length < 3) { this.saveErr.set('Enter a name of at least 3 characters.'); return; }
    if (this.s.reps.some((r) => r.name.toLowerCase() === n.toLowerCase())) { this.saveErr.set('You already have a report with this name.'); return; }
    const r = this.s.saveAsVersion(this.crit().tid, n, this.crit());
    this.saveAsOpen.set(false); this.s.toast('Saved. It appears under this report in Reports');
    this.router.navigate(['/run', 'rep', r.id], { replaceUrl: true });
  }
  createSchedule() {
    // A schedule runs a saved version, so the values on screen are saved first: into this version if it is yours, else a new one
    const c = this.crit(); const mine = this.mine(); let src = mine?.id; let updated = false;
    if (mine) {
      const now = JSON.stringify([c.period, c.conds, c.hidden, c.sorts]);
      updated = now !== JSON.stringify([mine.period, mine.conds, mine.hidden, mine.sorts]);
      if (updated) this.saveMine();
    } else src = this.s.saveAsVersion(c.tid, c.name, c).id;
    const deliver = ['Dashboard']; if (this.sched.app) deliver.push('In-app notification'); if (this.sched.email) deliver.push('Email link');
    this.s.addSchedule({ src: src!, freq: this.sched.freq, time: this.sched.time, deliver, fmt: this.sched.fmt, on: true });
    this.schedOpen.set(false);
    this.s.toast(updated ? 'Schedule created. Your version now uses these values' : mine ? 'Schedule created. Find it under Scheduled' : 'Schedule created and saved as your version');
  }
}
