import { Component, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { ReportApiService } from '../services/report-api.service';
import { PublicationDto, ReportModule, ReportScheduleDto } from '../models/report.models';
import { getAllLastRuns } from './run-history';

/**
 * Published reports, found inside the module they belong to (PRD 6.11).
 * Live reports re-run when opened; snapshots open their stored result. Removal is reversible and audited.
 */
@Component({
  selector: 'app-reports-list',
  imports: [FormsModule, DatePipe, MatIconModule, MatTooltipModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <div class="fx-page">
      <div class="fx-filterbar">
        <label class="fx-ctx-field plain">
          <span>Module</span>
          <select [ngModel]="moduleId()" (ngModelChange)="moduleId.set($event)">
            <option [ngValue]="null">All modules</option>
            @for (m of modules(); track m.moduleId) { <option [ngValue]="m.moduleId">{{ m.moduleName }} ({{ countFor(m.moduleId) }})</option> }
          </select>
        </label>
        <div class="fx-search wide">
          <mat-icon>search</mat-icon>
          <input placeholder="Search reports" [ngModel]="search()" (ngModelChange)="search.set($event)" aria-label="Search reports" />
        </div>
        <span class="spacer"></span>
        <label class="fx-check inline"><input type="checkbox" [checked]="showRemoved()" (change)="showRemoved.set(!showRemoved())" /> Show removed</label>
        <span class="fx-hint">{{ rows().length }} {{ showRemoved() ? 'removed' : 'published' }}</span>
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
                <th>Type</th>
                <th>Description</th>
                <th>{{ showRemoved() ? 'Removed' : 'Last run by you' }}</th>
                @if (!showRemoved()) { <th>Schedule</th> }
                <th class="actions"></th>
              </tr>
            </thead>
            <tbody>
              @for (p of rows(); track p.publicationId) {
                <tr [class.fx-row-link]="!p.removed" (click)="!p.removed && open(p)">
                  <td class="strong">{{ p.reportName }}@if (p.label) { <div class="fx-sub-cell">{{ p.label }}</div> }</td>
                  <td>{{ moduleName(p.moduleId) }}</td>
                  <td>
                    @if (p.type === 'live') {
                      <span class="fx-status ok" matTooltip="Re-runs with current data each time it's opened"><mat-icon class="tiny">sync</mat-icon>Live</span>
                    } @else {
                      <span class="fx-status snap" matTooltip="Stored result, never re-run"><mat-icon class="tiny">photo_camera</mat-icon>Snapshot</span>
                      <div class="fx-sub-cell">Run {{ p.snapshot?.runAt | date: 'dd MMM yyyy HH:mm' }}</div>
                    }
                  </td>
                  <td class="muted">{{ p.description }}</td>
                  @if (showRemoved()) {
                    <td>{{ p.removedAt | date: 'dd MMM yyyy HH:mm' }} <div class="fx-sub-cell">by {{ p.removedBy }}</div></td>
                  } @else {
                    <td>{{ p.type === 'live' && lastRun(p.reportId) ? (lastRun(p.reportId) | date: 'dd MMM yyyy HH:mm') : '—' }}</td>
                    <td>
                      @if (p.type === 'live' && scheduleOf(p.reportId); as s) {
                        <span class="fx-status" [class.ok]="s.active" [class.off]="!s.active">
                          <mat-icon class="tiny">event_repeat</mat-icon>{{ s.frequency }} {{ s.time }}{{ s.active ? '' : ' · Paused' }}
                        </span>
                      }
                    </td>
                  }
                  <td class="actions">
                    @if (p.removed) {
                      <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="$event.stopPropagation(); restore(p)"><mat-icon>restore</mat-icon>Restore</button>
                    } @else {
                      <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="$event.stopPropagation(); open(p)"><mat-icon>play_arrow</mat-icon>Open</button>
                      <button class="fx-icon-btn sm danger" (click)="$event.stopPropagation(); remove(p)" matTooltip="Remove from the module list (can be undone)"><mat-icon>remove_circle_outline</mat-icon></button>
                    }
                  </td>
                </tr>
              }
              @if (rows().length === 0) {
                <tr><td [attr.colspan]="showRemoved() ? 6 : 7" class="fx-grid-empty">
                  {{ showRemoved() ? 'Nothing has been removed.' : search() || moduleId() ? 'No reports match these filters.' : 'No reports have been published to your modules yet.' }}
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
  publications = signal<PublicationDto[]>([]);
  modules = signal<ReportModule[]>([]);
  schedules = signal<ReportScheduleDto[]>([]);
  loading = signal(true);
  search = signal('');
  moduleId = signal<number | null>(null);
  showRemoved = signal(false);
  private lastRuns = getAllLastRuns();

  /** Recently run first (the same few reports get rerun daily), then alphabetical. */
  rows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const mod = this.moduleId();
    return this.publications()
      .filter((p) => !!p.removed === this.showRemoved())
      .filter((p) => (!mod || p.moduleId === mod) && (!q || p.reportName.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.label || '').toLowerCase().includes(q)))
      .sort((a, b) => {
        const la = this.lastRuns[a.reportId]?.at || '';
        const lb = this.lastRuns[b.reportId]?.at || '';
        return lb.localeCompare(la) || a.reportName.localeCompare(b.reportName) || (b.publishedAt || '').localeCompare(a.publishedAt || '');
      });
  });

  constructor(private api: ReportApiService, private router: Router, private snack: MatSnackBar) {
    forkJoin({ pubs: api.getPublications(), modules: api.getModules(), schedules: api.getSchedules() }).subscribe({
      next: ({ pubs, modules, schedules }) => {
        this.publications.set(pubs);
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

  countFor(id: number) {
    return this.publications().filter((p) => !p.removed && p.moduleId === id).length;
  }

  lastRun(id: string) {
    return this.lastRuns[id]?.at;
  }

  scheduleOf(id: string) {
    return this.schedules().find((s) => s.reportId === id);
  }

  open(p: PublicationDto) {
    this.router.navigate(['/reports', p.reportId], { queryParams: { pub: p.publicationId } });
  }

  private replace(p: PublicationDto) {
    this.publications.update((list) => list.map((x) => (x.publicationId === p.publicationId ? p : x)));
  }

  /** Reversible, with an audit record — so no confirm; Undo is offered instead. */
  remove(p: PublicationDto) {
    this.api.removePublication(p.publicationId).subscribe((u) => {
      this.replace(u);
      this.snack.open(`Removed "${p.reportName}" from ${this.moduleName(p.moduleId)}`, 'Undo', { duration: 6000 })
        .onAction().subscribe(() => this.restore(u));
    });
  }

  restore(p: PublicationDto) {
    this.api.restorePublication(p.publicationId).subscribe((u) => this.replace(u));
  }
}
