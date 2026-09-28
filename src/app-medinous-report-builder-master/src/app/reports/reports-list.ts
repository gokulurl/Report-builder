import { Component, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin } from 'rxjs';
import { ReportApiService } from '../services/report-api.service';
import { ReportModule, ReportScheduleDto, SavedReportDto } from '../models/report.models';
import { getAllLastRuns } from './run-history';

/** Full-page list of the reports this user can run. Opening one goes to its run page. */
@Component({
  selector: 'app-reports-list',
  imports: [FormsModule, DatePipe, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="fx-page">
      <div class="fx-filterbar">
        <div class="fx-search wide">
          <mat-icon>search</mat-icon>
          <input placeholder="Search reports" [ngModel]="search()" (ngModelChange)="search.set($event)" aria-label="Search reports" />
        </div>
        <label class="fx-ctx-field plain">
          <span>Module</span>
          <select [ngModel]="moduleId()" (ngModelChange)="moduleId.set($event)">
            <option [ngValue]="null">All modules</option>
            @for (m of modules(); track m.moduleId) { <option [ngValue]="m.moduleId">{{ m.moduleName }}</option> }
          </select>
        </label>
        <span class="spacer"></span>
        <span class="fx-hint">{{ rows().length }} of {{ reports().length }} reports</span>
      </div>

      <div class="fx-lib">
        @if (loading()) {
          <div class="fx-loading"><mat-spinner diameter="28"></mat-spinner> Loading reports…</div>
        } @else {
          <table class="fx-grid">
            <thead>
              <tr>
                <th>Report</th>
                <th>Module</th>
                <th>Description</th>
                <th>Last run by you</th>
                <th>Schedule</th>
                <th class="actions"></th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.reportId) {
                <tr class="fx-row-link" (click)="open(r.reportId)">
                  <td class="strong">{{ r.name }}</td>
                  <td>{{ moduleName(r.moduleId) }}</td>
                  <td class="muted">{{ r.description }}</td>
                  <td>{{ lastRun(r.reportId) ? (lastRun(r.reportId) | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
                  <td>
                    @if (scheduleOf(r.reportId); as s) {
                      <span class="fx-status" [class.ok]="s.active" [class.off]="!s.active">
                        <mat-icon class="tiny">event_repeat</mat-icon>{{ s.frequency }} {{ s.time }}{{ s.active ? '' : ' · Paused' }}
                      </span>
                    }
                  </td>
                  <td class="actions">
                    <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="$event.stopPropagation(); open(r.reportId)">
                      <mat-icon>play_arrow</mat-icon>Open
                    </button>
                  </td>
                </tr>
              }
              @if (rows().length === 0) {
                <tr><td colspan="6" class="fx-grid-empty">
                  {{ search() || moduleId() ? 'No reports match these filters.' : 'No reports have been shared with you yet.' }}
                </td></tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export class ReportsList {
  reports = signal<SavedReportDto[]>([]);
  modules = signal<ReportModule[]>([]);
  schedules = signal<ReportScheduleDto[]>([]);
  loading = signal(true);
  search = signal('');
  moduleId = signal<number | null>(null);
  private lastRuns = getAllLastRuns();

  /** Recently run first (the same few reports get rerun daily), then alphabetical. */
  rows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const mod = this.moduleId();
    return this.reports()
      .filter((r) => (!mod || r.moduleId === mod) && (!q || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)))
      .sort((a, b) => {
        const la = this.lastRuns[a.reportId]?.at || '';
        const lb = this.lastRuns[b.reportId]?.at || '';
        return lb.localeCompare(la) || a.name.localeCompare(b.name);
      });
  });

  constructor(private api: ReportApiService, private router: Router) {
    forkJoin({ reports: api.getSavedReports(), modules: api.getModules(), schedules: api.getSchedules() }).subscribe({
      next: ({ reports, modules, schedules }) => {
        this.reports.set(reports);
        this.modules.set(modules);
        this.schedules.set(schedules);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  moduleName(id: number) {
    return this.modules().find((m) => m.moduleId === id)?.moduleName || '';
  }

  lastRun(id: string) {
    return this.lastRuns[id]?.at;
  }

  scheduleOf(id: string) {
    return this.schedules().find((s) => s.reportId === id);
  }

  open(id: string) {
    this.router.navigate(['/reports', id]);
  }
}
