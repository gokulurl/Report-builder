import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RbStore, nextFilterId, nextRuleId } from './store';
import {
  CAT, CalcCol, CalcOp, DFMT, ENTITIES, NFMT, OPNAME, OPS, PERIOD_GROUPS, PRESETS, Period, Rule, SUMLBL, SWATCH, SumFn, Template,
  buildTable, chartModel, colOf, distinct, effective, isNum, rangeText, rowsFor,
} from './engine';
import { RbChart, RbDialog, RbPop, RbTable } from './ui';
import { PublishDialog } from './templates';

type Tab = 'cols' | 'group' | 'sort' | 'calc' | 'display' | 'settings';

/** IT builds the shape of a report. No data loads while building; Test run checks the shape on a sample. */
@Component({
  selector: 'rb-builder',
  imports: [NgTemplateOutlet, FormsModule, MatIconModule, MatTooltipModule, RbTable, RbChart, RbDialog, RbPop, PublishDialog],
  template: `
    @let D = d();
    <div class="rb-page rb-bpage" [attr.data-rev]="s.rev()">
      <section class="fx-card rb-btop">
        <div class="rb-btop-main">
          <input class="rb-title-in" [class.bad]="titleErr()" [(ngModel)]="D.title" (ngModelChange)="titleErr.set('')" aria-label="Template title" maxlength="160" />
          @if (titleErr()) { <div class="rb-ferr">{{ titleErr() }}</div> }
          <div class="rb-src"><span class="rb-pill">{{ D.module }}</span><mat-icon>chevron_right</mat-icon><b>{{ entity().name }}</b><span class="muted">{{ entity().row }}</span>
            <span class="rb-tag" [class.ok]="D.status === 'published'" [class.mute]="D.status === 'draft'">{{ D.status === 'draft' ? 'Draft' : 'Published' }}</span></div>
        </div>
        <button class="fx-btn fx-btn-secondary" (click)="testRun()"><mat-icon>play_arrow</mat-icon>Test run</button>
        <button class="fx-btn fx-btn-secondary" (click)="save()"><mat-icon>save</mat-icon>Save</button>
        <button class="fx-btn fx-btn-primary" (click)="publish()"><mat-icon>ios_share</mat-icon>Publish</button>
      </section>

      <div class="rb-work">
        <section class="fx-card rb-panel">
          <div class="rb-tabs" role="tablist">
            @for (x of tabs(); track x[0]) {
              <button role="tab" class="rb-tab" [class.on]="tab() === x[0]" [attr.aria-selected]="tab() === x[0]" (click)="tab.set(x[0])">{{ x[1] }}@if (x[2]) { <span class="cnt">{{ x[2] }}</span> }</button>
            }
          </div>
          <div class="rb-pbody" (input)="s.bump()" (change)="s.bump()">
            @switch (tab()) {
              @case ('cols') {
                <div class="rb-sec">
                  <div class="rb-sh">Columns staff get, in this order</div>
                  @for (id of D.cols; track id; let i = $index; let last = $last) {
                    <div class="rb-item">
                      <div class="rb-nm"><span>{{ label(id) }}</span><ng-container *ngTemplateOutlet="badges; context: { $implicit: id }" /></div>
                      @if (fmtOptions(id); as f) {
                        <select class="rb-sel xs" [ngModel]="D.fmt[id] || (col(id).type === 'date' ? 'medium' : 'auto')" (ngModelChange)="D.fmt[id] = $event; s.bump()" aria-label="Format">
                          @for (o of f; track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
                        </select>
                      }
                      <button class="fx-icon-btn sm" (click)="move(D.cols, i, -1)" [disabled]="i === 0" aria-label="Move up"><mat-icon>arrow_upward</mat-icon></button>
                      <button class="fx-icon-btn sm" (click)="move(D.cols, i, 1)" [disabled]="last" aria-label="Move down"><mat-icon>arrow_downward</mat-icon></button>
                      <button class="fx-icon-btn sm" (click)="removeCol(id)" [attr.aria-label]="'Remove ' + label(id)"><mat-icon>close</mat-icon></button>
                    </div>
                  } @empty { <p class="rb-hint">No columns yet. Add them from the list below.</p> }
                  <p class="rb-hint">Staff can untick any of these before running, except columns the report is grouped by, summarises, or links from. They cannot add columns.</p>
                </div>
                <div class="rb-sec">
                  <div class="rb-sh">Add columns<span class="r muted tiny">{{ D.cols.length }} of {{ cat.length }} in the report</span></div>
                  <label class="fx-search"><mat-icon>search</mat-icon><input [(ngModel)]="colQ" [placeholder]="'Search ' + cat.length + ' columns'" aria-label="Search columns" /></label>
                  @for (c of catList(); track c.id) {
                    <div class="rb-fld">
                      <div class="rb-fld-main"><div class="rb-nm"><span>{{ c.label }}</span><ng-container *ngTemplateOutlet="badges; context: { $implicit: c.id }" /></div><div class="muted tiny">{{ c.desc }}</div></div>
                      <button class="rb-addb" [class.on]="D.cols.includes(c.id)" (click)="D.cols.includes(c.id) ? removeCol(c.id) : add(c.id)" [attr.aria-label]="(D.cols.includes(c.id) ? 'Remove ' : 'Add ') + c.label" [attr.aria-pressed]="D.cols.includes(c.id)">
                        <mat-icon>{{ D.cols.includes(c.id) ? 'check' : 'add' }}</mat-icon></button>
                    </div>
                  } @empty { <p class="rb-hint">No columns match “{{ colQ }}”.</p> }
                </div>
              }
              @case ('group') {
                <div class="rb-sec">
                  <div class="rb-sh">Group rows by</div>
                  @for (g of D.groups; track g; let i = $index) {
                    <div class="rb-item" [style.margin-left.px]="i * 16">
                      <span class="muted tiny rb-lvl">{{ i + 1 }}</span><div class="rb-nm"><b>{{ label(g) }}</b></div>
                      <button class="fx-icon-btn sm" (click)="move(D.groups, i, -1); D.collapsed = []" [disabled]="i === 0" aria-label="Move up"><mat-icon>arrow_upward</mat-icon></button>
                      <button class="fx-icon-btn sm" (click)="D.groups.splice(i, 1); D.collapsed = []; s.bump()" [attr.aria-label]="'Stop grouping by ' + label(g)"><mat-icon>close</mat-icon></button>
                    </div>
                  } @empty { <p class="rb-hint">Not grouped.</p> }
                  @if (D.groups.length < 3) { <button class="fx-link" (click)="pop.set({ kind: 'group', el: $any($event.currentTarget) })"><mat-icon>add</mat-icon>Add group</button> <span class="muted tiny">up to 3</span> }
                </div>
                <div class="rb-sec">
                  <div class="rb-sh">Summaries</div>
                  @for (id of nonGrouped(); track id) {
                    <div class="rb-item">
                      <div class="rb-nm">{{ label(id) }}</div>
                      <select class="rb-sel rb-w180" [ngModel]="D.sums[id] || ''" (ngModelChange)="setSum(id, $event)" [attr.aria-label]="'Summary for ' + label(id)">
                        <option value="">None</option>
                        @for (o of sumOptions(id); track o) { <option [value]="o">{{ isRatio(id) ? 'Recalculated from totals' : sumLbl[o] }}</option> }
                      </select>
                    </div>
                  } @empty { <p class="rb-hint">Add columns first.</p> }
                </div>
                <div class="rb-sec">
                  <div class="rb-sh">Extra summary tabs<span class="r muted tiny">shown beside the lines, from the same run</span></div>
                  @for (x of D.summaries; track x.id; let i = $index) {
                    <div class="rb-item"><mat-icon class="sm accent">account_tree</mat-icon>
                      <div class="rb-nm tiny"><b>{{ x.name }}</b>: by {{ groupNames(x.groups) }}; {{ sumNames(x.sums) }}</div>
                      <button class="fx-icon-btn sm" (click)="D.summaries.splice(i, 1); s.bump()" [attr.aria-label]="'Remove ' + x.name"><mat-icon>close</mat-icon></button></div>
                  } @empty { <p class="muted tiny">None. Staff see one layout.</p> }
                  <button class="fx-link" (click)="openSumTab()"><mat-icon>add</mat-icon>Add summary tab</button>
                  <p class="rb-hint">For example, an invoices report with a By sponsor tab and a By patient tab. Staff switch between them without running again.</p>
                </div>
                <div class="rb-sec">
                  <div class="rb-sh">Show</div>
                  @for (o of showOpts; track o[0]) {
                    <label class="fx-switch rb-opt"><input type="checkbox" [(ngModel)]="$any(D.show)[o[0]]" (ngModelChange)="s.bump()" /><span class="fx-switch-track"></span>
                      <span><b>{{ o[1] }}</b><br /><span class="muted tiny">{{ o[2] }}</span></span></label>
                  }
                  <div class="rb-prow"><span class="rb-plab">Groups open</span><select class="rb-sel" [(ngModel)]="D.start" aria-label="How groups open"><option value="expanded">Expanded</option><option value="collapsed">Collapsed</option></select></div>
                </div>
              }
              @case ('sort') {
                <div class="rb-sec">
                  <div class="rb-sh">Default sort order<span class="r muted tiny">up to 3 levels</span></div>
                  @for (so of D.sorts; track $index; let i = $index) {
                    <div class="rb-item">
                      <span class="muted tiny rb-sortlab">{{ sortLabels[i] }}</span>
                      <select class="rb-sel grow" [(ngModel)]="so.col" (ngModelChange)="s.bump()" [attr.aria-label]="sortLabels[i]">@for (id of D.cols; track id) { <option [value]="id">{{ label(id) }}</option> }</select>
                      <select class="rb-sel" [(ngModel)]="so.dir" (ngModelChange)="s.bump()" aria-label="Direction"><option value="asc">Ascending</option><option value="desc">Descending</option></select>
                      <button class="fx-icon-btn sm" (click)="D.sorts.splice(i, 1); s.bump()" aria-label="Remove sort level"><mat-icon>close</mat-icon></button>
                    </div>
                  } @empty { <p class="rb-hint">Rows come in data set order.</p> }
                  @if (D.sorts.length < 3 && D.cols.length) { <button class="fx-link" (click)="addSort()"><mat-icon>add</mat-icon>Add sort level</button> }
                  <p class="rb-hint">Staff can choose their own sort before running, and re-sort the result afterwards without running again.</p>
                </div>
              }
              @case ('calc') {
                <div class="rb-sec">
                  <div class="rb-sh">Formula columns</div>
                  @for (k of D.calcs; track k.id) {
                    <div class="rb-item"><div class="rb-nm"><b>{{ k.label }}</b></div><span class="muted tiny">{{ label(k.a.v) }} {{ ops[k.op] }} {{ label(k.b.v) }}</span>
                      <button class="fx-icon-btn sm" (click)="removeCalc(k)" [attr.aria-label]="'Remove ' + k.label"><mat-icon>close</mat-icon></button></div>
                  } @empty { <p class="rb-hint">None yet.</p> }
                </div>
                <div class="rb-sec">
                  <div class="rb-sh">New formula column</div>
                  <input class="rb-inp full" [(ngModel)]="k.name" placeholder="Name, for example Discount rate" aria-label="Formula column name" />
                  <select class="rb-sel full" [(ngModel)]="k.a" aria-label="First value">@for (c of numCols(); track c.id) { <option [value]="c.id">{{ c.label }}</option> }</select>
                  <div class="fx-seg rb-ops">@for (o of opNames; track o[0]) { <button [class.on]="k.op === o[0]" (click)="k.op = o[0]">{{ o[1] }}</button> }</div>
                  <select class="rb-sel full" [(ngModel)]="k.b" aria-label="Second value">@for (c of numCols(); track c.id) { <option [value]="c.id">{{ c.label }}</option> }</select>
                  <p class="rb-hint">On total rows, divide and percent are recalculated from the totals, never averaged.</p>
                  @if (kErr()) { <div class="rb-ferr">{{ kErr() }}</div> }
                  <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="addCalc()"><mat-icon>add</mat-icon>Add column</button>
                </div>
              }
              @case ('display') {
                <div class="rb-sec">
                  <div class="rb-sh">Layout</div>
                  <div class="rb-prow"><span class="rb-plab">Show</span>
                    <span class="fx-seg">@for (m of [['table', 'Table'], ['chart', 'Chart'], ['both', 'Both']]; track m[0]) { <button [class.on]="D.display.mode === m[0]" (click)="D.display.mode = $any(m[0]); s.bump()">{{ m[1] }}</button> }</span>
                  </div>
                  <div class="rb-prow"><span class="rb-plab">Print</span>
                    <span class="fx-seg">@for (m of [['portrait', 'Portrait'], ['landscape', 'Landscape']]; track m[0]) { <button [class.on]="D.display.orient === m[0]" (click)="D.display.orient = $any(m[0]); s.bump()">{{ m[1] }}</button> }</span>
                  </div>
                </div>
                @if (D.display.mode !== 'table') {
                  <div class="rb-sec">
                    <div class="rb-sh">Chart</div>
                    <span class="fx-seg">@for (m of chartTypes; track m[0]) { <button [class.on]="D.display.type === m[0]" (click)="D.display.type = $any(m[0]); s.bump()">{{ m[1] }}</button> }</span>
                    <label class="rb-flab">Label column
                      <select class="rb-sel full" [(ngModel)]="D.display.label" (ngModelChange)="s.bump()"><option value="">Choose</option>@for (id of labelCols(); track id) { <option [value]="id">{{ label(id) }}</option> }</select></label>
                    <div class="rb-flab">Values</div>
                    @for (id of valueCols(); track id) {
                      <label class="rb-vrow"><input type="checkbox" [checked]="D.display.values.includes(id)" (change)="toggleValue(id)" />{{ label(id) }}</label>
                    } @empty { <p class="muted tiny">Add a number column first.</p> }
                  </div>
                }
                <div class="rb-sec">
                  <div class="rb-sh">Highlight values<span class="r muted tiny">first match wins</span></div>
                  @for (r of D.rules; track r.id) {
                    <div class="rb-item"><span class="rb-sws" [style.background]="swatch[r.sw].bg || 'transparent'" [style.color]="swatch[r.sw].fg">Aa</span>
                      <div class="rb-nm tiny">{{ label(r.col) }} {{ ruleOp[r.op] }} {{ r.a }}<span class="muted">, {{ r.applies === 'both' ? 'all rows' : r.applies + ' rows' }}</span></div>
                      <button class="fx-icon-btn sm" (click)="removeRule(r)" aria-label="Remove rule"><mat-icon>close</mat-icon></button></div>
                  }
                  <div class="rb-ruleform">
                    <select class="rb-sel" [(ngModel)]="rf.col" aria-label="Column">@for (id of D.cols; track id) { <option [value]="id">{{ label(id) }}</option> }</select>
                    <select class="rb-sel" [(ngModel)]="rf.op" aria-label="Condition"><option value="gt">more than</option><option value="lt">less than</option><option value="contains">contains</option></select>
                    <input class="rb-inp w80" [(ngModel)]="rf.a" placeholder="Value" aria-label="Value" />
                    <select class="rb-sel" [(ngModel)]="rf.sw" aria-label="Style">@for (w of swatchKeys; track w) { <option [value]="w">{{ swatch[w].n }}</option> }</select>
                    <select class="rb-sel" [(ngModel)]="rf.applies" aria-label="Applies to"><option value="detail">Detail rows</option><option value="summary">Summary rows</option><option value="both">All rows</option></select>
                    <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="addRule()"><mat-icon>add</mat-icon>Add rule</button>
                  </div>
                  @if (rErr()) { <div class="rb-ferr">{{ rErr() }}</div> }
                </div>
                <div class="rb-sec">
                  <div class="rb-sh">Drill-through</div>
                  @for (x of D.drill; track $index; let i = $index) {
                    <div class="rb-item"><mat-icon class="sm accent">link</mat-icon><div class="rb-nm tiny"><b>{{ label(x.col) }}</b> opens {{ s.tpl(x.target).title }}</div>
                      <button class="fx-icon-btn sm" (click)="D.drill.splice(i, 1); s.bump()" aria-label="Remove link"><mat-icon>close</mat-icon></button></div>
                  }
                  <div class="rb-ruleform">
                    <select class="rb-sel" [(ngModel)]="dr.col" aria-label="Column">@for (id of D.cols; track id) { <option [value]="id">{{ label(id) }}</option> }</select>
                    <span class="muted tiny">opens</span>
                    <select class="rb-sel grow" [(ngModel)]="dr.target" aria-label="Report it opens"><option value="" disabled>Choose a report</option>@for (t of drillTargets(); track t.id) { <option [value]="t.id">{{ t.title }}</option> }</select>
                    <button class="fx-btn fx-btn-primary fx-btn-sm" [disabled]="!dr.col || !dr.target" (click)="addDrill()"><mat-icon>add</mat-icon>Add link</button>
                  </div>
                  <p class="rb-hint">A clicked value becomes a criterion on the target report, with the same period.</p>
                </div>
              }
              @case ('settings') {
                <div class="rb-sec">
                  <div class="rb-sh">Period</div>
                  <p class="rb-hint">You do not choose any dates for a template. Staff choose the period every time they open the report.<br /><br />
                    For {{ entity().name }}, the period always applies to <b>{{ s.periodLabel(D) }}</b>. Medinous sets this once for the data set. Staff start from <b>{{ presets[s.ds(D).defaultPeriod.preset] }}</b> and can change it. Periods longer than one year run in the background.<br /><br />
                    The period you pick for a Test run is only for checking the template. It is not saved.</p>
                </div>
                <div class="rb-sec">
                  <div class="rb-sh">Data restrictions<span class="r muted tiny">always applied, staff cannot remove</span></div>
                  @for (f of D.scope; track f.id; let i = $index) {
                    <div class="rb-item"><mat-icon class="sm muted">lock</mat-icon><div class="rb-nm tiny"><b>{{ label(f.col) }}</b> is {{ (f.vals || []).join(', ') }}</div>
                      <button class="fx-icon-btn sm" (click)="D.scope.splice(i, 1); s.bump()" aria-label="Remove restriction"><mat-icon>close</mat-icon></button></div>
                  } @empty { <p class="muted tiny">None. Staff see all data their permissions allow.</p> }
                  <button class="fx-link" (click)="pop.set({ kind: 'scope', el: $any($event.currentTarget) })"><mat-icon>add</mat-icon>Add a restriction</button>
                  <p class="rb-hint">Use this only to limit what a report may ever show, such as Pharmacy lines only. It is not for choosing what staff look at: filters are their choice.</p>
                </div>
                <div class="rb-sec">
                  <div class="rb-sh">Results</div>
                  <div class="rb-prow"><span class="rb-plab wide">Results stay valid for</span>
                    <select class="rb-sel" [(ngModel)]="D.expiry">@for (m of expiries; track m) { <option [ngValue]="m">{{ expiryText(m) }}</option> }</select></div>
                  <p class="rb-hint">Running the same values again within this time reopens the same result instead of querying again.</p>
                  <label class="fx-switch rb-opt"><input type="checkbox" [(ngModel)]="D.heavy" /><span class="fx-switch-track"></span>
                    <span><b>Large report</b><br /><span class="muted tiny">Tells staff up front that it often runs in the background</span></span></label>
                </div>
                <div class="rb-sec">
                  <div class="rb-sh">Description staff see</div>
                  <textarea class="rb-ta" rows="2" [(ngModel)]="D.desc" aria-label="Description staff see"></textarea>
                </div>
              }
            }
          </div>
        </section>

        <section class="fx-card rb-prev">
          @if (test(); as ts) {
            <div class="rb-prevh">
              <h2>Test run</h2>
              <span class="muted tiny">First {{ testRows().length }} of {{ testAll().length.toLocaleString() }} lines for {{ rangeText(testPeriod(), true) }}. Totals cover this sample only. Run {{ ts.at }}.</span>
              <span class="rb-prevh-r"><span class="muted tiny">Sample period, not saved</span>
                <select class="rb-sel" [ngModel]="testPeriod().preset" (ngModelChange)="testPeriod.set({ preset: $event }); testRun()" aria-label="Sample period">
                  @for (g of periodGroups; track g[0]) { <optgroup [label]="g[0]">@for (k of g[1]; track k) { <option [value]="k">{{ presets[k] }}</option> }</optgroup> }
                </select>
                <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="testRun()"><mat-icon>play_arrow</mat-icon>Run again</button></span>
            </div>
            @if (stale()) { <div class="fx-outdated"><mat-icon>warning</mat-icon><span>The template has changed since this test run. Run it again to check.</span></div> }
            @if (D.scope.length) { <div class="rb-chips">@for (f of D.scope; track f.id) { <span class="rb-chip lock"><mat-icon>lock</mat-icon>{{ label(f.col) }} is {{ (f.vals || []).join(', ') }}</span> }</div> }
            <div class="rb-pvbody">
              @if (D.display.mode !== 'table') { <rb-chart [model]="testChart()" /> }
              @if (D.display.mode !== 'chart') {
                <rb-table [model]="testTable()" [spec]="testSpec()" [total]="testRows().length" [sort]="D.sorts" [widths]="D.widths" [wrap]="D.wrap" [pins]="D.pins"
                          (toggle)="toggleGroup($event)" (page)="tpage.set(tpage() + $event)" (headerMenu)="pop.set({ kind: 'header', el: $event.el, col: $event.id })"
                          (resized)="D.widths[$event.id] = $event.w; s.bump()" (drill)="s.toast('Staff see the linked report open here')" />
              }
            </div>
          } @else {
            <div class="rb-empty narrow">
              <mat-icon class="big">table_view</mat-icon>
              <b>No data loads while you build</b>A template is the shape of a report: columns, grouping, totals and layout. Staff choose the period and filters when they run it. Use Test run to check the shape against a small sample.
              <div class="rb-btnrow center"><button class="fx-btn fx-btn-primary" (click)="testRun()"><mat-icon>play_arrow</mat-icon>Test run</button></div>
            </div>
          }
        </section>
      </div>
    </div>

    <ng-template #badges let-id>
      @let c = col(id);
      @if (c.rel) { <span class="rb-mk rel" matTooltip="From related data, one value per row">Related</span> }
      @if (c.type === 'calc') { <span class="rb-mk calc">Formula</span> }
      @if (c.restricted) { <span class="rb-mk res" matTooltip="Exporting it asks staff for a reason">Restricted</span> }
    </ng-template>

    @if (pop(); as p) {
      <rb-pop [anchor]="p.el" (closed)="pop.set(null)">
        @switch (p.kind) {
          @case ('group') {
            <div class="rb-mlab">Group rows by</div>
            @for (c of groupable(); track c.id) { <button class="rb-mi" (click)="addGroup(c.id)">{{ c.label }}</button> }
          }
          @case ('scope') {
            <div class="rb-mlab">Always limit to</div>
            @for (c of textCols; track c.id) { <button class="rb-mi" (click)="scopeVals.set([]); pop.set({ kind: 'scopeval', el: p.el, col: c.id })">{{ c.label }}</button> }
          }
          @case ('scopeval') {
            <div class="rb-mlab">{{ label(p.col!) }}</div>
            @for (v of values(p.col!); track v[0]) {
              <button class="rb-mi" (click)="toggleScopeVal(v[0])"><span class="rb-cbx" [class.on]="scopeVals().includes(v[0])">@if (scopeVals().includes(v[0])) { <mat-icon>check</mat-icon> }</span>{{ v[0] }}<span class="r">{{ v[1] }}</span></button>
            }
            <div class="rb-msep"></div><button class="rb-mi" (click)="addScope(p.col!)"><b>Done</b></button>
          }
          @case ('header') {
            @let id = p.col!;
            <button class="rb-mi" (click)="defaultSort(id, 'asc')"><mat-icon>arrow_upward</mat-icon>Default sort ascending</button>
            <button class="rb-mi" (click)="defaultSort(id, 'desc')"><mat-icon>arrow_downward</mat-icon>Default sort descending</button>
            <div class="rb-msep"></div>
            <button class="rb-mi" (click)="toggleIn(D.pins, id)"><mat-icon>push_pin</mat-icon>{{ D.pins.includes(id) ? 'Unpin' : 'Pin to the left' }}</button>
            <button class="rb-mi" (click)="toggleIn(D.wrap, id)"><mat-icon>wrap_text</mat-icon>{{ D.wrap.includes(id) ? 'Stop wrapping' : 'Wrap text' }}</button>
          }
        }
      </rb-pop>
    }
    @if (sumTabOpen()) {
      <rb-dialog title="Add summary tab" (closed)="sumTabOpen.set(false)">
        <div class="rb-frm col">
          <label>Tab name<input class="rb-inp" [(ngModel)]="st.name" placeholder="For example: By doctor" /></label>
          <label>Group by<select class="rb-sel" [(ngModel)]="st.g">@for (c of groupableAll; track c.id) { <option [value]="c.id">{{ c.label }}</option> }</select></label>
          <label>Then by (optional)<select class="rb-sel" [(ngModel)]="st.g2"><option value="">None</option>@for (c of groupableAll; track c.id) { <option [value]="c.id">{{ c.label }}</option> }</select></label>
        </div>
        <div class="rb-flab">Totals to show</div>
        @for (m of stMeasures; track m[0]) { <label class="rb-vrow"><input type="checkbox" [(ngModel)]="st.pick[m[0]]" />{{ m[2] }}</label> }
        @if (stErr()) { <div class="rb-ferr">{{ stErr() }}</div> }
        <ng-container foot><button class="fx-btn fx-btn-secondary" (click)="sumTabOpen.set(false)">Cancel</button><button class="fx-btn fx-btn-primary" (click)="addSumTab()">Add tab</button></ng-container>
      </rb-dialog>
    }
    @if (publishing()) { <rb-publish [tpl]="D" (closed)="publishing.set(false)" (done)="published($event)" /> }`,
})
export class RbBuilder {
  cat = CAT; presets = PRESETS; periodGroups = PERIOD_GROUPS; rangeText = rangeText; sumLbl = SUMLBL; ops = OPS; swatch = SWATCH;
  swatchKeys = Object.keys(SWATCH);
  opNames = Object.entries(OPNAME) as [CalcOp, string][];
  chartTypes = [['bar', 'Bar'], ['line', 'Line'], ['pie', 'Pie'], ['doughnut', 'Doughnut']];
  ruleOp: Record<string, string> = { gt: 'more than', lt: 'less than', eq: 'equals', between: 'between', contains: 'contains' };
  sortLabels = ['Sort by', 'Then by', 'And finally'];
  expiries = [15, 30, 60, 240, 1440];
  showOpts: [string, string, string][] = [['detail', 'Detail rows', 'Turn off to show one row per group'], ['sub', 'Subtotals', 'A total line under each group'], ['grand', 'Grand total', 'A total at the end']];
  textCols = CAT.filter((c) => c.type === 'text');
  groupableAll = CAT.filter((c) => c.grp);
  stMeasures: [string, SumFn, string][] = [['inv', 'countd', 'Count of invoices'], ['qty', 'sum', 'Total quantity'], ['gross', 'sum', 'Total gross amount'], ['disc', 'sum', 'Total discount'], ['net', 'sum', 'Total net amount']];

