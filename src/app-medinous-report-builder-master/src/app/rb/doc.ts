import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DocState, RbStore, Run } from './store';
import { CAT, Clause, MyReport, Notify, Period, Row, Spec, Template, allKeys, buildTable, chartModel, cmp, colOf, distinct, fval, hm, isNum, periodErr, resolveRange } from './engine';
import { TOPICS, clauseErr, docSentence, groupable, isAmount, lockedColD, newClause, rowsForDoc } from './staff';
import { RbChart, RbDialog, RbPop, RbTable } from './ui';
import { RbPeriod, ScheduleDialog } from './dialogs';
import { ShareDialog } from './share-dialog';

type Pop = { kind: 'run' | 'more' | 'add' | 'vals' | 'export' | 'header'; el: HTMLElement; clause?: Clause; col?: string } | null;

/** One report: Settings (period, grouping, filters, live preview) and Results. Nothing runs until Run. */
@Component({
  selector: 'rb-doc',
  imports: [FormsModule, MatIconModule, MatTooltipModule, RbTable, RbChart, RbDialog, RbPop, RbPeriod, ScheduleDialog, ShareDialog],
  template: `
    @let d = doc();
    @let t = tpl();
    <div class="rb-page rb-docpage" [attr.data-rev]="s.rev()">
      <section class="fx-card rb-doc">
        <div class="rb-qhead">
          <div class="rb-qcrumb">
            <button class="fx-link" (click)="back()"><mat-icon>chevron_left</mat-icon>{{ s.role() === 'admin' ? 'Templates' : 'Reports' }}</button>
            <span class="muted">/</span>
            @if (mineRep(); as r) {
              <button class="fx-icon-btn rb-star" [class.on]="r.fav" (click)="r.fav = !r.fav; s.bump(); s.toast(r.fav ? 'Added to Favourites' : 'Removed from Favourites')" [attr.aria-label]="r.fav ? 'Remove from favourites' : 'Add to favourites'" [attr.aria-pressed]="!!r.fav"><mat-icon>{{ r.fav ? 'star' : 'star_border' }}</mat-icon></button>
            }
            <h1 class="rb-qtitle">{{ d.name }}</h1>
            @if (d.name !== t.title) { <span class="muted tiny">from {{ t.title }}</span> }
            @if (d.kind === 'rep') { @if (own()) { <span class="rb-tag mute">My version</span> } @else { <span class="rb-tag vio">Shared by {{ d.owner }}</span> } }
            @else if (s.role() === 'admin') { <span class="rb-pill">Previewing as staff see it</span> }
            @else { <span class="rb-tag mute">Not saved yet</span> }
          </div>
          <div class="rb-qbar">
            <div class="rb-qtabs" role="tablist">
              <button role="tab" class="rb-tab" [class.on]="tab() === 'results'" [attr.aria-selected]="tab() === 'results'" (click)="tab.set('results')">Results@if (run()) { <span class="cnt">{{ run()!.rows.length }}</span> }</button>
              <button role="tab" class="rb-tab" [class.on]="tab() === 'settings'" [attr.aria-selected]="tab() === 'settings'" (click)="tab.set('settings')">Settings@if (errs()) { <span class="cnt bad">{{ errs() }}</span> }</button>
            </div>
            <span class="rb-qtools">
              @if (s.dirty(d)) { <span class="rb-tag run rb-dirty">Unsaved changes</span> }
              <span class="rb-split">
                <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="doRun()"><mat-icon>play_arrow</mat-icon>Run</button>
                <button class="fx-btn fx-btn-primary fx-btn-sm rb-split-arrow" (click)="pop.set({ kind: 'run', el: $any($event.currentTarget) })" aria-label="Run options" aria-haspopup="menu"><mat-icon>expand_more</mat-icon></button>
              </span>
              <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="save()" [disabled]="d.kind === 'rep' && (!own() || !s.dirty(d))" [matTooltip]="d.kind === 'tpl' ? 'Save to your reports' : own() ? '' : 'Only your own reports can be saved. Use Save as.'"><mat-icon>save</mat-icon>Save</button>
              <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="openSaveAs()"><mat-icon>add</mat-icon>Save as</button>
              <button class="fx-icon-btn" (click)="pop.set({ kind: 'more', el: $any($event.currentTarget) })" aria-label="More actions" aria-haspopup="menu"><mat-icon>more_horiz</mat-icon></button>
            </span>
          </div>
        </div>

        @if (tab() === 'settings') {
          <div class="rb-sbody">
            <div class="rb-sbar">
              @if (d.kind === 'tpl') {
                <div class="rb-sbg"><mat-icon>dashboard_customize</mat-icon><b>Template</b>
                  <select class="rb-sel rb-tsel" [ngModel]="d.tid" (ngModelChange)="switchTemplate($event)" aria-label="Template">
                    @for (g of topics(); track g.name) { <optgroup [label]="g.name">@for (x of g.items; track x.id) { <option [value]="x.id">{{ x.title }}</option> }</optgroup> }
                  </select>
                </div>
              }
              <div class="rb-sbg"><mat-icon>event</mat-icon><b>Period</b>
                <rb-period [value]="d.period" (changed)="setPeriod($event)" />
                @if (periodErr(d.period)) { <span class="rb-ferr inline">{{ periodErr(d.period) }}</span> }
                @else if (rangeKind()) { <span class="muted tiny">{{ rangeKind() === 'roll' ? 'includes today' : 'to date' }}</span> }
              </div>
              <div class="rb-sbg"><mat-icon>account_tree</mat-icon><b>Group by</b>
                <select class="rb-sel rb-gs" [ngModel]="d.groups[0] || ''" (ngModelChange)="setGroup(0, $event)" aria-label="Group by">
                  <option value="">No grouping</option>@for (c of groupable; track c.id) { <option [value]="c.id">{{ c.label }}</option> }
                </select>
                @if (d.groups[0]) {
                  <span class="muted tiny">then</span>
                  <select class="rb-sel rb-gs" [ngModel]="d.groups[1] || ''" (ngModelChange)="setGroup(1, $event)" aria-label="Then group by">
                    <option value="">Nothing more</option>@for (c of groupable; track c.id) { @if (c.id !== d.groups[0]) { <option [value]="c.id">{{ c.label }}</option> } }
                  </select>
                }
                @if (groupsChanged()) { <button class="fx-link tiny" (click)="d.groups = t.groups.slice(0, 2); s.bump()">Reset</button> }
              </div>
            </div>
            <div class="rb-scols">
              <div class="rb-scol-left">
              <aside class="rb-spanel rb-filters">
                <div class="rb-sph"><mat-icon>filter_alt</mat-icon><b>Filters</b><span class="muted tiny">optional</span></div>
                @for (c of d.clauses; track c.id) {
                  @let err = c.touched ? clauseErr(c) : '';
                  <div class="rb-fitem" [class.bad]="err">
                    <div class="rb-fih"><b>{{ label(c.field) }}</b>
                      <button class="fx-icon-btn sm" (click)="removeClause(c)" [attr.aria-label]="'Remove ' + label(c.field) + ' filter'"><mat-icon>close</mat-icon></button></div>
                    @if (amount(c.field)) {
                      <div class="rb-prow">
                        <input class="rb-inp rb-nin" [(ngModel)]="c.from" (ngModelChange)="c.touched = true; s.bump()" inputmode="decimal" placeholder="from" aria-label="From" />
                        <span class="muted tiny">to</span>
                        <input class="rb-inp rb-nin" [(ngModel)]="c.to" (ngModelChange)="c.touched = true; s.bump()" inputmode="decimal" placeholder="to" aria-label="To" />
                        @if (money(c.field)) { <span class="muted tiny">KD</span> }
                      </div>
                    } @else {
                      <div class="rb-chips">
                        @for (v of c.vals; track v) { <span class="rb-chip">{{ v }}<button (click)="removeVal(c, v)" [attr.aria-label]="'Remove ' + v"><mat-icon>close</mat-icon></button></span> }
                        <button class="rb-chip add" (click)="openVals(c, $any($event.currentTarget))"><mat-icon>add</mat-icon>{{ c.vals.length ? 'Add' : 'Pick values' }}</button>
                      </div>
                      <label class="fx-check inline tiny rb-fexcl"><input type="checkbox" [(ngModel)]="c.exclude" (ngModelChange)="s.bump()" />Everything except these</label>
                    }
                    @if (err) { <div class="rb-ferr">{{ err }}</div> }
                  </div>
                } @empty { <p class="muted tiny">No filters. Every {{ s.noun(t).replace(/s$/, '') }} in the period is included.</p> }
                <button class="fx-btn fx-btn-secondary fx-btn-sm rb-addf" (click)="pop.set({ kind: 'add', el: $any($event.currentTarget) })"><mat-icon>add</mat-icon>Add filter</button>
                @if (d.clauses.length > 1) { <p class="muted tiny">Several values in one filter means any of them. Different filters must all match.</p> }
                @if (t.scope.length) { <div class="rb-lockline"><mat-icon>lock</mat-icon>Always limited to {{ s.scopeText(t) }}, set by IT</div> }
              </aside>
              <section class="rb-spanel rb-colpanel">
                <div class="rb-sph"><mat-icon>view_column</mat-icon><b>Columns and sort</b><span class="muted tiny">{{ visibleCols().length }} of {{ t.cols.length }} shown</span></div>
                @for (id of t.cols; track id) {
                  @let lr = locked(id);
                  <label class="rb-ccol" [class.lk]="lr" [matTooltip]="lr"><input type="checkbox" [checked]="!d.hidden.includes(id)" [disabled]="!!lr" (change)="toggleCol(id)" /><span>{{ label(id) }}</span>
                    @if (lr) { <mat-icon class="rb-lockic" [attr.aria-label]="lr">lock</mat-icon> }</label>
                }
                <p class="muted tiny">Columns come from the report. You can hide them, not add new ones.</p>
                <div class="rb-sortbox">
                  @for (i of [0, 1, 2]; track i) {
                    @if (i === 0 || d.sorts[i - 1]) {
                      <label class="rb-flab">{{ sortLabels[i] }}
                        <span class="rb-prow">
                          <select class="rb-sel grow" [ngModel]="d.sorts[i]?.col || ''" (ngModelChange)="setSort(i, $event)" [attr.aria-label]="sortLabels[i]">
                            <option value="">{{ i ? 'None' : 'Report order' }}</option>@for (c of visibleCols(); track c) { <option [value]="c">{{ label(c) }}</option> }
                          </select>
                          @if (d.sorts[i]) {
                            <select class="rb-sel rb-dir" [(ngModel)]="d.sorts[i].dir" (ngModelChange)="s.bump()" aria-label="Direction"><option value="asc">Ascending</option><option value="desc">Descending</option></select>
                          }
                        </span>
                      </label>
                    }
                  }
                </div>
              </section>
              </div>
              <div class="rb-scol-main">
                <div class="rb-sentence"><mat-icon>visibility</mat-icon><span>{{ sentence() }}</span></div>
                <section class="rb-spanel">
                  <div class="rb-sph"><mat-icon>preview</mat-icon><b>Preview</b><span class="muted tiny">first 10 lines with these settings, before grouping and totals</span>
                    <button class="fx-btn fx-btn-primary fx-btn-sm rb-sph-r" (click)="doRun()"><mat-icon>play_arrow</mat-icon>Run report</button></div>
                  @if (periodErr(d.period)) { <div class="rb-pvempty"><mat-icon>event_busy</mat-icon>Choose a valid period to see a preview.</div> }
                  @else if (!preview().length) { <div class="rb-pvempty"><mat-icon>search_off</mat-icon>No lines match this period@if (d.clauses.length) { and these filters}.</div> }
                  @else {
                    <div class="rb-pvwrap"><table class="rb-pvt"><thead><tr>@for (c of visibleCols(); track c) { <th [class.n]="num(c)">{{ label(c) }}</th> }</tr></thead>
                      <tbody>@for (r of preview(); track r._i) { <tr>@for (c of visibleCols(); track c) { <td [class.n]="num(c)">{{ txt(c, r[c]) }}</td> }</tr> }</tbody></table></div>
                  }
                </section>
              </div>
            </div>
          </div>
        } @else {
          @if (job(); as j) {
            @if (secs() < 5) { <div class="rb-empty"><span class="rb-spin" aria-hidden="true"></span><b>Running</b>{{ secs() }} s</div> }
            @else {
              <div class="rb-empty narrow"><mat-icon class="big">schedule</mat-icon><b>This is taking longer than usual</b>It keeps running in the background, even if you open another report. You'll get a notification when it's ready.
                <div class="rb-btnrow center"><button class="fx-btn fx-btn-secondary" (click)="tab.set('settings')">Back to settings</button><button class="fx-btn fx-btn-secondary" (click)="s.cancel(d); tab.set('settings')">Cancel</button></div>
                <div class="muted tiny">Running for {{ secs() }} s</div></div>
            }
          } @else if (run(); as lr) {
            <div class="rb-rmeta">
              <div><b>{{ lr.rows.length.toLocaleString() }} {{ s.noun(t) }}</b> <span class="muted">&nbsp;· {{ lr.sentence }}</span></div>
              <div class="muted tiny">Run {{ hm(lr.at) }}, {{ lr.ms.toFixed(1) }} s. Valid until {{ hm(lr.until) }}.</div>
            </div>
            @if (changed()) {
              <div class="fx-outdated rb-res-stale"><mat-icon>warning</mat-icon><span>The settings have changed since this run. These results are from {{ hm(lr.at) }}.</span>
                <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="doRun()"><mat-icon>play_arrow</mat-icon>Run again</button></div>
            }
            <div class="rb-vbar">
              @if (t.summaries.length) {
                <span class="fx-seg sm" role="tablist">
                  <button role="tab" [class.on]="!stab()" (click)="setStab(0)">Lines</button>
                  @for (x of t.summaries; track x.id; let i = $index) { <button role="tab" [class.on]="stab() === i + 1" (click)="setStab(i + 1)">{{ x.name }}</button> }
                </span>
              }
              <label class="fx-search rb-find"><mat-icon>search</mat-icon><input [ngModel]="find()" (ngModelChange)="find.set($event); page.set(0)" placeholder="Find in results" aria-label="Find in results" /></label>
              @if (lr.R.groups.length && lr.R.show.detail && !stab()) {
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="toggleAll()"><mat-icon>{{ collapsed().length ? 'unfold_more' : 'unfold_less' }}</mat-icon>{{ collapsed().length ? 'Expand all' : 'Collapse all' }}</button>
              }
              <span class="rb-vbar-r"><button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="pop.set({ kind: 'export', el: $any($event.currentTarget) })" aria-haspopup="menu"><mat-icon>download</mat-icon>Export<mat-icon>expand_more</mat-icon></button></span>
            </div>
            @if (selectable() && sel().size) {
              <div class="rb-selbar"><b>{{ sel().size }} selected</b><span class="muted tiny">{{ selInv() }} {{ selInv() === 1 ? 'invoice' : 'invoices' }}</span>
                @for (a of actions(); track a.id) { <button class="fx-btn fx-btn-secondary fx-btn-sm" [disabled]="a.single && selInv() !== 1" [matTooltip]="a.single && selInv() !== 1 ? 'Select lines from one invoice' : ''" (click)="s.toast(a.label + ': ' + sel().size + ' selected'); sel.set(newSet())">{{ a.label }}</button> }
                <button class="fx-link tiny" (click)="sel.set(newSet())">Clear</button></div>
            }
            @if (!stab() && lr.R.display.mode !== 'table') { <rb-chart [model]="chart()" /> }
            <rb-table [model]="table()" [spec]="spec()" [total]="rows().length" [sort]="sort() ? [sort()!] : spec().sorts" [pins]="stab() ? [] : t.pins"
                      [find]="find()" [selected]="selectable() ? sel() : null" (toggle)="toggleGroup($event)" (page)="page.set(page() + $event)"
                      (rowClick)="toggleSel($event)" (drill)="drill($event)" (headerMenu)="pop.set({ kind: 'header', el: $event.el, col: $event.id })" />
          } @else {
            <div class="rb-empty"><mat-icon class="big">play_circle</mat-icon><b>No results yet</b>Check the settings, then click Run.
              <div class="rb-btnrow center"><button class="fx-btn fx-btn-primary" (click)="doRun()"><mat-icon>play_arrow</mat-icon>Run</button></div></div>
          }
        }
      </section>
    </div>


    @if (pop(); as p) {
      <rb-pop [anchor]="p.el" (closed)="closePop()">
        @switch (p.kind) {
          @case ('run') {
            <div class="rb-mlab">Tell me when it's ready</div>
            @for (o of notifyOpts; track o[0]) {
              <label class="rb-vrow"><input type="radio" name="nt" [checked]="notify() === o[0]" (change)="notify.set(o[0])" />{{ o[1] }}</label>
            }
          }
          @case ('more') {
            <button class="rb-mi" (click)="pop.set(null); schedule()"><mat-icon>event_repeat</mat-icon>Schedule…</button>
            <button class="rb-mi" [disabled]="!own()" (click)="pop.set(null); sharing.set(mineRep())"><mat-icon>ios_share</mat-icon>Share…@if (!own()) { <span class="r">Save it first</span> }</button>
            <button class="rb-mi" (click)="pop.set(null); s.toast(run() ? 'Link to the result sent' : 'Run the report first', '', !run())"><mat-icon>mail_outline</mat-icon>Email the results link</button>
            <button class="rb-mi" (click)="pop.set(null); s.toast(run() ? 'Sent to printer' : 'Run the report first', '', !run())"><mat-icon>print</mat-icon>Print</button>
          }
          @case ('add') {
            <div class="rb-mlab">Filter by</div>
            @for (c of filterable(); track c.id) {
              <button class="rb-mi" [disabled]="used(c.id)" (click)="addClause(c.id)">{{ c.label }}@if (used(c.id)) { <span class="r">already added</span> }</button>
            }
          }
          @case ('vals') {
            @let c = p.clause!;
            <div class="rb-mlab">{{ label(c.field) }}</div>
            <label class="fx-search rb-popsearch"><mat-icon>search</mat-icon><input [ngModel]="vq()" (ngModelChange)="vq.set($event)" placeholder="Type to search" aria-label="Search values" /></label>
            <div class="rb-vlist">
              @for (v of valueList(c.field); track v[0]) {
                <button class="rb-mi" [class.on]="picked().has(v[0])" (click)="toggleVal(v[0])"><span class="rb-cbx" [class.on]="picked().has(v[0])">@if (picked().has(v[0])) { <mat-icon>check</mat-icon> }</span>{{ v[0] }}<span class="r">{{ v[1] }} lines</span></button>
              } @empty { <div class="rb-mlab">No match</div> }
            </div>
            <div class="rb-msep"></div>
            <button class="rb-mi" (click)="doneVals(c)"><b>Done</b><span class="r">{{ picked().size }} chosen</span></button>
          }
          @case ('export') {
            <div class="rb-mlab">Download the full result</div>
            @for (f of ['Excel', 'PDF', 'CSV']; track f) { <button class="rb-mi" (click)="pop.set(null); s.toast('Downloaded ' + d.name + '.' + ext[f])">{{ f }}</button> }
          }
          @case ('header') {
            <div class="rb-mlab">Sort the results. Nothing runs again</div>
            <button class="rb-mi" (click)="sort.set({ col: p.col!, dir: 'asc' }); pop.set(null)"><mat-icon>arrow_upward</mat-icon>Smallest or A first</button>
            <button class="rb-mi" (click)="sort.set({ col: p.col!, dir: 'desc' }); pop.set(null)"><mat-icon>arrow_downward</mat-icon>Largest or Z first</button>
            @if (sort()) { <button class="rb-mi" (click)="sort.set(null); pop.set(null)"><mat-icon>close</mat-icon>Back to the report's order</button> }
          }
        }
      </rb-pop>
    }

    @if (saveAsOpen()) {
      <rb-dialog title="Save as my version" (closed)="saveAsOpen.set(false)">
        <p class="muted tiny">Keeps the period, filters, grouping, columns and sort. Relative periods stay relative. Only you see it unless you share it.</p>
        <input class="rb-inp full tall" [(ngModel)]="saveName" aria-label="Name" />
        @if (saveErr()) { <div class="rb-ferr">{{ saveErr() }}</div> }
        <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="saveAsOpen.set(false)">Cancel</button><button class="fx-btn fx-btn-primary" (click)="saveAs()">Save</button></ng-container>
      </rb-dialog>
    }
    @if (scheduling(); as r) { <rb-schedule [report]="r" (closed)="scheduling.set(null)" /> }
    @if (sharing(); as r) { <rb-share [report]="r" (closed)="sharing.set(null)" /> }`,
})
export class RbDoc {
  hm = hm; periodErr = periodErr; clauseErr = clauseErr;
  groupable = groupable();
  sortLabels = ['Sort by', 'Then by', 'And finally'];
  notifyOpts: [Notify, string][] = [['none', 'Only on this screen'], ['app', 'In-app notification'], ['email', 'In-app and email link']];
  ext: Record<string, string> = { Excel: 'xlsx', PDF: 'pdf', CSV: 'csv' };

