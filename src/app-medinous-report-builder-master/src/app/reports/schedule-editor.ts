import { Component, Inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ReportApiService } from '../services/report-api.service';
import {
  ReportParameterDto,
  ReportScheduleDto,
  SaveScheduleRequest,
  SCHEDULE_DATE_RANGES,
  ScheduleFormat,
  ScheduleFrequency,
} from '../models/report.models';
import { displayDate } from '../shared/report-format';

export interface ScheduleEditorData {
  reportId: string;
  reportName: string;
  moduleId: number;
  parameters: ReportParameterDto[];
  /** Current values from the run form (new schedule) — ignored when editing. */
  values: Record<string, any>;
  existing?: ReportScheduleDto;
}

/** Side drawer to create or edit a schedule. Date parameters become a rolling period; others are copied as-is. */
@Component({
  selector: 'app-schedule-editor',
  imports: [FormsModule, MatDialogModule, MatIconModule],
  template: `
    <div class="fx-dialog fx-drawer" role="dialog" aria-modal="true">
      <div class="fx-dialog-head fx-drawer-head">
        {{ data.existing ? 'Edit Schedule' : 'Schedule Report' }}
        <span class="spacer"></span>
        <button class="fx-icon-btn fx-on-blue" mat-dialog-close aria-label="Close"><mat-icon>close</mat-icon></button>
      </div>
      <div class="fx-dialog-body">
        <div class="fx-sched-report"><small>Report</small><b>{{ data.reportName }}</b></div>

        <div class="fx-form-field">
          <span>Repeat</span>
          <div class="fx-seg">
            @for (f of FREQS; track f) {
              <button [class.on]="frequency() === f" (click)="frequency.set(f)">{{ f }}</button>
            }
          </div>
        </div>

        <div class="fx-sched-row">
          @if (frequency() === 'Weekly') {
            <label class="fx-form-field"><span>On</span>
              <select [ngModel]="dayOfWeek()" (ngModelChange)="dayOfWeek.set(+$event)">
                @for (d of DAYS; track $index) { <option [value]="$index">{{ d }}</option> }
              </select>
            </label>
          }
          @if (frequency() === 'Monthly') {
            <label class="fx-form-field"><span>On day</span>
              <select [ngModel]="dayOfMonth()" (ngModelChange)="dayOfMonth.set(+$event)">
                @for (d of MONTH_DAYS; track d) { <option [value]="d">{{ d }}</option> }
              </select>
            </label>
          }
          <label class="fx-form-field"><span>Run at</span>
            <input type="time" [ngModel]="time()" (ngModelChange)="time.set($event)" />
          </label>
        </div>

        @if (dateParams().length) {
          <label class="fx-form-field">
            <span>Date range for each run <i>*</i></span>
            <select [ngModel]="dateRange()" (ngModelChange)="dateRange.set($event)">
              @for (r of RANGES; track r) { <option [value]="r">{{ r }}</option> }
            </select>
            <small class="fx-hint">Scheduled runs use a rolling period, not the dates on the form.</small>
          </label>
        }

        @if (otherParams().length) {
          <div class="fx-form-field">
            <span>Other parameters</span>
            <div class="fx-crit">
              @for (p of otherParams(); track p.paramId) {
                <span>{{ p.label || p.paramId }}: <b>{{ show(values()[p.paramId]) }}</b></span>
              }
            </div>
            @if (!data.existing) { <small class="fx-hint">Copied from the run form. Change them there before scheduling.</small> }
          </div>
        }

        <div class="fx-form-field">
          <span>Deliver to <i>*</i></span>
          <label class="fx-check"><input type="checkbox" [checked]="notify()" (change)="notify.set(!notify())" /> Notification in Medinous</label>
          <label class="fx-check"><input type="checkbox" [checked]="email()" (change)="email.set(!email())" /> Email</label>
          @if (email()) {
            <input type="text" [ngModel]="emails()" (ngModelChange)="emails.set($event); touched.set(true)" placeholder="name@hospital.com, name2@hospital.com" aria-label="Email addresses" />
          }
          @if (error()) { <small class="fx-field-error">{{ error() }}</small> }
        </div>

        <div class="fx-form-field">
          <span>File</span>
          <div class="fx-seg">
            @for (f of FORMATS; track f) {
              <button [class.on]="format() === f" (click)="format.set(f)">{{ f }}</button>
            }
          </div>
        </div>
      </div>
      <div class="fx-dialog-foot">
        <button class="fx-btn fx-btn-primary" (click)="save()" [disabled]="saving()">{{ data.existing ? 'Save Changes' : 'Save Schedule' }}</button>
        <button class="fx-btn fx-btn-secondary" mat-dialog-close>Cancel</button>
      </div>
    </div>
  `,
})
export class ScheduleEditor {
  readonly FREQS: ScheduleFrequency[] = ['Daily', 'Weekly', 'Monthly'];
  readonly FORMATS: ScheduleFormat[] = ['Excel', 'PDF', 'CSV'];
  readonly RANGES = SCHEDULE_DATE_RANGES;
  readonly DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  readonly MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

