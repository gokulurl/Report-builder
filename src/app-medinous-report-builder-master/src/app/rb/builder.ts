import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RbStore, nextFilterId, nextRuleId } from './store';
import {
  CAT, CalcCol, CalcOp, DFMT, ENTITIES, NFMT, OPNAME, OPS, PERIOD_GROUPS, PRESETS, Period, ROWS, Rule, SUMLBL, SWATCH, SumFn, Template,
  buildTable, chartModel, colOf, distinct, effective, isNum, rangeText, rowsFor,
} from './engine';
import { RbChart, RbPop, RbTable } from './ui';
import { PublishDialog } from './templates';

type Tab = 'cols' | 'group' | 'sort' | 'calc' | 'display' | 'settings';

/** IT builds the shape of a report. No data loads while building; Test run checks the shape on a sample. */
@Component({
  selector: 'rb-builder',
  imports: [NgTemplateOutlet, FormsModule, MatIconModule, MatTooltipModule, RbTable, RbChart, RbPop, PublishDialog],
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
                        <select class="rb-sel xs" [ngModel]="fmtOf(id)" (ngModelChange)="D.fmt[id] = $event; s.bump()" aria-label="Format">
                          @for (o of f; track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }
                        </select>
                      } @else if (col(id).bucket) { <span class="muted tiny rb-bfmt">Shown as {{ bucketSample(id) }}</span> }
                      <button class="fx-icon-btn sm" (click)="move(D.cols, i, -1)" [disabled]="i === 0" aria-label="Move up"><mat-icon>arrow_upward</mat-icon></button>
                      <button class="fx-icon-btn sm" (click)="move(D.cols, i, 1)" [disabled]="last" aria-label="Move down"><mat-icon>arrow_downward</mat-icon></button>
                      <button class="fx-icon-btn sm" (click)="removeCol(id)" [attr.aria-label]="'Remove ' + label(id)"><mat-icon>close</mat-icon></button>
                    </div>
                  } @empty { <p class="rb-hint">No columns yet. Add them from the list below.</p> }
                  <p class="rb-hint">Staff can hide and reorder these on their own reports, except columns used for grouping, a formula or a link. They can't add columns.</p>
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
                  <div class="rb-sh">Totals for each group<span class="r muted tiny">shown on subtotal and grand total rows</span></div>
                  @if (!D.groups.length) { <p class="rb-hint">Add a group first. Totals appear under each group.</p> }
                  @else {
                  @if (!totalled()) { <div class="fx-outdated rb-warnbox"><mat-icon>warning</mat-icon><span>Nothing is totalled yet, so the total rows are empty. Choose Total, Count or another option for at least one column.</span></div> }
                  @for (id of nonGrouped(); track id) {
                    <div class="rb-item">
                      <div class="rb-nm">{{ label(id) }}</div>
                      <select class="rb-sel rb-w180" [ngModel]="D.sums[id] || ''" (ngModelChange)="setSum(id, $event)" [attr.aria-label]="'Summary for ' + label(id)">
                        <option value="">None</option>
                        @for (o of sumOptions(id); track o) { <option [value]="o">{{ isRatio(id) ? 'Recalculated from totals' : sumLbl[o] }}</option> }
                      </select>
                    </div>
                  } @empty { <p class="rb-hint">Add columns first.</p> }
                  }
                </div>
                <div class="rb-sec">
                  <div class="rb-sh">Show</div>
                  <label class="fx-switch rb-opt"><input type="checkbox" [ngModel]="!D.show.detail" (ngModelChange)="D.show.detail = !$event; s.bump()" /><span class="fx-switch-track"></span>
                    <span><b>Totals only</b><br /><span class="muted tiny">Staff never see individual lines. Leave off unless lines must stay hidden; staff can already choose a summary themselves</span></span></label>
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
                    <div class="rb-item"><div class="rb-nm"><b>{{ k.label }}</b></div><span class="muted tiny">{{ label(k.a.v) }} {{ ops[k.op] }} {{ label(k.b.v) }}@if (k.op === 'join') { ("{{ k.sep }}") }</span>
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
                <div class="rb-sec">
                  <div class="rb-sh">Join text columns</div>
                  <input class="rb-inp full" [(ngModel)]="j.name" placeholder="Name, for example Patient" aria-label="Name of the joined column" />
                  <div class="rb-hlrow">
                    <label class="rb-flab grow">First<select class="rb-sel" [(ngModel)]="j.a">@for (c of textCols2; track c.id) { <option [value]="c.id">{{ c.label }}</option> }</select></label>
                    <label class="rb-flab rb-sepf">Separator<input class="rb-inp" [(ngModel)]="j.sep" aria-label="Separator" /></label>
                    <label class="rb-flab grow">Then<select class="rb-sel" [(ngModel)]="j.b">@for (c of textCols2; track c.id) { <option [value]="c.id">{{ c.label }}</option> }</select></label>
                  </div>
                  <p class="rb-hint">For example patient name and ID as one column. A joined column is text: it can be grouped and filtered, not totalled.</p>
                  @if (jErr()) { <div class="rb-ferr">{{ jErr() }}</div> }
                  <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="addJoin()"><mat-icon>add</mat-icon>Add joined column</button>
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
                      <div class="rb-nm tiny">{{ label(r.col) }} {{ ruleOp[r.op] }} {{ r.op === 'before' || r.op === 'after' ? r.a.split('-').reverse().join('/') : r.a }}<span class="muted"> · {{ appliesText[r.applies] }}</span></div>
                      <button class="fx-icon-btn sm" (click)="removeRule(r)" aria-label="Remove rule"><mat-icon>close</mat-icon></button></div>
                  }
                  @if (D.cols.length) {
                  <div class="rb-hlf">
                    <div class="rb-hlrow">
                      <label class="rb-flab grow">When<select class="rb-sel" [ngModel]="rf.col" (ngModelChange)="setRuleCol($event)">@for (id of D.cols; track id) { <option [value]="id">{{ label(id) }}</option> }</select></label>
                      <label class="rb-flab rb-hlop">Is<select class="rb-sel" [(ngModel)]="rf.op" (ngModelChange)="rf.a = ''; rErr.set('')">@for (o of ruleOps(); track o[0]) { <option [value]="o[0]">{{ o[1] }}</option> }</select></label>
                      <label class="rb-flab grow">Value
                        @switch (ruleKind()) {
                          @case ('text') {
                            @if (rf.op === 'contains') { <input class="rb-inp" [(ngModel)]="rf.a" placeholder="Text" /> }
                            @else { <select class="rb-sel" [(ngModel)]="rf.a"><option value="">Choose a value</option>@for (v of ruleValues(); track v) { <option [value]="v">{{ v }}</option> }</select> }
                          }
                          @case ('date') { <input class="rb-inp" type="date" [(ngModel)]="rf.a" /> }
                          @default { <input class="rb-inp" [(ngModel)]="rf.a" placeholder="Number" inputmode="decimal" /> }
                        }
                      </label>
                    </div>
                    <div class="rb-flab">Colour</div>
                    <div class="rb-hlsw" role="radiogroup" aria-label="Highlight colour">
                      @for (w of swatchKeys; track w) {
                        <button class="rb-hlsw-b" [class.on]="rf.sw === w" role="radio" [attr.aria-checked]="rf.sw === w" (click)="rf.sw = w" [title]="swatch[w].n">
                          <span class="rb-hlsw-p" [style.background]="swatch[w].bg || '#fff'" [style.color]="swatch[w].fg">{{ ruleKind() === 'num' ? '1,250' : 'Aa' }}</span><span>{{ swatch[w].n }}</span></button>
                      }
                    </div>
                    <div class="rb-hlrow rb-hlend">
                      <label class="rb-flab">Apply to<select class="rb-sel" [(ngModel)]="rf.applies"><option value="detail">Lines</option><option value="summary">Total rows</option><option value="both">Lines and totals</option></select></label>
                      <button class="fx-btn fx-btn-primary fx-btn-sm" (click)="addRule()"><mat-icon>add</mat-icon>Add rule</button>
                    </div>
                  </div>
                  } @else { <p class="muted tiny">Add columns first.</p> }
                  @if (rErr()) { <div class="rb-ferr">{{ rErr() }}</div> }
                </div>
                <div class="rb-sec">
                  <div class="rb-sh">Drill-through</div>
                  @for (x of D.drill; track $index; let i = $index) {
                    <div class="rb-item"><mat-icon class="sm accent">link</mat-icon><div class="rb-nm tiny"><b>{{ label(x.col) }}</b> opens {{ s.tpl(x.target).title }}</div>
                      <button class="fx-icon-btn sm" (click)="D.drill.splice(i, 1); s.bump()" aria-label="Remove link"><mat-icon>close</mat-icon></button></div>
                  }
                  @if (!D.drill.length) { <p class="muted tiny">None yet.</p> }
                  <div class="rb-ruleform">
                    <span class="muted tiny">Clicking a value in</span>
                    <select class="rb-sel" [(ngModel)]="dr.col" aria-label="Column">@for (id of drillCols(); track id) { <option [value]="id">{{ label(id) }}</option> }</select>
                    <span class="muted tiny">opens</span>
                    <select class="rb-sel grow" [(ngModel)]="dr.target" aria-label="Report it opens"><option value="" disabled>Choose a report</option>@for (t of drillTargets(); track t.id) { <option [value]="t.id">{{ t.title }}</option> }</select>
                    <button class="fx-btn fx-btn-primary fx-btn-sm" [disabled]="!dr.col || !dr.target" (click)="addDrill()"><mat-icon>add</mat-icon>Add link</button>
                  </div>
                  <p class="rb-hint">The linked report opens filtered to the clicked value, for the same period.</p>
                </div>
              }
              @case ('settings') {
                <div class="rb-sec">
                  <div class="rb-sh">Period</div>
                  <p class="muted tiny">Staff choose it when they run the report. It applies to <b>{{ s.periodLabel(D) }}</b> and starts at {{ presets[s.ds(D).defaultPeriod.preset] }}.</p>
                </div>
                @if (D.scope.length) {
                  <div class="rb-sec">
                    <div class="rb-sh">Restriction<span class="r muted tiny">editing comes in phase 2</span></div>
                    <p class="muted tiny rb-lockp"><mat-icon class="xs">lock</mat-icon> Always limited to {{ s.scopeText(D) }}.</p>
                  </div>
                }
                <div class="rb-sec">
                  <div class="rb-sh">Results</div>
                  <div class="rb-prow"><span class="rb-plab wide">Results stay valid for</span>
                    <select class="rb-sel" [(ngModel)]="D.expiry">@for (m of expiries; track m) { <option [ngValue]="m">{{ expiryText(m) }}</option> }</select></div>
                  <p class="rb-hint">Running again with the same values within this time reuses the result.</p>
                  <label class="fx-switch rb-opt"><input type="checkbox" [(ngModel)]="D.heavy" /><span class="fx-switch-track"></span>
                    <span><b>Large report</b><br /><span class="muted tiny">Warns staff it may run in the background</span></span></label>
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
                </select></span>
            </div>
            @if (stale()) { <div class="fx-outdated"><mat-icon>warning</mat-icon><span>The template has changed since this test. Click Test run to refresh it.</span></div> }
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
    @if (publishing()) { <rb-publish [tpl]="D" (closed)="publishing.set(false)" (done)="published($event)" /> }`,
})
export class RbBuilder {
  cat = CAT; presets = PRESETS; periodGroups = PERIOD_GROUPS; rangeText = rangeText; sumLbl = SUMLBL; ops = OPS; swatch = SWATCH;
  swatchKeys = Object.keys(SWATCH);
  opNames = Object.entries(OPNAME) as [CalcOp, string][];
  chartTypes = [['bar', 'Bar'], ['line', 'Line'], ['pie', 'Pie'], ['doughnut', 'Doughnut']];
  ruleOp: Record<string, string> = { gt: 'more than', lt: 'less than', eq: 'equals', between: 'between', contains: 'contains', is: 'is', isnot: 'is not', before: 'before', after: 'after' };
  appliesText: Record<string, string> = { detail: 'lines', summary: 'total rows', both: 'lines and totals' };
  /** Text columns that can be joined (not restricted, not a bucketed date). */
  textCols2 = CAT.filter((c) => !isNum(c) && !c.bucket && !c.restricted && c.type !== 'date');
  j = { name: 'Patient', a: 'pname', sep: ' ', b: 'pid' }; jErr = signal('');
  sortLabels = ['Sort by', 'Then by', 'And finally'];
  expiries = [15, 30, 60, 240, 1440];
  showOpts: [string, string, string][] = [['sub', 'Subtotals', 'A total line under each group'], ['grand', 'Grand total', 'A total at the end']];
  textCols = CAT.filter((c) => c.type === 'text');
  groupableAll = CAT.filter((c) => c.grp);

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
      this.rf = { col: base.cols[0] || '', op: 'gt', a: '', sw: 'gbg', applies: 'detail' }; if (this.rf.col) this.setRuleCol(this.rf.col);
      this.dr = { col: '', target: '' }; setTimeout(() => (this.dr.col = this.drillCols()[0] || ''));
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
    const c = this.col(id); if (c.type === 'date' && !c.bucket) return Object.entries(DFMT); if (isNum(c) && c.type !== 'calc') return Object.entries(NFMT); return null;
  }
  /** Saved "short" dates read as the medium format now (06/10/2026 is ambiguous across regions). */
  fmtOf(id: string) { const f = this.d().fmt[id]; return (f === 'short' ? 'medium' : f) || (this.col(id).type === 'date' ? 'medium' : 'auto'); }
  bucketSample(id: string) { const b = this.col(id).bucket; return b === 'day' ? '06 Oct 2026' : b === 'week' ? 'Week of 04 Oct 2026' : 'Oct 2026'; }
  totalled() { const D = this.d(); return this.nonGrouped().some((x) => D.sums[x]); }
  drillCols() { const D = this.d(); return D.cols.filter((id) => !isNum(this.col(id)) && !D.drill.some((x) => x.col === id)); }
  ruleKind(): 'text' | 'num' | 'date' { const c = this.col(this.rf.col); return !c ? 'text' : c.type === 'date' ? 'date' : isNum(c) ? 'num' : 'text'; }
  ruleOps(): [string, string][] {
    return ({ text: [['is', 'is'], ['isnot', 'is not'], ['contains', 'contains']], num: [['gt', 'more than'], ['lt', 'less than'], ['eq', 'equals']], date: [['before', 'before'], ['after', 'after']] } as Record<string, [string, string][]>)[this.ruleKind()];
  }
  ruleValues() { return [...new Set(ROWS.map((r) => r[this.rf.col]).filter((v) => v != null && v !== ''))].map(String).sort(); }
  setRuleCol(id: string) { this.rf.col = id; this.rf.op = this.ruleOps()[0][0] as Rule['op']; this.rf.a = ''; this.rErr.set(''); }
  nonGrouped() { const D = this.d(); return D.cols.filter((x) => !D.groups.includes(x)); }
  isRatio(id: string) { const c = this.col(id) as CalcCol; return c.type === 'calc' && (c.op === 'div' || c.op === 'pct'); }
  sumOptions(id: string): SumFn[] { const c = this.col(id); return c.type === 'calc' ? ((c as CalcCol).op === 'join' ? ['count'] : ['sum']) : c.sum; }
  groupable() { const D = this.d(); return CAT.filter((c) => c.grp && !D.groups.includes(c.id)); }
  numCols() { return [...CAT.filter(isNum), ...this.d().calcs.filter((k) => k.op !== 'join')]; }
  labelCols() { const D = this.d(); return [...D.groups, ...D.cols.filter((id) => !isNum(this.col(id)) && !D.groups.includes(id))]; }
  valueCols() { return this.d().cols.filter((id) => isNum(this.col(id))); }
  drillTargets() { return this.s.templates.filter((t) => t.id !== this.d().id && !t.removed); }
  groupNames(g: string[]) { return g.map((x) => this.label(x)).join(', then '); }
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
  addGroup(id: string) {
    const D = this.d(); D.groups.push(id); if (!D.cols.includes(id)) D.cols.unshift(id); D.collapsed = []; this.pop.set(null);
    let n = 0;
    D.cols.filter((x) => !D.groups.includes(x)).forEach((x) => {
      if (D.sums[x]) return; const c = this.col(x); if (!c) return;
      if (x === 'inv') { D.sums[x] = 'countd'; n++; } else if ((c.type === 'money' || c.type === 'int') && c.sum.includes('sum')) { D.sums[x] = 'sum'; n++; }
    });
    if (n) this.s.toast('Totals added for amounts and invoice count. Change them under Totals for each group');
    this.s.bump();
  }
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
    const k = this.ruleKind(); const a = String(this.rf.a || '').trim();
    if (!this.ruleOps().some((o) => o[0] === this.rf.op)) this.rf.op = this.ruleOps()[0][0] as Rule['op'];
    if (!a) { this.rErr.set(k === 'text' && this.rf.op !== 'contains' ? 'Choose a value' : k === 'date' ? 'Choose a date' : 'Enter a value'); return; }
    if (k === 'num' && isNaN(parseFloat(a))) { this.rErr.set('Enter a number, for example 500'); return; }
    this.d().rules.push({ id: nextRuleId(), ...this.rf, a }); this.rf.a = ''; this.rErr.set(''); this.s.bump(); this.s.toast('Rule added');
  }
  removeRule(r: Rule) { const D = this.d(); D.rules = D.rules.filter((x) => x !== r); this.s.bump(); }
  addDrill() {
    this.d().drill = [...this.d().drill.filter((x) => x.col !== this.dr.col), { ...this.dr }];
    this.s.toast(`${this.label(this.dr.col)} now opens ${this.s.tpl(this.dr.target).title}`);
    this.dr = { col: this.drillCols()[0] || '', target: '' }; this.s.bump();
  }
  /** RB-A6: two text columns as one, for example patient name and ID. */
  addJoin() {
    const D = this.d(); const n = this.j.name.trim();
    if (!n) { this.jErr.set('Enter a name.'); return; }
    if ([...D.cols.map((id) => this.label(id)), ...CAT.map((c) => c.label)].some((l) => l.toLowerCase() === n.toLowerCase())) { this.jErr.set('A column with this name already exists.'); return; }
    if (this.j.a === this.j.b) { this.jErr.set('Choose two different columns.'); return; }
    const kc: CalcCol = { id: 'k' + Date.now(), label: n, type: 'calc', op: 'join', a: { kind: 'col', v: this.j.a }, b: { kind: 'col', v: this.j.b }, sep: this.j.sep, kfmt: 'num', dp: 0, sum: ['count'] };
    D.calcs.push(kc); D.cols.push(kc.id); this.jErr.set(''); this.s.bump(); this.s.toast(n + ' added');
  }
  toggleScopeVal(v: string) { this.scopeVals.update((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v])); }
  addScope(col: string) { if (this.scopeVals().length) this.d().scope.push({ id: nextFilterId(), col, op: 'in', vals: this.scopeVals(), fixed: true }); this.pop.set(null); this.s.bump(); }

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
