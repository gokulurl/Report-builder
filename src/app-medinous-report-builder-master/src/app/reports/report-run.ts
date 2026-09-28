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
import { forkJoin, Subscription } from 'rxjs';
import { ReportApiService } from '../services/report-api.service';
import { ExportService } from '../services/export.service';
import { NotificationService } from '../services/notification.service';
import {
  PreviewResponse,
  ReportConfigurationDto,
  ReportModule,
  ReportParameterDto,
  ReportScheduleDto,
  SavedReportDetailDto,
} from '../models/report.models';
import { CHART_COLORS, cellStyle, columnMeta, computeTotals, displayDate, formatValue } from '../shared/report-format';
import { getLastRun, saveLastRun } from './run-history';
import { ScheduleEditor, ScheduleEditorData } from './schedule-editor';

/** One input on the run form. Two Date parameters in a row become a single From–To range. */
type Control =
  | { kind: 'range'; from: ReportParameterDto; to: ReportParameterDto }
  | { kind: 'date' | 'text' | 'number' | 'bool'; param: ReportParameterDto }
  | { kind: 'list'; param: ReportParameterDto };

const PRESETS = ['Today', 'Yesterday', 'Last 7 days', 'This month', 'Last month'] as const;
const BACKGROUND_AFTER_MS = 3000;
const HOSPITAL = 'Medinous QA Clinic';

@Component({
  selector: 'app-report-run',
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, MatProgressSpinnerModule, MatDialogModule, BaseChartDirective],
  templateUrl: './report-run.html',
})
export class ReportRun implements OnDestroy {
  readonly PRESETS = PRESETS;

  report = signal<SavedReportDetailDto | null>(null);
  modules = signal<ReportModule[]>([]);
  schedule = signal<ReportScheduleDto | null>(null);
  notFound = signal(false);

  values = signal<Record<string, any>>({});
  listOptions = signal<Record<string, string[]>>({});
  prefilledFrom = signal<'last' | 'defaults' | 'link'>('defaults');
  submitted = signal(false);

  running = signal(false);
  inBackground = signal(false);
  result = signal<PreviewResponse | null>(null);
  ranWith = signal<{ label: string; value: string }[]>([]);
  error = signal<string | null>(null);

  private runSub?: Subscription;
  private bgTimer: any;
  private subs: Subscription[] = [];

  params = computed(() => this.report()?.configuration.parameters || []);

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

  /** Only genuinely unrunnable input blocks the run: a missing or back-to-front date range. */
  rangeErrors = computed(() => {
    const v = this.values();
    const errs: Record<string, string> = {};
    for (const c of this.controls()) {
      if (c.kind !== 'range') continue;
      const a = v[c.from.paramId], b = v[c.to.paramId];
      if (!a || !b) errs[c.from.paramId] = 'Enter both dates.';
      else if (a > b) errs[c.from.paramId] = 'The From date is after the To date.';
    }
    return errs;
  });

  columns = computed(() => {
    const r = this.result();
    if (!r) return [];
    if (r.data.length) return Object.keys(r.data[0]);
    return this.report()?.configuration.dataConfiguration.selectedFields.map((f) => f.label || '') || [];
  });

  totals = computed(() => {
    const r = this.result(), rep = this.report();
    return r && rep ? computeTotals(r.data, this.columns(), rep.configuration) : null;
  });

  private meta = computed(() => (this.report() ? columnMeta(this.report()!.configuration) : new Map()));

  showChart = computed(() => {
    const c = this.report()?.configuration;
    return !!c && (c.layoutType === 'Chart' || c.layoutType === 'ChartAndTable') && !!c.chartConfig;
  });
  showTable = computed(() => this.report()?.configuration.layoutType !== 'Chart');

