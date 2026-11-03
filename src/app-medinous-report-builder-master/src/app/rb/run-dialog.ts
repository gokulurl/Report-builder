import { Component, computed, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Clause, MyReport, Period, Template, colOf, distinct, periodErr } from './engine';
import { clauseErr, fromConds, isAmount, isLockSum } from './staff';
import { RbStore } from './store';
import { RbDialog } from './ui';
import { RbPeriod } from './dialogs';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Run from the list: check the values, then view on screen or download. */
@Component({
  selector: 'rb-run',
  imports: [FormsModule, MatIconModule, RbDialog, RbPeriod],
  template: `
    <rb-dialog [title]="'Run ' + name()" [width]="640" (closed)="closed.emit()">
      <p class="muted tiny">Check the values, then choose how you want the report. Large reports are prepared in the background and you are notified when the file is ready.</p>
      @if (!lock()) {
        <section class="rb-rsec"><div class="rb-rlab"><mat-icon>view_agenda</mat-icon>Show as</div>
          <div class="rb-vseg" role="radiogroup" aria-label="Show as">
            <button role="radio" class="rb-vopt" [class.on]="view() === 'detail'" [attr.aria-checked]="view() === 'detail'" (click)="view.set('detail')"><mat-icon>list_alt</mat-icon><span><b>Detailed report</b><small>Every line</small></span></button>
            <button role="radio" class="rb-vopt" [class.on]="view() === 'summary'" [attr.aria-checked]="view() === 'summary'" (click)="view.set('summary')"><mat-icon>table_rows</mat-icon><span><b>Summary report</b><small>One row per {{ perWhat() }}</small></span></button>
          </div>
        </section>
      }
      <section class="rb-rsec"><div class="rb-rlab"><mat-icon>event</mat-icon>Period</div>
        <rb-period [value]="period()" (changed)="period.set($event)" />
      </section>
      <section class="rb-rsec"><div class="rb-rlab"><mat-icon>filter_alt</mat-icon>Filters</div>
        @for (c of clauses(); track c.id) {
          <div class="rb-rfrow"><b>{{ label(c.field) }}@if (c.exclude) { <span class="muted tiny"> (everything except)</span> }</b>
            @if (amount(c.field)) {
              <span class="rb-prow">
                <input class="rb-inp rb-nin" [(ngModel)]="c.from" inputmode="decimal" placeholder="from" [attr.aria-label]="label(c.field) + ' from'" />
                <span class="muted tiny">to</span>
                <input class="rb-inp rb-nin" [(ngModel)]="c.to" inputmode="decimal" placeholder="to" [attr.aria-label]="label(c.field) + ' to'" />
              </span>
            } @else {
              @let vals = values(c.field);
              <div class="rb-rchips" role="group" [attr.aria-label]="label(c.field) + ' values'">
                @for (v of vals.slice(0, 12); track v[0]) {
                  <button class="rb-rchip" [class.on]="c.vals.includes(v[0])" [attr.aria-pressed]="c.vals.includes(v[0])" (click)="toggle(c, v[0])">@if (c.vals.includes(v[0])) { <mat-icon>check</mat-icon> }{{ v[0] }} <span class="muted">{{ v[1] }}</span></button>
                }
                @if (vals.length > 12) { <span class="muted tiny">{{ vals.length - 12 }} more in View/Edit</span> }
              </div>
            }
          </div>
        } @empty { <p class="muted tiny">No filters. Every line in the period is included. To add filters, use View/Edit.</p> }
      </section>
      @if (own()) { <label class="fx-check inline rb-rkeep"><input type="checkbox" [(ngModel)]="keep" />Keep these values for next time</label> }
      @if (err()) { <div class="rb-ferr" role="alert">{{ err() }}</div> }
      <ng-container foot>
        <div class="rb-rbtns">
          <button class="fx-btn fx-btn-secondary" (click)="closed.emit()">Cancel</button>
          <button class="fx-btn fx-btn-secondary" (click)="viewOnScreen()"><mat-icon>open_in_new</mat-icon>View on screen</button>
          <span class="rb-rdl"><span class="muted tiny">Download</span>
            @for (f of downloads; track f[0]) { <button class="fx-btn fx-btn-primary" (click)="download(f[0])"><mat-icon>{{ f[1] }}</mat-icon>{{ f[2] }}</button> }
          </span>
        </div>
      </ng-container>
    </rb-dialog>`,
})
export class RunDialog {
  report = input<MyReport | null>(null);
  tplId = input<string>('');
  closed = output();
  downloads: [string, string, string][] = [['pdf', 'picture_as_pdf', 'PDF'], ['xlsx', 'grid_on', 'Excel'], ['csv', 'description', 'CSV']];

