import { Component, OnDestroy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';
import { combineLatest, forkJoin, of, Subscription } from 'rxjs';
import { ReportApiService } from '../services/report-api.service';
import { ExportService, ReportExport } from '../services/export.service';
import { NotificationService } from '../services/notification.service';
import {
  ParameterFavourite,
  PreviewResponse,
  PublicationDto,
  ReportConfigurationDto,
  ReportError,
  ReportField,
  ReportModule,
  ReportParameterDto,
  ReportScheduleDto,
  SavedReportDetailDto,
} from '../models/report.models';
import { CHART_COLORS, MAX_CHART_CATEGORIES, columnMeta, computeTotals, displayDate, toReportError } from '../shared/report-format';
import { HOSPITAL, mediumDateTime } from '../shared/hospital-settings';
import { ResultGrid } from '../shared/result-grid';
import { ExportReasonDialog } from '../shared/export-reason-dialog';
import { getLastRun, saveLastRun } from './run-history';
import { ScheduleEditor, ScheduleEditorData } from './schedule-editor';

/** One input on the run form. Two Date parameters in a row become a single From–To range. */
type Control =
  | { kind: 'range'; from: ReportParameterDto; to: ReportParameterDto }
  | { kind: 'date' | 'text' | 'number' | 'bool'; param: ReportParameterDto }
  | { kind: 'list'; param: ReportParameterDto };

const PRESETS = ['Today', 'Yesterday', 'Last 7 days', 'This month', 'Last month'] as const;
const BACKGROUND_AFTER_MS = 3000;
const FAV_KEY = 'report-favourites-v1';

@Component({
  selector: 'app-report-run',
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, MatProgressSpinnerModule, MatDialogModule, BaseChartDirective, ResultGrid],
  templateUrl: './report-run.html',
})
export class ReportRun implements OnDestroy {
  readonly PRESETS = PRESETS;

  report = signal<SavedReportDetailDto | null>(null);
  modules = signal<ReportModule[]>([]);
  schedule = signal<ReportScheduleDto | null>(null);
  /** Opened from a module's report list (PRD 6.11) */
  publication = signal<PublicationDto | null>(null);
  notFound = signal(false);
  noLongerAvailable = signal(false);
  withdrawn = signal<string[]>([]);

  values = signal<Record<string, any>>({});
  listOptions = signal<Record<string, string[]>>({});
  prefilledFrom = signal<'last' | 'defaults' | 'link' | 'favourite'>('defaults');
  submitted = signal(false);

  running = signal(false);
  inBackground = signal(false);
  result = signal<PreviewResponse | null>(null);
  runAt = signal<Date | null>(null);
  ranWith = signal<{ label: string; value: string }[]>([]);
  error = signal<ReportError | null>(null);

  // PRD 6.7 favourites
  favourites = signal<ParameterFavourite[]>([]);
  favOpen = signal(false);
  favName = signal('');
  favEditing = signal<string | null>(null);
  favEditName = signal('');

  private runSub?: Subscription;
  private bgTimer: any;
  private subs: Subscription[] = [];
  /** The report definition used for runs: withdrawn columns removed. */
  private runnable = signal<ReportConfigurationDto | null>(null);

  isSnapshot = computed(() => this.publication()?.type === 'snapshot');
  params = computed(() => (this.isSnapshot() ? [] : this.report()?.configuration.parameters || []));
  config = computed(() => this.runnable() || this.report()?.configuration || null);