  key = signal('');
  tab = signal<'results' | 'settings'>('settings');
  pop = signal<Pop>(null);
  notify = signal<Notify>('none');
  vq = signal(''); picked = signal(new Set<string>());
  stab = signal(0); find = signal(''); page = signal(0);
  collapsed = signal<string[]>([]);
  sel = signal(new Set<number>());
  sort = signal<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  saveAsOpen = signal(false); saveName = ''; saveErr = signal('');
  scheduling = signal<MyReport | null>(null);
  sharing = signal<MyReport | null>(null);

  constructor(public s: RbStore, private router: Router, route: ActivatedRoute) {
    route.paramMap.subscribe((p) => {
      const kind = p.get('kind') as 'tpl' | 'rep', id = p.get('id')!;
      const d = s.doc(kind, id); this.key.set(s.keyOf(d));
      this.tab.set(s.runs[this.key()] || s.jobs[this.key()] ? 'results' : 'settings');
      this.stab.set(0); this.find.set(''); this.page.set(0); this.sel.set(new Set()); this.sort.set(null); this.resetCollapse();
    });
    route.queryParamMap.subscribe((q) => {
      if (q.get('tab') === 'results') this.tab.set('results');
      if (q.get('run')) setTimeout(() => { this.doRun(); this.router.navigate([], { queryParams: {}, replaceUrl: true }); });
    });
  }