  frequency = signal<ScheduleFrequency>('Daily');
  time = signal('06:00');
  dayOfWeek = signal(0);
  dayOfMonth = signal(1);
  dateRange = signal<string>('Previous day');
  notify = signal(true);
  email = signal(false);
  emails = signal('');
  format = signal<ScheduleFormat>('Excel');
  values = signal<Record<string, any>>({});
  saving = signal(false);
  touched = signal(false);
  submitted = signal(false);

  dateParams = computed(() => this.data.parameters.filter((p) => p.dataType === 'Date'));
  otherParams = computed(() => this.data.parameters.filter((p) => p.dataType !== 'Date'));

  error = computed(() => {
    if (!this.submitted() && !this.touched()) return '';
    if (!this.notify() && !this.email()) return 'Pick at least one way to deliver the report.';
    if (this.email()) {
      const list = this.emails().split(',').map((e) => e.trim()).filter(Boolean);
      if (!list.length) return 'Enter at least one email address.';
      const bad = list.find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
      if (bad) return `"${bad}" doesn't look like an email address.`;
    }
    return '';
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ScheduleEditorData,
    private ref: MatDialogRef<ScheduleEditor, ReportScheduleDto>,
    private api: ReportApiService
  ) {
    const e = data.existing;
    if (e) {
      this.frequency.set(e.frequency);
      this.time.set(e.time);
      this.dayOfWeek.set(e.dayOfWeek ?? 0);
      this.dayOfMonth.set(e.dayOfMonth ?? 1);
      this.dateRange.set(e.dateRange || 'Previous day');
      this.notify.set(e.deliverNotification);
      this.email.set(e.deliverEmail);
      this.emails.set(e.emails);
      this.format.set(e.format);
      this.values.set(e.parameters || {});
    } else {
      const v: Record<string, any> = {};
      for (const p of this.otherParams()) v[p.paramId] = data.values[p.paramId] ?? '';
      this.values.set(v);
    }
  }

  show(v: any) {
    return v === '' || v == null ? 'All' : displayDate(String(v));
  }

  save() {
    this.submitted.set(true);
    if (this.error()) return;
    const req: SaveScheduleRequest = {
      reportId: this.data.reportId,
      reportName: this.data.reportName,
      moduleId: this.data.moduleId,
      frequency: this.frequency(),
      time: this.time(),
      dayOfWeek: this.frequency() === 'Weekly' ? this.dayOfWeek() : undefined,
      dayOfMonth: this.frequency() === 'Monthly' ? this.dayOfMonth() : undefined,
      dateRange: this.dateParams().length ? this.dateRange() : undefined,
      parameters: this.values(),
      deliverNotification: this.notify(),
      deliverEmail: this.email(),
      emails: this.email() ? this.emails() : '',
      format: this.format(),
      active: this.data.existing ? this.data.existing.active : true,
    };
    this.saving.set(true);
    const call = this.data.existing ? this.api.updateSchedule(this.data.existing.scheduleId, req) : this.api.createSchedule(req);
    call.subscribe({
      next: (s) => this.ref.close(s),
      error: () => this.saving.set(false),
    });
  }
}