  tpl = computed<Template>(() => this.s.tpl(this.report()?.tid || this.tplId()));
  name = computed(() => this.report()?.name || this.tpl().title);
  own = computed(() => this.report()?.owner === 'me');
  lock = computed(() => isLockSum(this.tpl()));
  groups = computed(() => { const r = this.report(); return r?.groups?.length ? r.groups : this.tpl().groups; });
  perWhat = computed(() => (this.groups()[0] ? colOf(this.groups()[0]).label : 'day').toLowerCase());

  period = signal<Period>({ preset: 'last30' });
  view = signal<'detail' | 'summary'>('detail');
  clauses = signal<Clause[]>([]);
  keep = false;
  err = signal('');

  constructor(public s: RbStore, private router: Router) {
    setTimeout(() => {
      const r = this.report(), t = this.tpl();
      this.period.set(clone(r ? r.period : this.s.ds(t).defaultPeriod));
      this.view.set(this.lock() ? 'summary' : r?.view || 'detail');
      this.clauses.set(r ? (r.clauses ? clone(r.clauses) : fromConds(r.conds || [])) : []);
    });
  }

  label(f: string) { return colOf(f).label; }
  amount(f: string) { return isAmount(f); }
  values(f: string) { return distinct(f).filter((v) => v[0] !== '' && v[0] !== 'undefined'); }
  toggle(c: Clause, v: string) { c.vals = c.vals.includes(v) ? c.vals.filter((x) => x !== v) : [...c.vals, v]; this.clauses.update((x) => [...x]); }

  private check() {
    const pe = periodErr(this.period()); const bad = this.clauses().map(clauseErr).filter(Boolean);
    this.err.set(pe || (bad.length ? 'A filter needs attention: ' + bad[0] : ''));
    return !this.err();
  }
  private sumGroups(groups: string[]) { return groups.length ? groups.slice(0, 2) : this.groups().length ? this.groups().slice(0, 2) : ['dday']; }
  /** Keep these values: saved on the report itself. */
  private persist() {
    const r = this.report(); if (!this.own() || !this.keep || !r) return;
    r.period = clone(this.period()); r.clauses = clone(this.clauses()); r.conds = []; r.view = this.view();
    if (this.view() === 'summary' && !(r.groups || []).length) r.groups = this.sumGroups([]);
    r.modified = new Date();
    const d = this.s.docs['rep:' + r.id]; if (d) delete this.s.docs['rep:' + r.id];
    this.s.bump();
  }
  viewOnScreen() {
    if (!this.check()) return; this.persist();
    const r = this.report(); const kind = r ? 'rep' : 'tpl'; const id = r ? r.id : this.tplId();
    const d = this.s.doc(kind, id);
    d.period = clone(this.period()); d.clauses = clone(this.clauses()); d.view = this.view();
    if (this.view() === 'summary' && !d.groups.length) d.groups = this.sumGroups(d.groups);
    this.closed.emit();
    this.router.navigate(['/report', kind, id], { queryParams: { run: 1 } });
  }
  download(ext: string) {
    if (!this.check()) return; this.persist();
    const t = this.tpl(); const name = this.name() + (this.view() === 'summary' && !this.lock() ? ' (summary)' : '');
    const r = this.report(); if (r) r.lastRun = new Date();
    this.closed.emit();
    if (t.heavy) {
      this.s.toast(`${name} is being prepared in the background. You will be notified when the ${ext.toUpperCase()} is ready`);
      setTimeout(() => { this.s.notes.unshift({ id: Date.now(), text: `${name} (${ext.toUpperCase()}) is ready to download`, key: r ? 'rep:' + r.id : 'tpl:' + t.id, at: new Date(), read: false, email: false }); this.s.bump(); }, 6000);
    } else this.s.toast(`Downloaded ${name}.${ext}`);
    this.s.bump();
  }
}