  doc = computed<DocState>(() => { this.s.rev(); const [k, id] = this.key().split(':'); return this.s.doc(k as 'tpl' | 'rep', id); });
  tpl = computed<Template>(() => this.s.tpl(this.doc().tid));
  own = computed(() => { const d = this.doc(); return d.kind === 'rep' && d.owner === 'me'; });
  mineRep = computed(() => { this.s.rev(); const d = this.doc(); return d.kind === 'rep' ? this.s.rep(d.id) || null : null; });
  errs = computed(() => { this.s.rev(); return this.s.errors(this.doc()); });
  run = computed<Run | undefined>(() => { this.s.rev(); return this.s.runs[this.key()]; });
  job = computed(() => { this.s.rev(); return this.s.jobs[this.key()]; });
  secs = () => Math.round((Date.now() - (this.job()?.t0 || 0)) / 1000);
  changed = computed(() => { this.s.rev(); const r = this.run(); return !!r && JSON.stringify(this.snapNow()) !== JSON.stringify(JSON.parse(r.snap)); });
  private snapNow() { const d = this.doc(); return JSON.parse(JSON.stringify({ period: d.period, clauses: d.clauses.map((c) => ({ field: c.field, vals: c.vals, exclude: c.exclude, from: c.from, to: c.to })), hidden: d.hidden, sorts: d.sorts, groups: d.groups })); }
  rangeKind = computed(() => { this.s.rev(); return resolveRange(this.doc().period)?.kind || ''; });
  groupsChanged = computed(() => { this.s.rev(); return JSON.stringify(this.doc().groups) !== JSON.stringify(this.tpl().groups.slice(0, 2)); });
  sentence = computed(() => { this.s.rev(); return docSentence(this.tpl(), this.doc(), this.s.noun(this.tpl())); });
  visibleCols = computed(() => { this.s.rev(); return this.tpl().cols.filter((c) => !this.doc().hidden.includes(c)); });
  preview = computed(() => { this.s.rev(); const d = this.doc(); return periodErr(d.period) ? [] : rowsForDoc(this.tpl(), { ...d, groups: [] }).slice(0, 10); });
  sortText = computed(() => this.doc().sorts.map((x) => this.label(x.col) + (x.dir === 'desc' ? ' (largest first)' : '')).join(', then '));
  filterable = computed(() => CAT.filter((c) => c.id !== this.s.ds(this.tpl()).periodCol && !c.restricted && c.type !== 'date'));
  actions = computed(() => this.s.ds(this.tpl()).actions);

