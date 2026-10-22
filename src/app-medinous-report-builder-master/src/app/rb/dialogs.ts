import { Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { RbStore, Schedule } from './store';
import { MyReport, PRESETS, Period, fdate, resolveRange } from './engine';
import { MORE, QUICK, iso } from './staff';
import { RbDialog } from './ui';

const dmy = (s?: string) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
/** Accepts 7/9/2026, 07-09-2026 or 07.09.2026 (day first, as written in the GCC). */
const parseDmy = (s: string) => {
  const m = String(s).trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]); return d.getMonth() === +m[2] - 1 ? iso(d) : null;
};

/**
 * Period picker used everywhere staff choose dates. A preset shows the dates it covers as text;
 * "Custom dates" shows day/month/year fields, each with a calendar button.
 */
@Component({
  selector: 'rb-period',
  imports: [FormsModule, MatIconModule],
  template: `
    <select class="rb-sel rb-psel" [ngModel]="value().preset" (ngModelChange)="pick($event)" aria-label="Period">
      @for (k of keys; track k) { <option [value]="k">{{ presets[k] }}</option> }
      <option value="custom">Custom dates</option>
    </select>
    @if (value().preset === 'custom') {
      @for (k of ['a', 'b']; track k) {
        @if (k === 'b') { <span class="muted">to</span> }
        <span class="rb-dfield" [class.bad]="errKey() === k">
          <input class="rb-inp rb-dtxt" [value]="txt(k)" (change)="typed(k, $any($event.target).value)" placeholder="dd/mm/yyyy" inputmode="numeric"
                 [attr.aria-label]="(k === 'a' ? 'From' : 'To') + ' date, day month year'" [attr.aria-invalid]="errKey() === k" />
          <button type="button" class="fx-icon-btn sm" (click)="cal(hid)" [attr.aria-label]="'Pick ' + (k === 'a' ? 'from' : 'to') + ' date'"><mat-icon>calendar_month</mat-icon></button>
          <input #hid type="date" class="rb-dhid" [value]="k === 'a' ? from() : to()" (change)="setIso(k, $any($event.target).value)" tabindex="-1" aria-hidden="true" />
        </span>
      }
      @if (err()) { <span class="rb-ferr inline" role="alert">{{ err() }}</span> }
    } @else if (resolved()) {
      <span class="muted tiny rb-presolved">{{ resolved() }}</span>
    }`,
  host: { class: 'rb-period' },
})
export class RbPeriod {
  value = input.required<Period>();
  changed = output<Period>();
  presets = PRESETS; keys = [...QUICK, ...MORE];
  err = signal(''); errKey = signal(''); private draft: Record<string, string> = {};
  private r = computed(() => resolveRange(this.value()));
  from = computed(() => (this.r()?.from ? iso(this.r()!.from!) : this.value().a || ''));
  to = computed(() => (this.r()?.to ? iso(this.r()!.to!) : this.value().b || ''));
  resolved = computed(() => {
    const r = this.r(); if (!r || !r.from || !r.to) return '';
    const span = +r.from === +r.to ? fdate(r.from) : `${fdate(r.from)} to ${fdate(r.to)}`;
    return span + (r.kind === 'roll' ? ', includes today' : r.kind === 'cal' ? ', to date' : '');
  });
  txt(k: string) { return this.draft[k] ?? dmy(k === 'a' ? this.from() : this.to()); }
  pick(k: string) {
    this.err.set(''); this.errKey.set(''); this.draft = {};
    this.changed.emit(k === 'custom' ? { preset: 'custom', a: this.from() || iso(new Date()), b: this.to() || iso(new Date()) } : { preset: k });
  }
  typed(k: string, v: string) {
    const d = parseDmy(v);
    if (v.trim() && !d) { this.draft[k] = v; this.errKey.set(k); this.err.set(`${k === 'a' ? 'From' : 'To'} date: enter it as day/month/year, for example 07/09/2026`); return; }
    delete this.draft[k]; this.err.set(''); this.errKey.set('');
    this.setIso(k, d || '');
  }
  setIso(k: string, v: string) { this.changed.emit({ preset: 'custom', a: k === 'a' ? v : this.from(), b: k === 'b' ? v : this.to() }); }
  cal(el: HTMLInputElement) { try { el.showPicker(); } catch { el.click(); } }
}

/** Create or change a schedule. A schedule always runs a saved report with its saved settings. */
@Component({
  selector: 'rb-schedule',
  imports: [FormsModule, RbDialog],
  template: `
    <rb-dialog [title]="(existing() ? 'Change schedule: ' : 'Schedule: ') + report().name" (closed)="closed.emit()">
      <p class="muted tiny">Runs with the report's saved period, filters and grouping. {{ presets[report().period.preset] || 'The period' }} stays relative to each run. It runs with your permissions at the time it runs.</p>
      <div class="rb-frm">
        <label>How often<select class="rb-sel" [(ngModel)]="f.freq">@for (o of freqs; track o) { <option>{{ o }}</option> }</select></label>
        <label>Time<input class="rb-inp" type="time" [(ngModel)]="f.time" /></label>
        <label>Format<select class="rb-sel" [(ngModel)]="f.fmt"><option>Excel</option><option>PDF</option><option>CSV</option></select></label>
      </div>
      <div class="rb-flab">Deliver to</div>
      <label class="rb-mrow"><input type="checkbox" checked disabled /><div><b>My reports list</b><div class="muted tiny">Always</div></div></label>
      <label class="rb-mrow"><input type="checkbox" [(ngModel)]="f.app" /><div><b>In-app notification</b></div></label>
      <label class="rb-mrow"><input type="checkbox" [(ngModel)]="f.email" /><div><b>Email</b><div class="muted tiny">A link to the result. Opening it needs a login</div></div></label>
      <ng-container foot>
        <button class="fx-btn fx-btn-secondary" (click)="closed.emit()">Cancel</button>
        <button class="fx-btn fx-btn-primary" (click)="save()">{{ existing() ? 'Save schedule' : 'Create schedule' }}</button>
      </ng-container>
    </rb-dialog>`,
})
export class ScheduleDialog {
  report = input.required<MyReport>();
  existing = input<Schedule | null>(null);
  closed = output();
  presets = PRESETS;
  freqs = ['Every day', 'Working days (Sun to Thu)', 'Every Sunday', 'First day of the month'];
  f = { freq: 'Working days (Sun to Thu)', time: '07:30', fmt: 'Excel', app: true, email: false };
  constructor(private s: RbStore) {
    setTimeout(() => {
      const x = this.existing();
      if (x) this.f = { freq: x.freq, time: x.time, fmt: x.fmt, app: x.deliver.includes('In-app notification'), email: x.deliver.includes('Email link') };
    });
  }
  save() {
    const deliver = ['Dashboard']; if (this.f.app) deliver.push('In-app notification'); if (this.f.email) deliver.push('Email link');
    const o = { src: this.report().id, freq: this.f.freq, time: this.f.time, fmt: this.f.fmt, deliver, on: true };
    const x = this.existing();
    if (x) { Object.assign(x, o); this.s.bump(); } else this.s.addSchedule(o);
    this.closed.emit();
    this.s.toast(x ? 'Schedule updated' : 'Scheduled. It appears under Scheduled in your reports list');
  }
}
