import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RbStore, Schedule } from './store';
import { MyReport, PRESETS, Period, resolveRange } from './engine';
import { MORE, QUICK, iso } from './staff';
import { RbDialog } from './ui';

/** Period picker used everywhere staff choose dates: a preset list plus the dates it resolves to (editing a date makes it custom). */
@Component({
  selector: 'rb-period',
  imports: [FormsModule],
  template: `
    <select class="rb-sel rb-psel" [ngModel]="value().preset" (ngModelChange)="pick($event)" aria-label="Period">
      @for (k of keys; track k) { <option [value]="k">{{ presets[k] }}</option> }
      <option value="custom">Custom dates</option>
    </select>
    <span class="rb-pdr">
      <input type="date" class="rb-inp" [ngModel]="from()" (ngModelChange)="dates($event, null)" aria-label="From date" />
      <span class="muted">to</span>
      <input type="date" class="rb-inp" [ngModel]="to()" (ngModelChange)="dates(null, $event)" aria-label="To date" />
    </span>`,
  host: { class: 'rb-period' },
})
export class RbPeriod {
  value = input.required<Period>();
  changed = output<Period>();
  presets = PRESETS; keys = [...QUICK, ...MORE];
  private r = computed(() => resolveRange(this.value()));
  from = computed(() => (this.r()?.from ? iso(this.r()!.from!) : this.value().a || ''));
  to = computed(() => (this.r()?.to ? iso(this.r()!.to!) : this.value().b || ''));
  pick(k: string) {
    this.changed.emit(k === 'custom' ? { preset: 'custom', a: this.from() || iso(new Date()), b: this.to() || iso(new Date()) } : { preset: k });
  }
  dates(a: string | null, b: string | null) { this.changed.emit({ preset: 'custom', a: a ?? this.from(), b: b ?? this.to() }); }
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
