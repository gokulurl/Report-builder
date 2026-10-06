import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LiveView, NamedView, RbStore, Result, nextFilterId } from './store';
import { CAT, COLLEAGUES, Row, Spec, TODAY, allKeys, buildTable, chartModel, cmp, colOf, distinct, fSummary, fdate, hm, isNum, matchRow, rangeText } from './engine';
import { RbChart, RbDialog, RbPop, RbTable } from './ui';

type Pop = { kind: 'views' | 'export' | 'rowfcol' | 'rowfval' | 'header'; el: HTMLElement; col?: string } | null;
type Dlg = 'keep' | 'print' | 'email' | 'reason' | 'saveview' | 'remind' | 'assign' | null;

/** A run's result. Everything here changes how it looks; nothing queries again. */
@Component({
  selector: 'rb-result',
  imports: [FormsModule, MatIconModule, MatTooltipModule, RbTable, RbChart, RbDialog, RbPop],
  template: `
    <span hidden [attr.data-rev]="s.rev()"></span>
    @if (r(); as r) {
      @let t = s.tpl(r.tid);
      <div class="rb-page rb-respage">
        <div class="rb-crumb">
          <button class="fx-link" (click)="router.navigate([s.home()])"><mat-icon>chevron_left</mat-icon>{{ s.role() === 'admin' ? 'Templates' : 'Billing reports' }}</button>
          <span class="muted">/</span><span>{{ r.name }}</span>
          @if (backTo(); as b) { <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="drillBack()"><mat-icon>arrow_back</mat-icon>Back to {{ b.name }}</button> }
        </div>
        <section class="fx-card rb-res">
          <div class="rb-rhead">
            <div class="rb-rhead-main">
              <h1 class="rb-ctitle">{{ r.savedName || r.name }}</h1>
              <div class="rb-pline">
                <span><b>{{ s.periodLabel(t) }}</b> {{ rangeText(r.crit.period) }}</span>
                @for (f of r.crit.conds; track f.id) { <span><b>{{ label(f.col) }}</b> {{ fsum(f) }}</span> }
                @for (f of t.scope; track f.id) { <span class="rb-locked"><mat-icon class="xs">lock</mat-icon><b>{{ label(f.col) }}</b> {{ (f.vals || []).join(', ') }}</span> }
              </div>
              @if (r.status === 'ready') {
                <div class="muted tiny rb-meta">{{ r.rows.length.toLocaleString() }} lines@if (groupCount()) { in {{ groupCount() }} {{ groupCount() === 1 ? 'group' : 'groups' }}}. Run {{ fdate(r.ranAt) }} {{ hm(r.ranAt) }}@if (r.ms) {, {{ r.ms.toFixed(1) }} s}.
                  @if (r.savedName) { Saved result, kept until {{ fdate(r.keepUntil!) }}. }
                  @else if (expired()) { <b class="warnt">These results have expired. Run again for current data.</b> }
                  @else { Valid until {{ hm(r.validUntil) }}. }
                </div>
                @if (r.reused && !expired() && !r.savedName) {
                  <div class="rb-reuse"><mat-icon>schedule</mat-icon>You ran this report with the same values at {{ hm(r.ranAt) }}. Showing that result. Fresh results are available after {{ hm(r.validUntil) }}.</div>
                }
              }
            </div>
            @if (r.status === 'ready') {
              <div class="rb-vtools">
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="changeValues()"><mat-icon>edit</mat-icon>Change values</button>
                @if (expired()) { <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="rerun()"><mat-icon>play_arrow</mat-icon>Run again</button> }
              </div>
            }
          </div>

          @if (r.status === 'running') {
            @if (secs() < 5) {
              <div class="rb-empty"><span class="rb-spin" aria-hidden="true"></span><b>Running report</b>{{ secs() }} s</div>
            } @else {
              <div class="rb-empty narrow">
                <mat-icon class="big">schedule</mat-icon>
                <b>This report is taking longer than usual</b>
                It keeps running in the background, even if you leave this page. You'll find it in Results and get a notification when it's ready.
                <div class="rb-btnrow center">
                  <button class="fx-btn fx-btn-primary" (click)="router.navigate([s.home()], { queryParams: { tab: 'results' } })">Go to Results</button>
                  <button class="fx-btn fx-btn-secondary" (click)="router.navigate([s.home()])">Run something else</button>
                  <button class="fx-btn fx-btn-secondary" (click)="s.cancelRun(r.id); router.navigate([s.home()])">Cancel</button>
                </div>
                <div class="muted tiny">Running for {{ secs() }} s. Large results arrive as a file, up to 500,000 rows.</div>
              </div>
            }
          } @else {
            @let v = view();
            <div class="rb-vbar">
              <span class="muted tiny">View</span>
              <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="pop.set({ kind: 'rowfcol', el: $any($event.currentTarget) })"><mat-icon>filter_alt</mat-icon>Filter rows@if (v.rowf.length) { ({{ v.rowf.length }})}</button>
              @if (spec().groups.length && spec().show.detail) {
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="toggleAll()"><mat-icon>{{ v.collapsed!.length ? 'unfold_more' : 'unfold_less' }}</mat-icon>{{ v.collapsed!.length ? 'Expand all' : 'Collapse all' }}</button>
              }
              <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="v.density = v.density ? '' : 'compact'; s.bump()"><mat-icon>density_medium</mat-icon>{{ v.density ? 'Comfortable' : 'Compact' }}</button>
              <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="pop.set({ kind: 'views', el: $any($event.currentTarget) })" aria-haspopup="menu">
                <mat-icon>bookmark_border</mat-icon>View: {{ activeView()?.name || 'Standard' }}@if (activeView()?.def) { (default)}<mat-icon>expand_more</mat-icon></button>
              <span class="rb-vbar-r">
                @if (!r.savedName) { <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="openKeep()"><mat-icon>bookmark_add</mat-icon>Keep result</button> }
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="dlg.set('print')"><mat-icon>print</mat-icon>Print</button>
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="emailTo = ''; dlg.set('email')"><mat-icon>mail_outline</mat-icon>Email</button>
                <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="pop.set({ kind: 'export', el: $any($event.currentTarget) })" aria-haspopup="menu"><mat-icon>download</mat-icon>Export<mat-icon>expand_more</mat-icon></button>
              </span>
            </div>

            @if (v.rowf.length) {
              <div class="rb-chips">
                @for (f of v.rowf; track $index; let i = $index) {
                  <span class="rb-chip mine">Showing {{ label(f.col) }}: {{ f.vals.join(', ') }}<button (click)="v.rowf.splice(i, 1); s.bump()" aria-label="Remove row filter"><mat-icon>close</mat-icon></button></span>
                }
                <span class="tiny rb-note">Totals reflect the rows shown</span>
              </div>
            }
            @if (t.summaries.length) {
              <div class="rb-stabs" role="tablist">
                <button class="rb-stab" role="tab" [class.on]="!stab()" (click)="setStab(0)"><mat-icon>table_rows</mat-icon>Lines</button>
                @for (x of t.summaries; track x.id; let i = $index) {
                  <button class="rb-stab" role="tab" [class.on]="stab() === i + 1" (click)="setStab(i + 1)"><mat-icon>account_tree</mat-icon>{{ x.name }}</button>
                }
                <span class="muted tiny">Summaries use the same result. Nothing runs again.</span>
              </div>
            }
            @if (!stab() && actions().length) {
              @if (sel().size) {
                <div class="rb-selbar">
                  <b>{{ sel().size }} {{ sel().size === 1 ? 'line' : 'lines' }} selected</b><span class="muted tiny">{{ selInv().length }} {{ selInv().length === 1 ? 'invoice' : 'invoices' }}</span>
                  @for (a of actions(); track a.id) {
                    <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="rowAction(a.id)" [disabled]="a.single && selInv().length !== 1" [matTooltip]="a.single && selInv().length !== 1 ? 'Select lines from one invoice' : ''">{{ a.label }}</button>
                  }
                  <button class="fx-link tiny" (click)="clearSel()">Clear selection</button>
                </div>
              } @else {
                <div class="rb-selhint muted tiny"><mat-icon>check</mat-icon>Click lines to select them, then act on them: open an invoice, add to your follow-up list, send reminders.
                  <button class="fx-link tiny" (click)="selectPage()">Select all on this page</button></div>
              }
            }
            <div class="rb-findbar">
              <label class="fx-search rb-find"><mat-icon>search</mat-icon><input [ngModel]="v.find" (ngModelChange)="v.find = $event; v.page = 0; s.bump()" placeholder="Find in results" aria-label="Find in results" /></label>
              @if (v.find.trim()) {
                <span class="muted tiny">{{ matches() }} matching {{ matches() === 1 ? 'line' : 'lines' }}</span>
                <label class="fx-check inline tiny"><input type="checkbox" [checked]="v.only" (change)="v.only = !v.only; s.bump()" />Matching lines only</label>
              }
            </div>
            @if (!stab() && spec().display.mode !== 'table') { <rb-chart [model]="chart()" /> }
            @if (stab() || spec().display.mode !== 'chart') {
              <rb-table [model]="table()" [spec]="spec()" [total]="rows().length" [sort]="v.sort ? [v.sort] : spec().sorts"
                        [widths]="v.widths" [wrap]="v.wrap" [pins]="stab() ? [] : v.pins" [density]="v.density" [find]="v.find" [selected]="stab() ? null : sel()"
                        (toggle)="toggleGroup($event)" (page)="v.page = v.page + $event; s.bump()" (drill)="drill($event)"
                        (rowClick)="toggleSel($event)" (headerMenu)="pop.set({ kind: 'header', el: $event.el, col: $event.id })"
                        (resized)="v.widths[$event.id] = $event.w; s.bump()" />
            }
          }
        </section>
      </div>

      @if (pop(); as p) {
        <rb-pop [anchor]="p.el" (closed)="pop.set(null)">
          @switch (p.kind) {
            @case ('export') {
              <div class="rb-mlab">Download the full result</div>
              @for (f of exportFormats; track f[0]) { <button class="rb-mi" (click)="export(f[0])"><b>{{ f[0] }}</b><span class="r">{{ f[1] }}</span></button> }
            }
            @case ('views') {
              <div class="rb-mlab">Views change how the result looks. Nothing runs again</div>
              <button class="rb-mi" [class.on]="!view().active" (click)="standardView()"><mat-icon>table_rows</mat-icon>Standard</button>
              @for (x of namedViews(); track x.id) {
                <div class="rb-vrowm">
                  <button class="rb-mi" [class.on]="view().active === x.id" (click)="applyView(x)"><mat-icon>bookmark</mat-icon>{{ x.name }}@if (x.def) { <span class="r">Default</span> }</button>
                  <button class="fx-icon-btn sm" (click)="toggleDefault(x)" [matTooltip]="x.def ? 'Stop using as default' : 'Use every time I open this report'" [attr.aria-label]="x.def ? 'Stop using as default' : 'Make default'"><mat-icon>{{ x.def ? 'check' : 'push_pin' }}</mat-icon></button>
                  <button class="fx-icon-btn sm" (click)="deleteView(x)" aria-label="Delete view"><mat-icon>delete_outline</mat-icon></button>
                </div>
              }
              <div class="rb-msep"></div>
              <button class="rb-mi" (click)="viewName = ''; viewDef = false; viewErr.set(''); pop.set(null); dlg.set('saveview')"><mat-icon>add</mat-icon>Save current view as…</button>
              @if (activeView(); as av) { <button class="rb-mi" (click)="av.state = s.viewState(view()); pop.set(null); s.toast('View updated')"><mat-icon>save</mat-icon>Update "{{ av.name }}"</button> }
            }
            @case ('rowfcol') {
              <div class="rb-mlab">Show only rows where</div>
              @for (c of rowFilterCols(); track c) { <button class="rb-mi" (click)="pickVals(c, p.el)">{{ label(c) }}</button> }
            }
            @case ('rowfval') {
              <div class="rb-mlab">{{ label(p.col!) }}</div>
              @for (v of values(p.col!); track v[0]) {
                <button class="rb-mi" (click)="toggleRowVal(v[0])"><span class="rb-cbx" [class.on]="rowVals().includes(v[0])">@if (rowVals().includes(v[0])) { <mat-icon>check</mat-icon> }</span>{{ v[0] }}<span class="r">{{ v[1] }}</span></button>
              }
              <div class="rb-msep"></div><button class="rb-mi" (click)="addRowFilter(p.col!)"><b>Done</b></button>
            }
            @case ('header') {
              @let id = p.col!; @let v = view();
              <div class="rb-mlab">Changes the view only. Nothing runs again</div>
              <button class="rb-mi" (click)="v.sort = { col: id, dir: 'asc' }; pop.set(null); s.bump()"><mat-icon>arrow_upward</mat-icon>Sort {{ isNumCol(id) ? 'smallest' : 'A to Z' }} first</button>
              <button class="rb-mi" (click)="v.sort = { col: id, dir: 'desc' }; pop.set(null); s.bump()"><mat-icon>arrow_downward</mat-icon>Sort {{ isNumCol(id) ? 'largest' : 'Z to A' }} first</button>
              @if (v.sort) { <button class="rb-mi" (click)="v.sort = null; pop.set(null); s.bump()"><mat-icon>close</mat-icon>Back to the report's order</button> }
              <div class="rb-msep"></div>
              <button class="rb-mi" [disabled]="!v.pins.includes(id) && v.pins.length >= 2" (click)="togglePin(id)"><mat-icon>push_pin</mat-icon>{{ v.pins.includes(id) ? 'Unpin' : 'Anchor to the left' }}@if (!v.pins.includes(id) && v.pins.length >= 2) { <span class="r">2 already anchored</span> }</button>
              <button class="rb-mi" (click)="toggleWrap(id)"><mat-icon>wrap_text</mat-icon>{{ v.wrap.includes(id) ? 'Stop wrapping' : 'Wrap text' }}</button>
              @if (v.widths[id]) { <button class="rb-mi" (click)="resetWidth(id)"><mat-icon>width_normal</mat-icon>Reset width</button> }
            }
          }
        </rb-pop>
      }

      @switch (dlg()) {
        @case ('keep') {
          <rb-dialog title="Keep result" (closed)="dlg.set(null)">
            <p class="muted tiny">Keeps this result after it expires. Kept results also expire, so old figures are not mistaken for current ones.</p>
            <input class="rb-inp full tall" [(ngModel)]="keepName" aria-label="Name" />
            <div class="rb-frm"><label>Keep until<select class="rb-sel" [(ngModel)]="keepDays"><option [ngValue]="7">7 days</option><option [ngValue]="30">30 days</option><option [ngValue]="90">90 days</option></select></label></div>
            <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button><button class="fx-btn fx-btn-primary" (click)="keep()">Keep</button></ng-container>
          </rb-dialog>
        }
        @case ('print') {
          <rb-dialog [title]="'Print ' + r.name" (closed)="dlg.set(null)">
            <div class="rb-frm"><label>Layout<select class="rb-sel" [(ngModel)]="printLayout"><option value="view">Current view, as on screen</option><option value="it">Print layout set by IT ({{ t.display.orient }})</option></select></label></div>
            <p class="muted tiny">The values used print at the top of every page.</p>
            <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button><button class="fx-btn fx-btn-primary" (click)="dlg.set(null); s.toast('Sent to printer')">Print</button></ng-container>
          </rb-dialog>
        }
        @case ('email') {
          <rb-dialog [title]="'Email ' + r.name" (closed)="dlg.set(null)">
            <p class="muted tiny">Recipients get a link to this result. They need a Medinous login, and see it only if they have access to Billing reports.</p>
            <input class="rb-inp full tall" [(ngModel)]="emailTo" placeholder="Names or groups, for example Billing supervisors" aria-label="Recipients" />
            <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button><button class="fx-btn fx-btn-primary" [disabled]="!emailTo.trim()" (click)="dlg.set(null); s.toast('Link sent')">Send link</button></ng-container>
          </rb-dialog>
        }
        @case ('reason') {
          <rb-dialog title="Reason for exporting" (closed)="dlg.set(null)">
            <p class="muted tiny">This result includes restricted patient information ({{ restrictedCols().join(', ') }}). Your reason is recorded.</p>
            <textarea class="rb-ta" rows="3" [(ngModel)]="reason" aria-label="Reason"></textarea>
            @if (reasonErr()) { <div class="rb-ferr">Enter a reason.</div> }
            <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button><button class="fx-btn fx-btn-primary" (click)="confirmExport()">Export {{ exportFmt }}</button></ng-container>
          </rb-dialog>
        }
        @case ('saveview') {
          <rb-dialog title="Save view" (closed)="dlg.set(null)">
            <p class="muted tiny">Keeps the sort, row filters, anchored columns, widths, density and summary tab. It does not change what the report searches for.</p>
            <input class="rb-inp full tall" [(ngModel)]="viewName" placeholder="For example: Largest first" aria-label="View name" />
            <label class="rb-vrow"><input type="checkbox" [(ngModel)]="viewDef" />Use this view every time I open this report</label>
            @if (viewErr()) { <div class="rb-ferr">{{ viewErr() }}</div> }
            <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button><button class="fx-btn fx-btn-primary" (click)="saveView()">Save view</button></ng-container>
          </rb-dialog>
        }
        @case ('remind') {
          <rb-dialog title="Send payment reminder" (closed)="dlg.set(null)">
            <p class="muted tiny">An SMS reminder goes to {{ plural(selPat().length, 'patient') }} for {{ plural(selInv().length, 'invoice') }}, using the hospital's reminder template. Each send is recorded on the invoice.</p>
            <div class="rb-frm"><label>Template<select class="rb-sel"><option>Outstanding balance reminder</option><option>Insurance shortfall reminder</option></select></label></div>
            <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button>
              <button class="fx-btn fx-btn-primary" (click)="dlg.set(null); s.toast('Reminders queued for ' + plural(selPat().length, 'patient')); clearSel()">Send {{ selPat().length }}</button></ng-container>
          </rb-dialog>
        }
        @case ('assign') {
          <rb-dialog [title]="'Assign ' + plural(selInv().length, 'invoice')" (closed)="dlg.set(null)">
            <div class="rb-frm">
              <label>Assign to<select class="rb-sel" [(ngModel)]="assignee">@for (c of colleagues; track c) { <option>{{ c }}</option> }</select></label>
              <label>Note<input class="rb-inp" placeholder="Optional" /></label>
            </div>
            <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="dlg.set(null)">Cancel</button>
              <button class="fx-btn fx-btn-primary" (click)="dlg.set(null); s.toast('Assigned to ' + assignee + '. They see it in their follow-up list'); clearSel()">Assign</button></ng-container>
          </rb-dialog>
        }
      }
    } @else {
      <div class="rb-page"><div class="fx-card rb-empty"><b>This result is no longer available</b>It may have been cancelled or deleted.
        <div class="rb-btnrow center"><button class="fx-btn fx-btn-primary" (click)="router.navigate([s.home()])">Back to reports</button></div></div></div>
    }`,
})
export class RbResult {
  fdate = fdate; hm = hm; rangeText = rangeText; colleagues = COLLEAGUES;
  clearSel() { this.sel.set(new Set()); }
  id = signal('');
  pop = signal<Pop>(null);
  dlg = signal<Dlg>(null);
  sel = signal(new Set<number>());
  rowVals = signal<string[]>([]);
  exportFormats = [['Excel', 'Hospital header and criteria line'], ['PDF', 'Criteria printed at the top'], ['CSV', 'For other systems']];
  exportFmt = ''; reason = ''; reasonErr = signal(false);
  keepName = ''; keepDays = 30; printLayout = 'view'; emailTo = '';
  viewName = ''; viewDef = false; viewErr = signal('');
  assignee = COLLEAGUES[0];