  /** The lines layout, or one of IT's summary tabs computed from the same rows. */
  spec = computed<Spec>(() => {
    const r = this.run()!; const st = this.stab(); if (!st) return r.R;
    const x = this.tpl().summaries[st - 1];
    return { ...r.R, groups: x.groups, sums: x.sums, show: { detail: false, sub: true, grand: true }, cols: [...x.groups, ...Object.keys(x.sums)], display: { ...r.R.display, mode: 'table' }, drill: [], rules: [], start: 'expanded' };
  });
  rows = computed<Row[]>(() => {
    const r = this.run(); if (!r) return []; const so = this.sort();
    return so ? [...r.rows].sort((a, b) => cmp(a[so.col], b[so.col]) * (so.dir === 'asc' ? 1 : -1)) : r.rows;
  });
  table = computed(() => buildTable(this.spec(), this.rows(), { collapsed: new Set(this.stab() ? [] : this.collapsed()), page: this.page(), find: this.find(), only: false, pins: this.stab() ? [] : this.tpl().pins }));
  chart = computed(() => chartModel(this.spec(), this.rows()));
  selectable = computed(() => { const r = this.run(); return !!r && !this.stab() && !(r.R.groups.length && !r.R.show.detail); });
  selInv = computed(() => new Set(this.run()?.rows.filter((x) => this.sel().has(x._i)).map((x) => x['inv'])).size);

