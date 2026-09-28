import { Component, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { ReportApiService } from '../services/report-api.service';
import { NotificationService } from '../services/notification.service';
import { ReportModule, ReportScheduleDto } from '../models/report.models';
import { ScheduleEditor, ScheduleEditorData } from './schedule-editor';

/** Every schedule the user has set up: pause/resume, edit, run now, delete. */
@Component({
  selector: 'app-my-schedules',
  imports: [DatePipe, MatIconModule, MatTooltipModule, MatProgressSpinnerModule, MatDialogModule, MatSnackBarModule],
  template: `
    <div class="fx-page">
      <div class="fx-filterbar">
        <span class="fx-hint">Scheduled reports run at the set time and are delivered to your notifications and/or email.</span>
        <span class="spacer"></span>
        <button class="fx-btn fx-btn-secondary" (click)="router.navigate(['/reports'])"><mat-icon>add</mat-icon>Schedule a report</button>
      </div>
      <div class="fx-lib">
        @if (loading()) {
          <div class="fx-loading"><mat-spinner diameter="28"></mat-spinner> Loading schedules…</div>
        } @else if (!schedules().length) {
          <div class="fx-empty">
            <mat-icon>event_repeat</mat-icon>
            <p>Set a report to run on its own, daily, weekly or monthly. Open any report and choose <b>Schedule</b>.</p>
            <button class="fx-btn fx-btn-primary" (click)="router.navigate(['/reports'])">Go to Reports</button>
          </div>
        } @else {
          <table class="fx-grid fx-sticky-status">
            <thead>
              <tr>
                <th>Report</th>
                <th>Repeat</th>
                <th>Date range</th>
                <th>Deliver to</th>
                <th>File</th>
                <th>Next run</th>
                <th>Last run</th>
                <th class="status-col">Status</th>
                <th class="actions"></th>
              </tr>
            </thead>
            <tbody>
              @for (s of schedules(); track s.scheduleId) {
                <tr [class.fx-paused]="!s.active">
                  <td class="strong">
                    <button class="fx-cell-link" (click)="router.navigate(['/reports', s.reportId])">{{ s.reportName }}</button>
                    <div class="fx-sub-cell">{{ moduleName(s.moduleId) }}</div>
                  </td>
                  <td>{{ repeatText(s) }}</td>
                  <td>{{ s.dateRange || '—' }}</td>
                  <td class="muted">{{ deliverText(s) }}</td>
                  <td>{{ s.format }}</td>
                  <td>{{ s.active ? (s.nextRun | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
                  <td>
                    @if (s.lastRun) {
                      {{ s.lastRun | date: 'dd/MM/yyyy HH:mm' }}
                      <span class="fx-status" [class.ok]="s.lastStatus === 'Delivered'" [class.bad]="s.lastStatus === 'Failed'">{{ s.lastStatus }}</span>
                    } @else { Not run yet }
                  </td>
                  <td class="status-col">
                    <label class="fx-switch" [matTooltip]="s.active ? 'Pause this schedule' : 'Resume this schedule'">
                      <input type="checkbox" [checked]="s.active" (change)="toggle(s)" [attr.aria-label]="(s.active ? 'Pause ' : 'Resume ') + s.reportName" />
                      <span class="fx-switch-track"></span>
                      <span class="fx-switch-text">{{ s.active ? 'Active' : 'Paused' }}</span>
                    </label>
                  </td>
                  <td class="actions">
                    <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="runNow(s)" [disabled]="busy() === s.scheduleId">Run Now</button>
                    <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="edit(s)">Edit</button>
                    <button class="fx-icon-btn sm danger" (click)="remove(s)" matTooltip="Delete schedule"><mat-icon>delete_outline</mat-icon></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export class MySchedules {
  schedules = signal<ReportScheduleDto[]>([]);
  modules = signal<ReportModule[]>([]);
  loading = signal(true);
  busy = signal<string | null>(null);

  constructor(
    private api: ReportApiService,
    public router: Router,
    private dialog: MatDialog,
    private snack: MatSnackBar,
    private notes: NotificationService
  ) {
    this.refresh();
  }

  private refresh() {
    forkJoin({ schedules: this.api.getSchedules(), modules: this.api.getModules() }).subscribe({
      next: ({ schedules, modules }) => {
        this.schedules.set([...schedules].sort((a, b) => Number(b.active) - Number(a.active) || a.nextRun.localeCompare(b.nextRun)));
        this.modules.set(modules);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  moduleName(id: number) {
    return this.modules().find((m) => m.moduleId === id)?.moduleName || '';
  }

  repeatText(s: ReportScheduleDto) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (s.frequency === 'Weekly') return `Weekly, ${days[s.dayOfWeek ?? 0]} ${s.time}`;
    if (s.frequency === 'Monthly') return `Monthly, day ${s.dayOfMonth} at ${s.time}`;
    return `Daily at ${s.time}`;
  }

  deliverText(s: ReportScheduleDto) {
    return [s.deliverNotification ? 'Notification' : '', s.deliverEmail ? s.emails : ''].filter(Boolean).join(' · ');
  }

  private replace(s: ReportScheduleDto) {
    this.schedules.update((list) => list.map((x) => (x.scheduleId === s.scheduleId ? s : x)));
  }

  toggle(s: ReportScheduleDto) {
    this.api.updateSchedule(s.scheduleId, { active: !s.active }).subscribe((u) => this.replace(u));
  }

  runNow(s: ReportScheduleDto) {
    this.busy.set(s.scheduleId);
    this.api.runScheduleNow(s.scheduleId).subscribe({
      next: (u) => {
        this.busy.set(null);
        this.replace(u);
        this.notes.push({ title: `Report delivered: ${s.reportName}`, detail: `${this.deliverText(s)} · ${s.format} · ${s.dateRange || 'no date range'}`, reportId: s.reportId });
        this.snack.open(`${s.reportName} is running. You'll get it in your notifications.`, '', { duration: 3000 });
      },
      error: () => this.busy.set(null),
    });
  }

  edit(s: ReportScheduleDto) {
    this.api.getSavedReport(s.reportId).subscribe((rep) => {
      const data: ScheduleEditorData = {
        reportId: s.reportId, reportName: s.reportName, moduleId: s.moduleId,
        parameters: rep?.configuration.parameters || [], values: s.parameters, existing: s,
      };
      this.dialog
        .open(ScheduleEditor, { data, position: { right: '0', top: '0' }, height: '100vh', width: '440px', maxWidth: '100vw', panelClass: 'fx-drawer-panel' })
        .afterClosed()
        .subscribe((u) => u && this.replace(u));
    });
  }

  remove(s: ReportScheduleDto) {
    if (!confirm(`Delete the schedule for "${s.reportName}"? It will stop running.`)) return;
    this.api.deleteSchedule(s.scheduleId).subscribe(() => this.schedules.update((l) => l.filter((x) => x.scheduleId !== s.scheduleId)));
  }
}