  controls = computed<Control[]>(() => {
    const ps = this.params();
    const out: Control[] = [];
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.dataType === 'Date' && ps[i + 1]?.dataType === 'Date') {
        out.push({ kind: 'range', from: p, to: ps[i + 1] });
        i++;
      } else if (p.entityFieldId || p.allowedValues?.length) out.push({ kind: 'list', param: p });
      else if (p.dataType === 'Date') out.push({ kind: 'date', param: p });
      else if (p.dataType === 'Number') out.push({ kind: 'number', param: p });
      else if (p.dataType === 'Boolean') out.push({ kind: 'bool', param: p });
      else out.push({ kind: 'text', param: p });
    }
    return out;
  });

  /**
   * Only genuinely unrunnable input blocks the run (PRD 7): a missing or back-to-front date range, a year outside 1900–2126,
   * or a parameter with no default left empty. "All" on a list is a real choice, not a missing value.
   */
  inputErrors = computed(() => {
    const v = this.values();
    const errs: Record<string, string> = {};
    const maxYear = new Date().getFullYear() + 100;
    const badYear = (d: string) => { const y = Number(String(d).slice(0, 4)); return y < 1900 || y > maxYear; };
    for (const c of this.controls()) {
      if (c.kind === 'range') {
        const a = v[c.from.paramId], b = v[c.to.paramId];
        if (!a || !b) errs[c.from.paramId] = 'Enter both dates.';
        else if (badYear(a) || badYear(b)) errs[c.from.paramId] = `Enter a date between 1900 and ${maxYear}.`;
        else if (a > b) errs[c.from.paramId] = 'The first date must not be later than the second.';
      } else if (c.kind !== 'list' && c.kind !== 'bool') {
        const val = String(v[c.param.paramId] ?? '').trim();
        const hasDefault = c.param.defaultValue !== undefined && c.param.defaultValue !== null && c.param.defaultValue !== '';
        if (!val && !hasDefault) errs[c.param.paramId] = 'Enter a value.';
        else if (c.kind === 'number' && val && !/^-?\d+(\.\d+)?$/.test(val)) errs[c.param.paramId] = 'Enter a number, for example 1234.56';
        else if (c.kind === 'date' && val && badYear(val)) errs[c.param.paramId] = `Enter a date between 1900 and ${maxYear}.`;
      }
    }
    return errs;
  });

  columns = computed(() => {
    const r = this.result();
    if (!r) return [];
    if (r.data.length) return Object.keys(r.data[0]);
    return this.config()?.dataConfiguration.selectedFields.map((f) => f.label || '') || [];
  });

  showChart = computed(() => {
    const c = this.config();
    return !!c && (c.layoutType === 'Chart' || c.layoutType === 'ChartAndTable') && !!c.chartConfig;
  });
  showTable = computed(() => this.config()?.layoutType !== 'Chart');
  chartCapped = computed(() => this.showChart() && (this.result()?.data.length || 0) > MAX_CHART_CATEGORIES);

  chart = computed<ChartConfiguration | null>(() => {
    const r = this.result(), cc = this.config()?.chartConfig;
    if (!r || !cc || !r.data.length) return null;
    const rows = r.data.slice(0, MAX_CHART_CATEGORIES);
    const labels = rows.map((row) => String(row[cc.labelField] ?? ''));
    const fields = cc.dataFields.filter((f) => this.columns().includes(f));
    if (!fields.length) return null;
    const type = cc.chartType as ChartType;
    if (type === 'pie' || type === 'doughnut') {
      return {
        type,
        data: { labels, datasets: [{ data: rows.map((row) => Number(row[fields[0]]) || 0), backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]) }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
      };
    }
    return {
      type,
      data: {
        labels,
        datasets: fields.map((f, i) => ({
          label: f,
          data: rows.map((row) => Number(row[f]) || 0),
          backgroundColor: type === 'line' ? 'transparent' : CHART_COLORS[i % CHART_COLORS.length] + 'cc',
          borderColor: CHART_COLORS[i % CHART_COLORS.length],
          borderWidth: type === 'line' ? 2 : 1,
          tension: 0.3,
        })),
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: fields.length > 1 } } },
    };
  });

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private api: ReportApiService,
    private exporter: ExportService,
    private notes: NotificationService,
    private dialog: MatDialog
  ) {
    this.api.getModules().subscribe((m) => this.modules.set(m));
    this.subs.push(combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(([pm, q]) => this.load(pm.get('id')!, q.get('pub'))));
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
    clearTimeout(this.bgTimer);
    // A background run keeps going after the user leaves; its result arrives as a notification.
    if (this.running() && !this.inBackground()) this.runSub?.unsubscribe();
  }

  private load(id: string, pubId: string | null) {
    this.reset();
    this.drillFrom.set((history.state?.from as string) || null);
    const linked = (history.state?.params as Record<string, any> | undefined) || undefined;
    const ready = history.state?.result as PreviewResponse | undefined;
    const readyWith = history.state?.ranWith as { label: string; value: string }[] | undefined;
    forkJoin({
      detail: this.api.getSavedReport(id),
      schedules: this.api.getSchedules(),
      pubs: pubId ? this.api.getPublications() : of([] as PublicationDto[]),
    }).subscribe({
      next: ({ detail, schedules, pubs }) => {
        const pub = pubId ? pubs.find((p) => p.publicationId === pubId) || null : null;
        // PRD 6.11: a removed published report tells the reader it's gone
        if (pubId && (!pub || pub.removed)) { this.noLongerAvailable.set(true); return; }
        if (!detail) { this.notFound.set(true); return; }
        this.publication.set(pub);
        this.report.set(detail);
        this.favourites.set(this.readFavourites(id));
        this.schedule.set(schedules.find((s) => s.reportId === id) || null);

        // Snapshot: show the stored result with its run time and parameters; never re-run
        if (pub?.type === 'snapshot' && pub.snapshot) {
          this.result.set(pub.snapshot.result);
          this.ranWith.set(pub.snapshot.ranWith);
          this.runAt.set(new Date(pub.snapshot.runAt));
          return;
        }

        // Live report or saved report: readers start from the report's defaults, or their own last run
        const last = getLastRun(id);
        const v: Record<string, any> = {};
        for (const p of detail.configuration.parameters || []) v[p.paramId] = p.defaultValue ?? '';
        if (linked) { Object.assign(v, linked); this.prefilledFrom.set('link'); }
        else if (last) { Object.assign(v, last.params); this.prefilledFrom.set('last'); }
        this.values.set(v);
        this.loadLists(detail.configuration.parameters || []);
        this.checkWithdrawn(detail.configuration, () => {
          if (ready) { this.result.set(ready); this.ranWith.set(readyWith || []); this.runAt.set(new Date()); return; }
          if (!detail.configuration.parameters?.length || linked) this.run();
        });
      },
      error: () => this.notFound.set(true),
    });
  }

  /** PRD 6.11: columns withdrawn from the catalogue are listed, and the report runs without them. */
  private checkWithdrawn(cfg: ReportConfigurationDto, then: () => void) {
    this.api.getFields(cfg.dataConfiguration.primaryEntityId).subscribe({
      next: (fields: ReportField[]) => {
        const known = new Set(fields.map((f) => f.fieldId));
        const missing = cfg.dataConfiguration.selectedFields.filter((f) => !known.has(f.fieldId));
        if (missing.length) {
          const gone = new Set(missing.map((f) => f.fieldId));
          const c = structuredClone(cfg);
          c.dataConfiguration.selectedFields = c.dataConfiguration.selectedFields.filter((f) => !gone.has(f.fieldId));
          if (c.dataConfiguration.filterGroup) c.dataConfiguration.filterGroup.filters = c.dataConfiguration.filterGroup.filters.filter((f) => !gone.has(f.fieldId));
          c.dataConfiguration.sortings = c.dataConfiguration.sortings?.filter((x) => !gone.has(x.fieldId));
          c.dataConfiguration.groupings = c.dataConfiguration.groupings?.filter((x) => !gone.has(x));
          this.runnable.set(c);
          this.withdrawn.set(missing.map((f) => f.label || 'Field ' + f.fieldId));
        }
        then();
      },
      error: () => then(),
    });
  }

  private reset() {
    this.runSub?.unsubscribe();
    clearTimeout(this.bgTimer);
    this.report.set(null);
    this.publication.set(null);
    this.runnable.set(null);
    this.withdrawn.set([]);
    this.result.set(null);
    this.runAt.set(null);
    this.error.set(null);
    this.running.set(false);
    this.inBackground.set(false);
    this.submitted.set(false);
    this.notFound.set(false);
    this.noLongerAvailable.set(false);
    this.favOpen.set(false);
  }

  private loadLists(params: ReportParameterDto[]) {
    for (const p of params) {
      if (p.allowedValues?.length) this.listOptions.update((o) => ({ ...o, [p.paramId]: p.allowedValues!.map(String) }));
      else if (p.entityFieldId)
        this.api.getFieldValues(p.entityFieldId).subscribe((vals) => this.listOptions.update((o) => ({ ...o, [p.paramId]: vals })));
    }
  }

  moduleName() {
    return this.modules().find((m) => m.moduleId === (this.publication()?.moduleId ?? this.report()?.moduleId))?.moduleName || '';
  }

  setValue(id: string, v: any) {
    this.values.update((x) => ({ ...x, [id]: v }));
  }

  // ---------- date presets ----------
  private iso(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  presetRange(p: (typeof PRESETS)[number]): [string, string] {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const day = (n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return d; };
    switch (p) {
      case 'Today': return [this.iso(t), this.iso(t)];
      case 'Yesterday': return [this.iso(day(-1)), this.iso(day(-1))];
      case 'Last 7 days': return [this.iso(day(-6)), this.iso(t)];
      case 'This month': return [this.iso(new Date(t.getFullYear(), t.getMonth(), 1)), this.iso(t)];
      case 'Last month': return [this.iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), this.iso(new Date(t.getFullYear(), t.getMonth(), 0))];
    }
  }

  applyPreset(c: Control, p: (typeof PRESETS)[number]) {
    if (c.kind !== 'range') return;
    const [a, b] = this.presetRange(p);
    this.values.update((x) => ({ ...x, [c.from.paramId]: a, [c.to.paramId]: b }));
  }

  isPreset(c: Control, p: (typeof PRESETS)[number]) {
    if (c.kind !== 'range') return false;
    const [a, b] = this.presetRange(p);
    return this.values()[c.from.paramId] === a && this.values()[c.to.paramId] === b;
  }

  resetToDefaults() {
    const v: Record<string, any> = {};
    for (const p of this.params()) v[p.paramId] = p.defaultValue ?? '';
    this.values.set(v);
    this.prefilledFrom.set('defaults');
  }

  // ---------- favourites (PRD 6.7): belong to the user, not the report ----------
  private readFavourites(reportId: string): ParameterFavourite[] {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{}')[reportId] || []; } catch { return []; }
  }

  private writeFavourites(list: ParameterFavourite[]) {
    this.favourites.set(list);
    try {
      const all = JSON.parse(localStorage.getItem(FAV_KEY) || '{}');
      all[this.report()!.reportId] = list;
      localStorage.setItem(FAV_KEY, JSON.stringify(all));
    } catch {}
  }

  /** A favourite name is unique per user per report. */
  favNameError = computed(() => {
    const n = this.favName().trim();
    if (!n) return '';
    return this.favourites().some((f) => f.name.toLowerCase() === n.toLowerCase()) ? 'You already have a favourite with this name.' : '';
  });

  suggestFavName() {
    return this.summary().filter((s) => s.value !== 'All').map((s) => s.value).join(', ').slice(0, 60);
  }

  saveFavourite() {
    const name = this.favName().trim();
    if (!name || this.favNameError()) return;
    this.writeFavourites([...this.favourites(), { name, values: { ...this.values() } }]);
    this.favName.set('');
  }

  applyFavourite(f: ParameterFavourite) {
    this.values.set({ ...this.values(), ...f.values });
    this.prefilledFrom.set('favourite');
    this.favOpen.set(false);
  }

  startRename(f: ParameterFavourite) {
    this.favEditing.set(f.name);
    this.favEditName.set(f.name);
  }

  renameError = computed(() => {
    const n = this.favEditName().trim(), old = this.favEditing();
    if (!n) return 'Enter a name.';
    return this.favourites().some((f) => f.name !== old && f.name.toLowerCase() === n.toLowerCase()) ? 'You already have a favourite with this name.' : '';
  });

  confirmRename() {
    if (this.renameError()) return;
    const old = this.favEditing();
    this.writeFavourites(this.favourites().map((f) => (f.name === old ? { ...f, name: this.favEditName().trim() } : f)));
    this.favEditing.set(null);
  }

  deleteFavourite(f: ParameterFavourite) {
    this.writeFavourites(this.favourites().filter((x) => x.name !== f.name));
  }

  // ---------- run ----------
  private summary(): { label: string; value: string }[] {
    const v = this.values();
    const show = (x: any) => (x === '' || x == null ? 'All' : displayDate(String(x)));
    return this.controls().map((c) =>
      c.kind === 'range'
        ? { label: this.rangeLabel(c), value: `${show(v[c.from.paramId])} – ${show(v[c.to.paramId])}` }
        : { label: c.param.label || c.param.paramId, value: c.kind === 'bool' && v[c.param.paramId] !== '' ? (String(v[c.param.paramId]) === 'true' ? 'Yes' : 'No') : show(v[c.param.paramId]) }
    );
  }

  rangeLabel(c: Control) {
    if (c.kind !== 'range') return '';
    // "From date" + "To date" → "Date range"; otherwise show both labels.
    const a = c.from.label || c.from.paramId, b = c.to.label || c.to.paramId;
    const rest = a.replace(/^from\s+/i, '');
    return /^from\s/i.test(a) && b.replace(/^to\s+/i, '') === rest ? rest.charAt(0).toUpperCase() + rest.slice(1) + ' range' : `${a} – ${b}`;
  }

  private runConfig(): ReportConfigurationDto {
    const base = structuredClone(this.config()!);
    base.mode = 'preview';
    base.parameters = (base.parameters || []).map((p) => ({ ...p, defaultValue: this.values()[p.paramId] ?? '' }));
    return base;
  }

  run() {
    this.submitted.set(true);
    if (Object.keys(this.inputErrors()).length || !this.report() || this.isSnapshot()) return;
    const rep = this.report()!;
    const params = { ...this.values() };
    const ranWith = this.summary();
    saveLastRun(rep.reportId, params);
    this.runSub?.unsubscribe();
    clearTimeout(this.bgTimer);
    this.running.set(true);
    this.inBackground.set(false);
    this.error.set(null);
    this.bgTimer = setTimeout(() => this.inBackground.set(true), BACKGROUND_AFTER_MS);
    this.runSub = this.api.preview(this.runConfig()).subscribe({
      next: (res) => {
        clearTimeout(this.bgTimer);
        const wasBackground = this.inBackground();
        this.running.set(false);
        this.inBackground.set(false);
        if (res.success) {
          this.result.set(res.data);
          this.runAt.set(new Date());
          this.ranWith.set(ranWith);
          if (wasBackground)
            this.notes.push({
              title: `Report ready: ${rep.name}`,
              detail: `${ranWith.map((r) => r.label + ': ' + r.value).join(' · ')} · ${res.data.totalCount.toLocaleString()} rows`,
              reportId: rep.reportId,
              params,
              result: res.data,
              ranWith,
            });
        }
      },
      error: (err) => {
        clearTimeout(this.bgTimer);
        this.running.set(false);
        this.inBackground.set(false);
        this.error.set(toReportError(err));
      },
    });
  }

  drill(e: { row: Record<string, any>; col: string }) {
    const d = this.config()?.drillThrough?.find((x) => x.sourceColumn === e.col && x.targetReportId);
    if (!d) return;
    const params: Record<string, any> = {};
    for (const m of d.parameterMappings) params[m.targetParamId] = e.row[m.sourceColumn];
    this.router.navigate(['/reports', d.targetReportId], { state: { params, from: this.report()?.name || 'previous report' } });
  }

  /** PRD: after drill-through, the way back names the report the user came from. */
  drillFrom = signal<string | null>(null);
  back() {
    if (this.drillFrom()) history.back();
    else this.router.navigate(['/reports']);
  }

  // ---------- exports (PRD 6.10): complete result, criteria line, restricted-column reason ----------
  restrictedColumns = signal<string[]>([]);

  private criteria() {
    const bits: string[] = [];
    if (this.ranWith().length) bits.push('Parameters: ' + this.ranWith().map((r) => `${r.label} ${r.value}`).join(', '));
    const pub = this.publication();
    if (pub?.type === 'snapshot') bits.push(`Snapshot "${pub.label}"`);
    bits.push(`Run by ${HOSPITAL.userName} on ${mediumDateTime(this.runAt() || new Date())}`);
    return bits.join(' · ');
  }

  private buildExport(): ReportExport {
    const r = this.result()!;
    const meta = columnMeta(this.config()!);
    const formats: Record<string, string | undefined> = {};
    for (const [k, v] of meta) formats[k] = v.formatPattern;
    const fallback = computeTotals(r.data, this.columns(), this.config()!);
    const totals = fallback ? Object.fromEntries(Object.entries(fallback).filter(([, c]) => c.value !== null).map(([k, c]) => [k, c.value])) : null;
    return {
      title: this.publication()?.label ? `${this.report()!.name} - ${this.publication()!.label}` : this.report()!.name,
      columns: this.columns(),
      rows: r.data,
      groups: r.groups,
      grandTotal: r.grandTotal ?? (r.groups?.length ? null : totals),
      formats,
      criteria: this.criteria(),
      conditionalFormats: this.config()!.conditionalFormats,
    };
  }

  exportDisabledReason = computed(() => (!this.result() ? 'Run the report first' : !this.result()!.data.length ? 'There are no rows to export' : ''));

  private withReason(format: string, go: () => void) {
    if (this.exportDisabledReason()) return;
    const cfg = this.config()!;
    this.api.getFields(cfg.dataConfiguration.primaryEntityId).subscribe((fields) => {
      const restricted = new Set(fields.filter((f) => f.isRestricted).map((f) => f.fieldId));
      const cols = cfg.dataConfiguration.selectedFields.filter((f) => restricted.has(f.fieldId)).map((f) => f.label || '');
      if (!cols.length) { go(); return; }
      this.dialog.open(ExportReasonDialog, { width: '460px', data: { columns: cols, format } }).afterClosed().subscribe((reason) => {
        if (!reason) return;
        this.api.auditExport({ reportName: this.report()!.name, format, reason, columns: cols }).subscribe(() => go());
      });
    });
  }

  exportExcel() {
    this.withReason('Excel', () => this.exporter.exportExcelReport(this.buildExport()));
  }

  exportCsv() {
    this.withReason('CSV', () => this.exporter.exportCsvReport(this.buildExport()));
  }

  exportPdf() {
    this.withReason('PDF', () => {
      const cfg = this.runConfig();
      cfg.mode = 'export';
      cfg.title = this.report()!.name;
      this.api.exportFile(cfg, 'pdf').subscribe((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this.report()!.name}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
    });
  }

  // ---------- schedule ----------
  openSchedule() {
    const rep = this.report()!;
    const data: ScheduleEditorData = {
      reportId: rep.reportId, reportName: rep.name, moduleId: rep.moduleId,
      parameters: this.params(), values: this.values(), existing: this.schedule() || undefined,
    };
    this.dialog
      .open(ScheduleEditor, { data, position: { right: '0', top: '0' }, height: '100vh', width: '440px', maxWidth: '100vw', panelClass: 'fx-drawer-panel', autoFocus: 'first-tabbable' })
      .afterClosed()
      .subscribe((s) => s && this.schedule.set(s));
  }

  scheduleText(s: ReportScheduleDto) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const when = s.frequency === 'Weekly' ? `every ${days[s.dayOfWeek ?? 0]}` : s.frequency === 'Monthly' ? `monthly on day ${s.dayOfMonth}` : 'daily';
    return `Scheduled ${when} at ${s.time}${s.active ? '' : ' (paused)'}`;
  }

  /** Live published reports are read-only for readers; only the owner edits in the builder. */
  canEdit = computed(() => !this.publication() && this.report()?.ownerId === 'me');

  editInBuilder() {
    this.router.navigate(['/builder'], { queryParams: { report: this.report()!.reportId } });
  }
}