  chart = computed<ChartConfiguration | null>(() => {
    const r = this.result(), cc = this.report()?.configuration.chartConfig;
    if (!r || !cc || !r.data.length) return null;
    const labels = r.data.map((row) => String(row[cc.labelField] ?? ''));
    const fields = cc.dataFields.filter((f) => this.columns().includes(f));
    if (!fields.length) return null;
    const type = cc.chartType as ChartType;
    if (type === 'pie' || type === 'doughnut') {
      return {
        type,
        data: { labels, datasets: [{ data: r.data.map((row) => Number(row[fields[0]]) || 0), backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]) }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
      };
    }
    return {
      type,
      data: {
        labels,
        datasets: fields.map((f, i) => ({
          label: f,
          data: r.data.map((row) => Number(row[f]) || 0),
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
    this.subs.push(this.route.paramMap.subscribe((pm) => this.load(pm.get('id')!)));
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
    clearTimeout(this.bgTimer);
    // A background run keeps going after the user leaves; its result arrives as a notification.
    if (this.running() && !this.inBackground()) this.runSub?.unsubscribe();
  }

  private load(id: string) {
    this.reset();
    const linked = (history.state?.params as Record<string, any> | undefined) || undefined;
    const ready = history.state?.result as PreviewResponse | undefined;
    const readyWith = history.state?.ranWith as { label: string; value: string }[] | undefined;
    forkJoin({ detail: this.api.getSavedReport(id), schedules: this.api.getSchedules() }).subscribe({
      next: ({ detail, schedules }) => {
        if (!detail) { this.notFound.set(true); return; }
        this.report.set(detail);
        this.schedule.set(schedules.find((s) => s.reportId === id) || null);
        const last = getLastRun(id);
        const v: Record<string, any> = {};
        for (const p of detail.configuration.parameters || []) v[p.paramId] = p.defaultValue ?? '';
        if (linked) { Object.assign(v, linked); this.prefilledFrom.set('link'); }
        else if (last) { Object.assign(v, last.params); this.prefilledFrom.set('last'); }
        this.values.set(v);
        this.loadLists(detail.configuration.parameters || []);
        // Reports without parameters, or opened from a link/notification, run straight away.
        if (ready) { this.result.set(ready); this.ranWith.set(readyWith || []); return; } // from a "Report ready" notification
        if (!detail.configuration.parameters?.length || linked) this.run();
      },
      error: () => this.notFound.set(true),
    });
  }

  private reset() {
    this.runSub?.unsubscribe();
    clearTimeout(this.bgTimer);
    this.report.set(null);
    this.result.set(null);
    this.error.set(null);
    this.running.set(false);
    this.inBackground.set(false);
    this.submitted.set(false);
    this.notFound.set(false);
  }

  private loadLists(params: ReportParameterDto[]) {
    for (const p of params) {
      if (p.allowedValues?.length) this.listOptions.update((o) => ({ ...o, [p.paramId]: p.allowedValues!.map(String) }));
      else if (p.entityFieldId)
        this.api.getFieldValues(p.entityFieldId).subscribe((vals) => this.listOptions.update((o) => ({ ...o, [p.paramId]: vals })));
    }
  }

  moduleName() {
    return this.modules().find((m) => m.moduleId === this.report()?.moduleId)?.moduleName || '';
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

  private config(): ReportConfigurationDto {
    const base = structuredClone(this.report()!.configuration);
    base.mode = 'preview';
    base.parameters = (base.parameters || []).map((p) => ({ ...p, defaultValue: this.values()[p.paramId] ?? '' }));
    return base;
  }

  run() {
    this.submitted.set(true);
    if (Object.keys(this.rangeErrors()).length || !this.report()) return;
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
    this.runSub = this.api.preview(this.config()).subscribe({
      next: (res) => {
        clearTimeout(this.bgTimer);
        const wasBackground = this.inBackground();
        this.running.set(false);
        this.inBackground.set(false);
        if (res.success) {
          this.result.set(res.data);
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
        this.error.set(err.error?.errors?.[0] || err.error?.message || 'The report could not be run. Try again, or check the parameters.');
      },
    });
  }

  // ---------- results ----------
  format(v: any, col: string) {
    return formatValue(v, this.meta().get(col)?.formatPattern);
  }
  style(v: any, col: string) {
    return cellStyle(v, col, this.report()?.configuration.conditionalFormats);
  }
  isNum(v: any) {
    return typeof v === 'number';
  }

  drillFor(col: string) {
    return this.report()?.configuration.drillThrough?.find((d) => d.sourceColumn === col && d.targetReportId);
  }

  drill(row: Record<string, any>, col: string) {
    const d = this.drillFor(col);
    if (!d) return;
    const params: Record<string, any> = {};
    for (const m of d.parameterMappings) params[m.targetParamId] = row[m.sourceColumn];
    this.router.navigate(['/reports', d.targetReportId], { state: { params } });
  }

  // ---------- exports: parameters print above the table ----------
  private headerLines() {
    const rep = this.report()!;
    return [HOSPITAL, rep.name, ...this.ranWith().map((r) => `${r.label}: ${r.value}`), `Generated ${new Date().toLocaleString('en-GB')}`];
  }

  private rawTotals() {
    const t = this.totals();
    if (!t || this.result()?.truncated) return undefined;
    const out: Record<string, any> = {};
    for (const [k, c] of Object.entries(t)) if (c.value !== null) out[k] = c.value;
    return out;
  }

  exportExcel() {
    const r = this.result();
    if (r) this.exporter.exportExcel(r.data, this.columns(), this.report()!.name, this.rawTotals(), this.headerLines());
  }

  exportCsv() {
    const r = this.result();
    if (r) this.exporter.exportCsv(r.data, this.columns(), this.report()!.name, this.rawTotals(), this.headerLines());
  }

  exportPdf() {
    const cfg = this.config();
    cfg.mode = 'export';
    cfg.title = this.report()!.name;
    this.api.exportFile(cfg, 'pdf').subscribe((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${this.report()!.name}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
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

  editInBuilder() {
    this.router.navigate(['/builder'], { queryParams: { report: this.report()!.reportId } });
  }
}