  label(id: string) { return colOf(id, this.tpl().calcs).label; }
  num(id: string) { return isNum(colOf(id, this.tpl().calcs)); }
  amount(f: string) { return isAmount(f); }
  money(f: string) { return colOf(f).type === 'money'; }
  txt(id: string, v: any) { return fval(colOf(id, this.tpl().calcs), v, null, this.tpl().fmt); }
  locked(id: string) { return lockedColD(this.tpl(), this.doc(), id); }
  used(id: string) { return this.doc().clauses.some((c) => c.field === id); }
  valueList(f: string) { const q = this.vq().toLowerCase(); return distinct(f).filter(([v]) => !q || String(v).toLowerCase().includes(q)); }
  newSet() { return new Set<number>(); }

  back() { this.router.navigate([this.s.home()]); }
  closePop() { this.pop.set(null); }
  setPeriod(p: Period) { this.doc().period = p; this.s.bump(); }
  setGroup(i: number, v: string) {
    const d = this.doc();
    d.groups = i === 0 ? (v ? [v, ...(d.groups[1] && d.groups[1] !== v ? [d.groups[1]] : [])] : []) : v ? [d.groups[0], v] : [d.groups[0]];
    this.s.bump();
  }
  addClause(field: string) {
    const c = newClause(field); this.doc().clauses.push(c); const anchor = this.pop()!.el; this.pop.set(null); this.s.bump();
    if (!isAmount(field)) setTimeout(() => { const el = document.querySelector<HTMLElement>('.rb-fitem:last-of-type .rb-chip.add') || anchor; this.openVals(c, el); });
  }
  removeClause(c: Clause) { const d = this.doc(); d.clauses = d.clauses.filter((x) => x !== c); this.s.bump(); }
  removeVal(c: Clause, v: string) { c.vals = c.vals.filter((x) => x !== v); c.touched = true; this.s.bump(); }
  openVals(c: Clause, el: HTMLElement) { this.vq.set(''); this.picked.set(new Set(c.vals)); this.pop.set({ kind: 'vals', el, clause: c }); }
  toggleVal(v: string) { const s = new Set(this.picked()); s.has(v) ? s.delete(v) : s.add(v); this.picked.set(s); }
  doneVals(c: Clause) { c.vals = [...this.picked()]; c.touched = true; this.pop.set(null); this.s.bump(); }
  toggleCol(id: string) {
    const d = this.doc(); d.hidden = d.hidden.includes(id) ? d.hidden.filter((x) => x !== id) : [...d.hidden, id];
    d.sorts = d.sorts.filter((x) => !d.hidden.includes(x.col)); this.s.bump();
  }
  setSort(i: number, col: string) {
    const d = this.doc(); if (!col) d.sorts = d.sorts.slice(0, i); else d.sorts[i] = { col, dir: d.sorts[i]?.dir || 'asc' }; this.s.bump();
  }