  d = signal<Template & { collapsed: string[] }>(null!);
  tab = signal<Tab>('cols');
  colQv = signal('');
  get colQ() { return this.colQv(); } set colQ(v: string) { this.colQv.set(v); }
  titleErr = signal('');
  pop = signal<{ kind: 'group' | 'scope' | 'scopeval' | 'header'; el: HTMLElement; col?: string } | null>(null);
  scopeVals = signal<string[]>([]);
  test = signal<{ at: string; snap: string } | null>(null);
  testPeriod = signal<Period>({ preset: 'last30' });
  tpage = signal(0);
  k = { name: 'Discount rate', a: 'disc', op: 'pct' as CalcOp, b: 'gross' }; kErr = signal('');
  rf: Omit<Rule, 'id'> = { col: '', op: 'gt', a: '', sw: 'gbg', applies: 'detail' }; rErr = signal('');
  dr = { col: '', target: '' };
  sumTabOpen = signal(false); stErr = signal('');
  st = { name: '', g: 'doc', g2: '', pick: {} as Record<string, boolean> };
  publishing = signal(false);

  constructor(public s: RbStore, private router: Router, route: ActivatedRoute) {
    s.setRole('admin');
    route.paramMap.subscribe((p) => {
      const id = p.get('id')!;
      const draft = history.state?.draft as Template | undefined;
      // A new template starts from the New template dialog, which asks for the module and data set
      if (id === 'new' && !draft) { router.navigate(['/it'], { queryParams: { new: 1 }, replaceUrl: true }); return; }
      const base = id === 'new' ? draft! : s.tpl(id);
      this.d.set({ ...s.clone(base), collapsed: [] });
      this.testPeriod.set(s.clone(s.ds(base).defaultPeriod)); this.test.set(null); this.tab.set('cols');
      this.rf.col = base.cols[0] || ''; this.dr = { col: base.cols[0] || '', target: '' };
    });
  }