  constructor(public s: RbStore, public router: Router, route: ActivatedRoute) {
    route.paramMap.subscribe((p) => { this.id.set(p.get('id')!); this.clearSel(); });
    route.queryParamMap.subscribe((q) => { if (q.get('keep')) setTimeout(() => this.openKeep()); });
  }

  r = computed(() => { this.s.rev(); return this.s.res(this.id()); });
  secs = () => Math.round((Date.now() - (this.r()?.t0 || 0)) / 1000);
  expired = () => { const r = this.r()!; return r.validUntil < new Date(); };
  view = computed<LiveView>(() => {
    this.s.rev(); const r = this.r()!; const v = this.s.viewOf(r);
    if (v.collapsed === null && r.status === 'ready') v.collapsed = r.R.start === 'collapsed' ? allKeys(r.R, r.rows) : [];
    return v;
  });
  stab = () => { const t = this.s.tpl(this.r()!.tid); return Math.min(this.view().stab || 0, t.summaries.length); };
  /** The lines layout, or one of IT's summary tabs computed from the same rows. */
  spec = computed<Spec>(() => {
    this.s.rev(); const r = this.r()!; const st = this.stab(); if (!st) return r.R;
    const x = this.s.tpl(r.tid).summaries[st - 1];
    return { ...r.R, groups: x.groups, sums: x.sums, show: { detail: false, sub: true, grand: true }, cols: [...x.groups, ...Object.keys(x.sums)], display: { ...r.R.display, mode: 'table' }, drill: [], rules: [], start: 'expanded' };
  });
  rows = computed<Row[]>(() => {
    this.s.rev(); const r = this.r()!; const v = this.view(); let rows = r.rows;
    v.rowf.forEach((f) => { rows = rows.filter((x) => f.vals.includes(String(x[f.col]))); });
    if (v.sort) { const s = v.sort; rows = [...rows].sort((a, b) => cmp(a[s.col], b[s.col]) * (s.dir === 'asc' ? 1 : -1)); }
    return rows;
  });
  table = computed(() => {
    this.s.rev(); const v = this.view();
    return buildTable(this.spec(), this.rows(), { collapsed: new Set(this.stab() ? [] : v.collapsed || []), page: v.page, find: v.find, only: v.only, pins: this.stab() ? [] : v.pins });
  });
  chart = computed(() => (this.s.rev(), chartModel(this.spec(), this.rows())));
  matches = computed(() => { this.s.rev(); const v = this.view(); const R = this.spec(); return this.rows().filter((r) => matchRow(R, R.cols, r, v.find.trim())).length; });
  groupCount = computed(() => { const R = this.r()!.R; return R.groups.length ? new Set(this.rows().map((x) => x[R.groups[0]])).size : 0; });
  namedViews = computed<NamedView[]>(() => { this.s.rev(); const k = this.r()!.src; return (this.s.namedViews[k] ||= []); });
  activeView = computed(() => (this.s.rev(), this.namedViews().find((x) => x.id === this.view().active)));
  actions = computed(() => this.s.ds(this.s.tpl(this.r()!.tid)).actions);
  selRows = computed(() => this.r()!.rows.filter((x) => this.sel().has(x._i)));
  selInv = computed(() => [...new Set(this.selRows().map((x) => x['inv']))]);
  selPat = computed(() => [...new Set(this.selRows().map((x) => x['pname']))]);
  restrictedCols = computed(() => this.r()!.R.cols.filter((id) => colOf(id, this.r()!.R.calcs)?.restricted).map((id) => this.label(id)));
  rowFilterCols = computed(() => { const R = this.r()!.R; return CAT.filter((c) => c.type === 'text' && (R.cols.includes(c.id) || R.groups.includes(c.id))).map((c) => c.id); });
  backTo = computed(() => { this.s.rev(); const b = this.s.backStack; return b.length ? this.s.res(b[b.length - 1]) : undefined; });