  doRun() {
    const res = this.s.run(this.doc(), this.notify());
    if (res === 'invalid') { this.tab.set('settings'); const n = this.errs(); this.s.toast(`Fix ${n} ${n === 1 ? 'item' : 'items'} in Settings first`, '', true); return; }
    this.tab.set('results'); this.sel.set(new Set()); this.page.set(0); this.sort.set(null);
    if (res === 'started') { this.collapsed.set([]); setTimeout(() => this.resetCollapse(), 700); }
  }
  private resetCollapse() { const r = this.s.runs[this.key()]; this.collapsed.set(r && r.R.start === 'collapsed' ? allKeys(r.R, r.rows) : []); }
  setStab(i: number) { this.stab.set(i); this.page.set(0); }
  toggleGroup(k: string) { this.collapsed.update((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k])); }
  toggleAll() { const r = this.run()!; this.collapsed.set(this.collapsed().length ? [] : allKeys(r.R, r.rows)); }
  toggleSel(i: number) { const s = new Set(this.sel()); s.has(i) ? s.delete(i) : s.add(i); this.sel.set(s); }
  drill(e: { col: string; value: string }) {
    const target = this.tpl().drill.find((x) => x.col === e.col)?.target; if (!target) return;
    const d = this.s.doc('tpl', target);
    d.period = this.s.clone(this.doc().period); d.clauses = [newClause(e.col, { vals: [e.value] })];
    this.router.navigate(['/report', 'tpl', target], { queryParams: { run: 1 } });
  }

  /** An unsaved report saves straight away under its template's name; rename it later from the reports list. */
  save() {
    const d = this.doc();
    if (d.kind === 'rep') { this.s.save(d); this.s.toast('Saved'); return; }
    const base = d.name; let n = base, i = 2;
    while (this.s.reps.some((r) => r.owner === 'me' && r.name.toLowerCase() === n.toLowerCase())) n = base + ' (' + i++ + ')';
    const r = this.s.saveAs(d, n); this.s.lastTemplate = d.tid;
    this.s.toast('Saved to your reports as ' + n + '. Rename it from the ⋯ menu in Reports');
    this.router.navigate(['/report', 'rep', r.id], { replaceUrl: true });
  }
  /** Picking another template keeps the period and filters (all templates share the same columns). */
  switchTemplate(tid: string) {
    const from = this.doc(); const to = this.s.doc('tpl', tid);
    to.period = this.s.clone(from.period); to.clauses = this.s.clone(from.clauses); this.s.lastTemplate = tid;
    this.router.navigate(['/report', 'tpl', tid], { replaceUrl: true });
  }
  topics = computed(() => { this.s.rev(); const lib = this.s.library(); const names = [...new Set(lib.map((t) => TOPICS[t.id] || 'Other'))];
    return names.map((name) => ({ name, items: lib.filter((t) => (TOPICS[t.id] || 'Other') === name) })); });
  openSaveAs() { const d = this.doc(); this.saveName = this.own() ? d.name + ' (copy)' : d.name; this.saveErr.set(''); this.saveAsOpen.set(true); }
  saveAs() {
    const n = this.saveName.trim();
    if (n.length < 3) { this.saveErr.set('Enter a name of at least 3 characters.'); return; }
    if (this.s.reps.some((r) => r.owner === 'me' && r.name.toLowerCase() === n.toLowerCase())) { this.saveErr.set('You already have a report with this name.'); return; }
    const r = this.s.saveAs(this.doc(), n); this.saveAsOpen.set(false); this.s.toast('Saved to your reports');
    this.router.navigate(['/report', 'rep', r.id], { replaceUrl: true });
  }
  schedule() {
    if (!this.own()) { this.s.toast('Save your own version first, then schedule it', '', true); return; }
    if (this.s.dirty(this.doc())) { this.s.toast('Save your changes first. A schedule runs the saved settings', '', true); return; }
    this.scheduling.set(this.mineRep());
  }
}