  entity = computed(() => { const D = this.d(); return ENTITIES[D.module].find((e) => e.id === D.entity)!; });
  tabs = computed<[Tab, string, number][]>(() => {
    this.s.rev(); const D = this.d();
    return [['cols', 'Columns', D.cols.length], ['group', 'Group', D.groups.length], ['sort', 'Sort', D.sorts.length], ['calc', 'Formulas', D.calcs.length],
      ['display', 'Display', (D.display.mode !== 'table' ? 1 : 0) + D.rules.length + D.drill.length], ['settings', 'Settings', D.scope.length]];
  });
  catList = computed(() => { const q = this.colQv().toLowerCase(); return CAT.filter((c) => !q || c.label.toLowerCase().includes(q)); });
  col(id: string) { return colOf(id, this.d().calcs); }
  label(id: string) { return this.col(id)?.label || id; }
  fmtOptions(id: string): [string, string][] | null {
    const c = this.col(id); if (c.type === 'date') return Object.entries(DFMT); if (isNum(c) && c.type !== 'calc') return Object.entries(NFMT); return null;
  }
  nonGrouped() { const D = this.d(); return D.cols.filter((x) => !D.groups.includes(x)); }
  isRatio(id: string) { const c = this.col(id) as CalcCol; return c.type === 'calc' && (c.op === 'div' || c.op === 'pct'); }
  sumOptions(id: string): SumFn[] { const c = this.col(id); return c.type === 'calc' ? ['sum'] : c.sum; }
  groupable() { const D = this.d(); return CAT.filter((c) => c.grp && !D.groups.includes(c.id)); }
  numCols() { return [...CAT.filter(isNum), ...this.d().calcs]; }
  labelCols() { const D = this.d(); return [...D.groups, ...D.cols.filter((id) => !isNum(this.col(id)) && !D.groups.includes(id))]; }
  valueCols() { return this.d().cols.filter((id) => isNum(this.col(id))); }
  drillTargets() { return this.s.templates.filter((t) => t.id !== this.d().id && !t.removed); }
  groupNames(g: string[]) { return g.map((x) => this.label(x)).join(', then '); }
  sumNames(m: Record<string, SumFn>) { return Object.entries(m).map(([c, f]) => SUMLBL[f] + ' of ' + this.label(c)).join(', '); }
  expiryText(m: number) { return m < 60 ? m + ' minutes' : m === 60 ? '1 hour' : m === 1440 ? '1 day' : m / 60 + ' hours'; }
  values(col: string) { return distinct(col); }