  label(id: string) { return colOf(id, this.r()!.R.calcs).label; }
  isNumCol(id: string) { return isNum(colOf(id, this.r()!.R.calcs)); }
  fsum(f: any) { return fSummary(f, this.r()!.R.calcs); }
  values(col: string) { return distinct(col); }
  plural(n: number, w: string) { return `${n} ${w}${n === 1 ? '' : 's'}`; }

  setStab(i: number) { const v = this.view(); v.stab = i; v.page = 0; this.s.bump(); }
  toggleGroup(k: string) { const v = this.view(); const c = v.collapsed!; const i = c.indexOf(k); i >= 0 ? c.splice(i, 1) : c.push(k); this.s.bump(); }
  toggleAll() { const v = this.view(); v.collapsed = v.collapsed!.length ? [] : allKeys(this.r()!.R, this.rows()); this.s.bump(); }
  toggleSel(i: number) { const s = new Set(this.sel()); s.has(i) ? s.delete(i) : s.add(i); this.sel.set(s); }
  selectPage() { const s = new Set(this.sel()); this.table().rows.forEach((r) => { if (r.k === 'detail') s.add(r.row._i); }); this.sel.set(s); }
  togglePin(id: string) { const v = this.view(); v.pins = v.pins.includes(id) ? v.pins.filter((x) => x !== id) : [...v.pins, id]; this.pop.set(null); this.s.bump(); }
  toggleWrap(id: string) { const v = this.view(); v.wrap = v.wrap.includes(id) ? v.wrap.filter((x) => x !== id) : [...v.wrap, id]; this.pop.set(null); this.s.bump(); }
  resetWidth(id: string) { delete this.view().widths[id]; this.pop.set(null); this.s.bump(); }
  pickVals(col: string, el: HTMLElement) { this.rowVals.set([]); this.pop.set({ kind: 'rowfval', el, col }); }
  toggleRowVal(v: string) { this.rowVals.update((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v])); }
  addRowFilter(col: string) { const vals = this.rowVals(); if (vals.length) { const v = this.view(); v.rowf.push({ col, vals }); v.page = 0; } this.pop.set(null); this.s.bump(); }

  standardView() {
    const v = this.view(); Object.assign(v, { sort: null, rowf: [], pins: [...this.s.tpl(this.r()!.tid).pins], widths: {}, wrap: [], density: '', stab: 0, active: null });
    this.pop.set(null); this.s.bump();
  }
  applyView(x: NamedView) { const v = this.view(); Object.assign(v, this.s.clone(x.state)); v.active = x.id; v.page = 0; this.pop.set(null); this.s.bump(); }
  toggleDefault(x: NamedView) { const was = x.def; this.namedViews().forEach((y) => (y.def = false)); x.def = !was; this.s.bump(); this.s.toast(x.def ? `${x.name} opens by default` : 'No default view'); }
  deleteView(x: NamedView) { const l = this.namedViews(); l.splice(l.indexOf(x), 1); if (this.view().active === x.id) this.view().active = null; this.s.bump(); }
  saveView() {
    const n = this.viewName.trim(); const list = this.namedViews();
    if (!n) { this.viewErr.set('Enter a name.'); return; }
    if (list.some((x) => x.name.toLowerCase() === n.toLowerCase())) { this.viewErr.set('You already have a view with this name.'); return; }
    if (this.viewDef) list.forEach((y) => (y.def = false));
    const x: NamedView = { id: Date.now(), name: n, def: this.viewDef, state: this.s.viewState(this.view()) };
    list.push(x); this.view().active = x.id; this.dlg.set(null); this.s.bump(); this.s.toast('View saved' + (this.viewDef ? ' as your default' : ''));
  }

  openKeep() { const r = this.r(); if (!r || r.status !== 'ready') return; this.keepName = `${r.name} ${fdate(r.ranAt)}`; this.keepDays = 30; this.dlg.set('keep'); }
  keep() { const r = this.r()!; r.savedName = this.keepName.trim() || r.name; r.keepUntil = new Date(+TODAY + this.keepDays * 864e5); this.dlg.set(null); this.s.bump(); this.s.toast('Kept. Find it under Results'); }
  export(fmt: string) {
    this.pop.set(null); this.exportFmt = fmt;
    if (this.restrictedCols().length) { this.reason = ''; this.reasonErr.set(false); this.dlg.set('reason'); return; }
    this.downloaded();
  }
  confirmExport() { if (!this.reason.trim()) { this.reasonErr.set(true); return; } this.dlg.set(null); this.downloaded(); }
  private downloaded() { this.s.toast(`Downloaded ${this.r()!.name}.${({ Excel: 'xlsx', PDF: 'pdf', CSV: 'csv' } as any)[this.exportFmt]}`); }

  rowAction(a: string) {
    if (a === 'openinv') this.s.toast(`Opens invoice ${this.selInv()[0]} in Invoice Management`);
    else if (a === 'openpat') this.s.toast(`Opens ${this.selPat()[0]}'s registration record`);
    else if (a === 'follow') { this.s.toast(`${this.plural(this.selInv().length, 'invoice')} added to your follow-up list`); this.clearSel(); }
    else if (a === 'remind') this.dlg.set('remind');
    else if (a === 'assign') this.dlg.set('assign');
  }

  changeValues() {
    const r = this.r()!; const isRep = !!this.s.rep(r.src);
    this.router.navigate(['/run', isRep ? 'rep' : 'tpl', isRep ? r.src : r.tid], { state: { crit: this.s.clone(r.crit), name: r.name } });
  }
  rerun() { const r = this.r()!; this.s.startRun(this.s.tpl(r.tid), { ...this.s.clone(r.crit), notify: 'none', openNow: true }, r.src, r.name); }
  drill(e: { col: string; value: string }) {
    const r = this.r()!; const t = this.s.tpl(r.tid); const d = t.drill.find((x) => x.col === e.col); if (!d) return;
    const tt = this.s.tpl(d.target); this.s.backStack.push(r.id);
    this.s.startRun(tt, { period: this.s.clone(r.crit.period), conds: [{ id: nextFilterId(), col: d.col, op: 'in', vals: [e.value] }], hidden: [], sorts: [], notify: 'none', openNow: true }, tt.id, `${tt.title}: ${e.value}`);
  }
  drillBack() { const id = this.s.backStack.pop()!; this.s.bump(); this.router.navigate(['/result', id]); }
}