  move<T>(a: T[], i: number, dir: number) { const j = i + dir; [a[i], a[j]] = [a[j], a[i]]; this.s.bump(); }
  toggleIn(a: string[], id: string) { const i = a.indexOf(id); i >= 0 ? a.splice(i, 1) : a.push(id); this.pop.set(null); this.s.bump(); }
  add(id: string) { this.d().cols.push(id); if (!this.rf.col) this.rf.col = id; if (!this.dr.col) this.dr.col = id; this.s.bump(); }
  /** Removing a column also removes everything that depended on it. */
  removeCol(id: string) {
    const D = this.d();
    D.cols = D.cols.filter((x) => x !== id); D.groups = D.groups.filter((x) => x !== id); delete D.sums[id];
    D.sorts = D.sorts.filter((s) => s.col !== id); D.rules = D.rules.filter((r) => r.col !== id); D.drill = D.drill.filter((d) => d.col !== id);
    D.display.values = D.display.values.filter((v) => v !== id); if (D.display.label === id) D.display.label = ''; D.pins = D.pins.filter((p) => p !== id);
    this.s.bump();
  }
  addGroup(id: string) { const D = this.d(); D.groups.push(id); if (!D.cols.includes(id)) D.cols.unshift(id); D.collapsed = []; this.pop.set(null); this.s.bump(); }
  setSum(id: string, v: string) { const D = this.d(); if (v) D.sums[id] = v as SumFn; else delete D.sums[id]; this.s.bump(); }
  addSort() { const D = this.d(); const f = D.cols.find((x) => !D.sorts.some((s) => s.col === x)); if (f) D.sorts.push({ col: f, dir: 'asc' }); this.s.bump(); }
  defaultSort(id: string, dir: 'asc' | 'desc') { const D = this.d(); D.sorts = [{ col: id, dir }, ...D.sorts.filter((s) => s.col !== id)].slice(0, 3); this.pop.set(null); this.s.bump(); }
  toggleValue(id: string) { const v = this.d().display; v.values = v.values.includes(id) ? v.values.filter((x) => x !== id) : [...v.values, id]; this.s.bump(); }
  toggleGroup(k: string) { const c = this.d().collapsed; const i = c.indexOf(k); i >= 0 ? c.splice(i, 1) : c.push(k); this.s.bump(); }

  addCalc() {
    const D = this.d(); const n = this.k.name.trim();
    if (!n) { this.kErr.set('Enter a name.'); return; }
    if ([...D.cols.map((id) => this.label(id)), ...CAT.map((c) => c.label)].some((l) => l.toLowerCase() === n.toLowerCase())) { this.kErr.set('A column with this name already exists.'); return; }
    if (this.k.a === this.k.b && (this.k.op === 'div' || this.k.op === 'pct' || this.k.op === 'sub')) { this.kErr.set('Choose two different columns.'); return; }
    const ratio = this.k.op === 'div' || this.k.op === 'pct';
    const kc: CalcCol = { id: 'k' + Date.now(), label: n, type: 'calc', op: this.k.op, a: { kind: 'col', v: this.k.a }, b: { kind: 'col', v: this.k.b }, kfmt: this.k.op === 'pct' ? 'pct' : ratio ? 'num' : 'money', dp: this.k.op === 'pct' ? 1 : ratio ? 2 : 3, sum: ['sum'] };
    D.calcs.push(kc); D.cols.push(kc.id); if (D.groups.length) D.sums[kc.id] = 'sum';
    this.kErr.set(''); this.s.bump(); this.s.toast(n + ' added');
  }
  removeCalc(k: CalcCol) {
    const D = this.d(); const users = D.calcs.filter((x) => x.a.v === k.id || x.b.v === k.id);
    if (users.length) { this.s.toast(`${users[0].label} uses ${k.label}. Remove it first`, '', true); return; }
    D.calcs = D.calcs.filter((x) => x !== k); this.removeCol(k.id);
  }
  addRule() {
    if (!this.rf.col) { this.rErr.set('Choose a column'); return; }
    if (!this.rf.a.trim()) { this.rErr.set('Enter a value'); return; }
    if (this.rf.op !== 'contains' && isNaN(parseFloat(this.rf.a))) { this.rErr.set('Enter a number, for example 500'); return; }
    this.d().rules.push({ id: nextRuleId(), ...this.rf, a: this.rf.a.trim() }); this.rf.a = ''; this.rErr.set(''); this.s.bump();
  }
  removeRule(r: Rule) { const D = this.d(); D.rules = D.rules.filter((x) => x !== r); this.s.bump(); }
  addDrill() { this.d().drill = [...this.d().drill.filter((x) => x.col !== this.dr.col), { ...this.dr }]; this.s.bump(); }
  toggleScopeVal(v: string) { this.scopeVals.update((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v])); }
  addScope(col: string) { if (this.scopeVals().length) this.d().scope.push({ id: nextFilterId(), col, op: 'in', vals: this.scopeVals(), fixed: true }); this.pop.set(null); this.s.bump(); }
  openSumTab() { this.st = { name: '', g: 'doc', g2: '', pick: { inv: true, net: true } }; this.stErr.set(''); this.sumTabOpen.set(true); }
  addSumTab() {
    const n = this.st.name.trim(); const m = this.stMeasures.filter((x) => this.st.pick[x[0]]);
    if (!n) { this.stErr.set('Enter a tab name.'); return; }
    if (!m.length) { this.stErr.set('Choose at least one total.'); return; }
    if (this.st.g2 && this.st.g2 === this.st.g) { this.stErr.set('Choose two different columns.'); return; }
    this.d().summaries.push({ id: 's' + Date.now(), name: n, groups: this.st.g2 ? [this.st.g, this.st.g2] : [this.st.g], sums: Object.fromEntries(m.map((x) => [x[0], x[1]])) });
    this.sumTabOpen.set(false); this.s.bump(); this.s.toast(n + ' tab added');
  }

  /* ---------- test run ---------- */
  private snap() { const { collapsed, widths, wrap, pins, title, desc, status, edited, places, expiry, heavy, ...o } = this.d() as any; return JSON.stringify(o); }
  testRun() {
    if (!this.d().cols.length) { this.s.toast('Add columns first', '', true); return; }
    this.test.set({ at: new Date().toTimeString().slice(0, 5), snap: this.snap() }); this.tpage.set(0); this.s.bump();
  }
  stale = computed(() => { this.s.rev(); return this.test()?.snap !== this.snap(); });
  testSpec = computed(() => { this.s.rev(); this.test(); return effective(this.d(), { period: this.testPeriod(), conds: [], hidden: [], sorts: [] }); });
  testAll = computed(() => rowsFor(this.testSpec()));
  testRows = computed(() => this.testAll().slice(0, 200));
  testTable = computed(() => (this.s.rev(), buildTable(this.testSpec(), this.testRows(), { collapsed: new Set(this.d().collapsed), page: this.tpage(), find: '', only: false, pins: this.d().pins })));
  testChart = computed(() => chartModel(this.testSpec(), this.testRows()));

  /* ---------- save / publish ---------- */
  private valid() {
    const D = this.d(); const t = D.title.trim();
    if (!t || t.length > 150) { this.titleErr.set('Template title must be between 1 and 150 characters.'); return false; }
    if (!D.cols.length) { this.tab.set('cols'); this.s.toast('Add at least one column', '', true); return false; }
    if (D.groups.length && !this.nonGrouped().some((x) => D.sums[x])) { this.tab.set('group'); this.s.toast('Choose a summary for at least one column, or remove the grouping', '', true); return false; }
    this.titleErr.set(''); return true;
  }
  private commit() { const { collapsed, ...t } = this.d(); this.s.saveTemplate(t as Template); }
  save() { if (!this.valid()) return; this.commit(); this.s.toast('Template saved'); if (this.router.url.endsWith('/new')) this.router.navigate(['/it/builder', this.d().id], { replaceUrl: true }); }
  publish() { if (this.valid()) this.publishing.set(true); }
  published(places: string[]) {
    const D = this.d(); D.places = places; D.status = 'published'; this.commit(); this.publishing.set(false);
    this.s.toast('Published to ' + places.join(', ').replace(/, ([^,]*)$/, ' and $1'));
    if (this.router.url.endsWith('/new')) this.router.navigate(['/it/builder', D.id], { replaceUrl: true });
  }
}
