import { Component, signal, computed, viewChild, ElementRef, TemplateRef, effect } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { BaseChartDirective } from 'ng2-charts';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChartConfiguration, ChartType } from 'chart.js';

import { ReportApiService } from '../services/report-api.service';
import { ExportService, ReportExport } from '../services/export.service';
import { ResultGrid } from '../shared/result-grid';
import { calcFormat, formatValue, summaryLabel, validateFilterValue, validateParamId, toReportError, displayDate, MAX_CHART_CATEGORIES } from '../shared/report-format';
import { HOSPITAL, mediumDateTime } from '../shared/hospital-settings';
import {
  ReportModule,
  ReportEntity,
  ReportField,
  ReportRelationship,
  SelectedFieldDto,
  RelatedEntityDto,
  FilterDto,
  FilterGroupDto,
  SortingDto,
  ReportConfigurationDto,
  PreviewResponse,
  SavedReportDto,
  ReportParameterDto,
  TopNConfigDto,
  FILTER_OPERATORS,
  AGGREGATION_OPTIONS,
  RELATIVE_DATE_PRESETS,
  FORMAT_OPTIONS,
  ConditionalFormatRule,
  VisualizationConfig,
  LayoutConfig,
  LayoutItem,
  DrillThroughConfig,
  DrillThroughMapping,
  SavedReportDetailDto,
  OPERATORS_BY_TYPE,
  AppUser,
  ReportVersionDto,
  ReportError,
  CalculatedColumnDto,
  CalcOperand,
  CalcOperation,
  CALC_OPERATIONS,
} from '../models/report.models';

interface FieldSelection {
  field: ReportField;
  selected: boolean;
  aggregate: string;
  grouped: boolean;
  formatPattern: string;
  order: number; // position in the report = order the columns were ticked
}

interface FilterRow {
  fieldId: number;
  operator: string;
  value: string;
  /** Second value for Between (PRD 6.4: two inputs, not "a, b") */
  value2?: string;
}

/** PRD 7 limits */
const MAX_FILTERS = 20;
const MAX_SORTS = 5;
const MAX_GROUP_LEVELS = 5;

interface JoinConfig {
  relationship: ReportRelationship;
  joinType: string;
  entity: ReportEntity;
  fields: ReportField[];
  selectedFieldIds: number[];
}

@Component({
  selector: 'app-report-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    DragDropModule,
    BaseChartDirective,
    ResultGrid,
  ],
  templateUrl: './report-builder.html',
  styleUrl: './report-builder.scss',
})
export class ReportBuilder {
  // Fusion shell navigation
  view = signal<'builder' | 'library'>('builder');
  libraryTab = signal<'reports' | 'shared' | 'templates'>('reports');
  librarySearch = signal('');
  libraryModuleId = signal<number | null>(null);
  libraryRows = computed(() => {
    const q = this.librarySearch().trim().toLowerCase();
    const mod = this.libraryModuleId();
    const tab = this.libraryTab();
    const rows = tab === 'templates' ? this.templates() : this.savedReports().filter((r) => (tab === 'shared') === (r.ownerId !== 'me'));
    return rows.filter(
      (r) =>
        (!mod || r.moduleId === mod) &&
        (!q || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
    );
  });

  // Config panel sections: collapsed ones show a one-line summary in their header
  openSections = signal<Set<string>>(new Set(['columns', 'filters']));
  isOpen(key: string) {
    return this.openSections().has(key);
  }
  toggleSection(key: string) {
    this.openSections.update((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }
  fieldSearch = signal('');

  // PRD 6.5 grouping mode and options
  groupingMode = signal<'summary' | 'detail'>('summary');
  showGrandTotal = signal(true);
  groupsStart = signal<'auto' | 'expanded' | 'collapsed'>('auto');
  // PRD 7.2 layout saved with the report
  columnLayout = signal<{ widths?: Record<string, number>; nowrap?: string[]; pinned?: string[] }>({});
  // PRD 7.3 calculated columns
  calcs = signal<CalculatedColumnDto[]>([]);
  calcEditing = signal<number | null>(null); // index being edited, -1 = new
  calcName = signal('');
  calcLeft = signal<string>(''); // 'f:<id>' | 'c:<name>' | 'v'
  calcLeftValue = signal('');
  calcOp = signal<CalcOperation>('add');
  calcRight = signal<string>('');
  calcRightValue = signal('');
  calcDecimals = signal(2);
  calcFormatSel = signal('');
  calcAgg = signal('Sum');
  calcTouched = signal(false);
  readonly CALC_OPERATIONS = CALC_OPERATIONS;
  readonly MAX_CALCS = 5;
  // PRD 6.8: a run keeps its result on screen; later changes mark it out of date instead of re-running
  runAt = signal<Date | null>(null);
  stale = signal(false);
  reportError = signal<ReportError | null>(null);
  showIssues = signal(false);
  // PRD 6.11 withdrawn columns notice, sharing, ownership
  withdrawn = signal<string[]>([]);
  currentOwnerId = signal<string>('me');
  currentOwnerName = signal<string>('');
  isOthersReport = computed(() => !!this.currentReportId() && this.currentOwnerId() !== 'me');
  users = signal<AppUser[]>([]);
  saveDialogShareWith = signal<string[]>([]);
  saveDialogTouched = signal(false);
  versions = signal<ReportVersionDto[]>([]);
  versionsFor = signal('');
  // PRD 6.11 publish
  pubModuleId = signal<number | null>(null);
  pubType = signal<'live' | 'snapshot'>('live');
  pubLabel = signal('');
  pubError = signal('');
  pubBusy = signal(false);
  // PRD 9: request a missing column
  reqText = signal('');
  reqRef = signal('');
  // Restricted-column export reason
  exportReason = signal('');
  exportReasonTouched = signal(false);
  readonly MAX_FILTERS = MAX_FILTERS;
  readonly MAX_SORTS = MAX_SORTS;
  readonly MAX_GROUP_LEVELS = MAX_GROUP_LEVELS;
  readonly HOSPITAL = HOSPITAL;

  modules = signal<ReportModule[]>([]);
  entities = signal<ReportEntity[]>([]);
  fields = signal<ReportField[]>([]);
  relationships = signal<ReportRelationship[]>([]);

  selectedModuleId = signal<number | null>(null);
  selectedEntityId = signal<number | null>(null);

  fieldSelections = signal<FieldSelection[]>([]);
  // Flat field list in catalogue order (the metadata has no categories)
  visibleFields = computed(() => {
    const q = this.fieldSearch().trim().toLowerCase();
    return this.fieldSelections()
      .filter((fs) => !q || fs.field.displayLabel.toLowerCase().includes(q))
      .sort((x, y) => x.field.displayOrder - y.field.displayOrder);
  });

  selectedFields = computed(() => this.fieldSelections().filter((f) => f.selected).sort((a, b) => a.order - b.order));
  private orderSeq = 1;
  filterableFields = computed(() =>
    this.fieldSelections()
      .filter((f) => f.field.isFilterable)
      .map((f) => f.field)
  );
  sortableFields = computed(() =>
    this.selectedFields()
      .filter((f) => f.field.isSortable)
      .map((f) => f.field)
  );

  filters = signal<FilterRow[]>([]);
  filterLogic = signal<'and' | 'or'>('and');
  sortings = signal<SortingDto[]>([]);

  joins = signal<JoinConfig[]>([]);
  availableRelationships = computed(() => {
    const entityId = this.selectedEntityId();
    if (!entityId) return [];
    const usedEntityIds = new Set(this.joins().map((j) => j.entity.entityId));
    return this.relationships().filter((r) => {
      const otherEntityId = r.primaryEntityId === entityId ? r.foreignEntityId : r.primaryEntityId;
      return !usedEntityIds.has(otherEntityId);
    });
  });

  reportTitle = signal('');
  previewResult = signal<PreviewResponse | null>(null);
  previewColumns = signal<string[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  // Layout & visualization
  layoutType = signal<'Table' | 'Chart' | 'ChartAndTable'>('Table');
  orientation = signal<'Portrait' | 'Landscape'>('Portrait');

  currentReportId = signal<string | null>(null);
  currentReportName = signal('');
  savedReports = signal<SavedReportDto[]>([]);
  loadingReports = signal(false);
  saveDialogName = signal('');
  saveDialogDescription = signal('');
  saveDialogIsShared = signal(false);
  saveDialogIsTemplate = signal(false);

  templates = signal<SavedReportDto[]>([]);
  loadingTemplates = signal(false);
  loadDialogTab = signal<'reports' | 'templates'>('reports');
  loadDialogTabIndex = 0;

  parameters = signal<ReportParameterDto[]>([]);
  paramPromptValues = signal<Record<string, any>>({});

  distinctEnabled = signal(false);
  topNEnabled = signal(false);
  topNCount = signal(10);
  topNDirection = signal<'top' | 'bottom'>('top');
  topNFieldId = signal<number | null>(null);
  havingFilters = signal<FilterRow[]>([]);
  havingLogic = signal<'and' | 'or'>('and');
  conditionalFormats = signal<ConditionalFormatRule[]>([]);

  // Dashboard layout
  dashboardEnabled = signal(false);
  dashboardColumns = signal(2);
  dashboardWidgets = signal<VisualizationConfig[]>([]);
  dashboardLayout = signal<LayoutItem[]>([]);

  // Drill-through
  drillThroughConfigs = signal<DrillThroughConfig[]>([]);
  drillThroughStack = signal<{ reportId: string | null; reportName: string; config: ReportConfigurationDto; dirty: boolean }[]>([]);

  hasGroupings = computed(() => this.selectedFields().some((f) => f.grouped));
  aggregatedFields = computed(() =>
    this.selectedFields()
      .filter((f) => f.aggregate)
      .map((f) => f.field)
  );

  chartType = signal<ChartType>('bar');
  chartLabelField = signal<string>('');
  chartDataFields = signal<string[]>([]);

  chartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('chartCanvas');
  saveDialogTpl = viewChild<TemplateRef<any>>('saveDialogTpl');
  loadDialogTpl = viewChild<TemplateRef<any>>('loadDialogTpl');
  paramPromptTpl = viewChild<TemplateRef<any>>('paramPromptTpl');
  publishTpl = viewChild<TemplateRef<any>>('publishTpl');
  versionsTpl = viewChild<TemplateRef<any>>('versionsTpl');
  requestTpl = viewChild<TemplateRef<any>>('requestTpl');
  exportReasonTpl = viewChild<TemplateRef<any>>('exportReasonTpl');
  newReportTpl = viewChild<TemplateRef<any>>('newReportTpl');

  // New Report dialog: module + entity are chosen up front
  newModuleId = signal<number | null>(null);
  newEntityId = signal<number | null>(null);
  newEntities = signal<ReportEntity[]>([]);
  newTemplates = computed(() => this.templates().filter((t) => t.moduleId === this.newModuleId()));

  chartConfig = computed<ChartConfiguration | null>(() => {
    const result = this.previewResult();
    const labelField = this.chartLabelField();
    const dataFields = this.chartDataFields();
    if (!result || !labelField || dataFields.length === 0) return null;

    const rows = result.data.slice(0, MAX_CHART_CATEGORIES);
    const labels = rows.map((row) => String(row[labelField] ?? ''));
    const colors = ['#0065cb', '#fe6300', '#2e9d6b', '#7a5af8', '#c99a06', '#0e9fb5', '#b42318', '#64748b', '#1d4ed8', '#0f766e'];

    const datasets = dataFields.map((field, i) => ({
      label: field,
      data: rows.map((row) => Number(row[field]) || 0),
      backgroundColor: this.chartType() === 'line'
        ? 'transparent'
        : colors[i % colors.length] + (this.chartType() === 'pie' || this.chartType() === 'doughnut' ? '' : 'cc'),
      borderColor: colors[i % colors.length],
      borderWidth: this.chartType() === 'line' ? 2 : 1,
      tension: 0.3,
    }));

    if (this.chartType() === 'pie' || this.chartType() === 'doughnut') {
      const singleData = rows.map((row) => Number(row[dataFields[0]]) || 0);
      return {
        type: this.chartType(),
        data: {
          labels,
          datasets: [{
            data: singleData,
            backgroundColor: labels.map((_, i) => colors[i % colors.length] + 'cc'),
            borderColor: labels.map((_, i) => colors[i % colors.length]),
            borderWidth: 1,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
      };
    }

    return {
      type: this.chartType(),
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: dataFields.length > 1 } },
      },
    };
  });

  /**
   * Grand-total row, worked out from the rows on screen.
   * COUNT/SUM and plain numbers add up; MIN/MAX take the overall min/max.
   * AVG and COUNT DISTINCT can't be derived from grouped rows, so they stay blank (server totals needed).
   */
  totals = computed(() => {
    const result = this.previewResult();
    if (!result || result.data.length < 2) return null;
    const aggByCol = new Map(this.selectedFields().map((f) => [this.columnLabel(f), f.aggregate]));
    const cells: Record<string, { value: number | null; note?: string }> = {};
    let any = false;
    for (const col of this.previewColumns()) {
      if (!this.numericColumns().includes(col)) continue;
      const agg = aggByCol.get(col) || '';
      const vals = result.data.map((r) => r[col]).filter((v) => typeof v === 'number') as number[];
      if (agg === 'Avg' || agg === 'CountDistinct') {
        cells[col] = { value: null, note: agg === 'Avg' ? 'An overall average needs the server — averaging the rows would be wrong' : 'Distinct counts can overlap between rows, so they cannot be added up' };
        continue;
      }
      if (!vals.length) continue;
      const v = agg === 'Min' ? Math.min(...vals) : agg === 'Max' ? Math.max(...vals) : Math.round(vals.reduce((a, b) => a + b, 0) * 1000) / 1000;
      cells[col] = { value: v };
      any = true;
    }
    return any ? cells : null;
  });

  /** Raw (unformatted) totals for files, so Excel can still do maths on them. */
  private exportTotals(): Record<string, any> | undefined {
    const t = this.totals();
    if (!t) return undefined;
    const out: Record<string, any> = {};
    for (const [col, cell] of Object.entries(t)) if (cell.value !== null) out[col] = cell.value;
    return out;
  }

  chartCapped = computed(() => (this.previewResult()?.data.length || 0) > MAX_CHART_CATEGORIES && this.layoutType() !== 'Table');

  numericColumns = computed(() =>
    this.previewColumns().filter((col) => {
      const result = this.previewResult();
      if (!result || result.data.length === 0) return false;
      return typeof result.data.find((r) => r[col] != null)?.[col] === 'number';
    })
  );

  stringColumns = computed(() =>
    this.previewColumns().filter((col) => {
      const result = this.previewResult();
      if (!result || result.data.length === 0) return true;
      return typeof result.data[0][col] !== 'number';
    })
  );

  readonly CHART_TYPES: { value: ChartType; label: string; icon: string }[] = [
    { value: 'bar', label: 'Bar', icon: 'bar_chart' },
    { value: 'line', label: 'Line', icon: 'show_chart' },
    { value: 'pie', label: 'Pie', icon: 'pie_chart' },
    { value: 'doughnut', label: 'Donut', icon: 'donut_large' },
    { value: 'radar', label: 'Radar', icon: 'radar' },
    { value: 'polarArea', label: 'Polar', icon: 'all_inclusive' },
  ];

  readonly FILTER_OPERATORS = FILTER_OPERATORS;
  readonly AGGREGATION_OPTIONS = AGGREGATION_OPTIONS;
  readonly RELATIVE_DATE_PRESETS = RELATIVE_DATE_PRESETS;
  readonly FORMAT_OPTIONS = FORMAT_OPTIONS;

  constructor(
    private api: ReportApiService,
    private exportService: ExportService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.api.getModules().subscribe((m) => this.modules.set(m));
    // The shell's rail drives the two builder views through ?tab=saved; ?report=<id> opens a saved report.
    this.route.queryParamMap.subscribe((q) => {
      const v = q.get('tab') === 'saved' ? 'library' : 'builder';
      if (v === 'library') this.openLibrary(this.libraryTab());
      else this.view.set('builder');
      const id = q.get('report');
      if (id && id !== this.currentReportId()) this.loadReport(id);
    });
    effect(() => {
      const tab = this.view() === 'library' ? 'saved' : null;
      if ((this.route.snapshot.queryParamMap.get('tab') || null) !== tab) {
        this.router.navigate([], { relativeTo: this.route, queryParams: { tab, report: null }, queryParamsHandling: 'merge', replaceUrl: true });
      }
    });
  }

  /** Used by the route guard when leaving the builder. */
  canLeave() {
    return this.confirmDiscard();
  }

  toggleFieldSelected(fieldId: number) {
    this.fieldSelections.update((fields) =>
      fields.map((f) =>
        f.field.fieldId === fieldId ? { ...f, selected: !f.selected, order: f.selected ? 0 : this.orderSeq++ } : f
      )
    );
  }

  setFieldAggregate(fieldId: number, aggregate: string) {
    this.fieldSelections.update((fields) =>
      fields.map((f) =>
        f.field.fieldId === fieldId ? { ...f, aggregate } : f
      )
    );
  }

  groupedCount = computed(() => this.selectedFields().filter((f) => f.grouped).length);

  toggleFieldGrouped(fieldId: number) {
    const fs = this.fieldSelections().find((f) => f.field.fieldId === fieldId);
    if (fs && !fs.grouped && this.groupedCount() >= MAX_GROUP_LEVELS) return;
    this.fieldSelections.update((fields) => {
      const next = fields.map((f) => (f.field.fieldId === fieldId ? { ...f, grouped: !f.grouped, aggregate: '' } : f));
      // PRD 6.5: summaries only exist while something is grouped
      return next.some((f) => f.selected && f.grouped) ? next : next.map((f) => ({ ...f, aggregate: '' }));
    });
    this.markEdited();
  }

  setFieldFormatPattern(fieldId: number, pattern: string) {
    this.fieldSelections.update((fields) =>
      fields.map((f) =>
        f.field.fieldId === fieldId ? { ...f, formatPattern: pattern } : f
      )
    );
  }

  /** Only formats that fit the column: money gets currency, whole numbers stay whole, dates get date formats. */
  getFormatOptionsForField(field: ReportField) {
    if (field.dataType !== 'Number') return FORMAT_OPTIONS.filter((o) => o.dataTypes.includes(field.dataType));
    const allowed: Record<string, string[]> = {
      money: ['', 'c2', 'c0', 'n3', 'n0'],
      integer: ['', 'n0'],
      decimal: ['', 'n0', 'n2', 'n3', 'p0', 'p2'],
    };
    const keep = allowed[field.numberKind || 'decimal'];
    return FORMAT_OPTIONS.filter((o) => keep.includes(o.value));
  }

  // === Calculated columns (PRD 7.3) ===

  /** Number columns in the report, plus calculated columns defined before the one being edited (no circular references). */
  calcOperandOptions = computed(() => {
    const idx = this.calcEditing();
    const upTo = idx === null || idx < 0 ? this.calcs().length : idx;
    return {
      columns: this.selectedFields().filter((f) => f.field.dataType === 'Number'),
      calcs: this.calcs().slice(0, upTo),
    };
  });

  private operandFrom(sel: string, value: string): CalcOperand | null {
    if (sel === 'v') return value.trim() !== '' && !isNaN(Number(value)) ? { kind: 'value', value: Number(value) } : null;
    if (sel.startsWith('f:')) return { kind: 'column', fieldId: +sel.slice(2) };
    if (sel.startsWith('c:')) return { kind: 'calc', name: sel.slice(2) };
    return null;
  }

  private operandKey(o: CalcOperand) {
    return o.kind === 'value' ? 'v' : o.kind === 'column' ? 'f:' + o.fieldId : 'c:' + o.name;
  }

  operandLabel(o: CalcOperand) {
    if (o.kind === 'value') return String(o.value);
    if (o.kind === 'calc') return o.name;
    return this.fieldSelections().find((f) => f.field.fieldId === o.fieldId)?.field.displayLabel || 'Column ' + o.fieldId;
  }

  opLabel(op: CalcOperation) {
    return CALC_OPERATIONS.find((o) => o.value === op)?.symbol || op;
  }

  private depth(c: CalculatedColumnDto, seen = new Set<string>()): number {
    if (seen.has(c.name)) return 99; // circular
    seen.add(c.name);
    let d = 1;
    for (const o of [c.left, c.right]) {
      if (o.kind !== 'calc') continue;
      const ref = this.calcs().find((x) => x.name === o.name);
      if (ref) d = Math.max(d, 1 + this.depth(ref, new Set(seen)));
    }
    return d;
  }

  /** PRD 7.3.5 messages */
  calcError = computed(() => {
    const name = this.calcName().trim();
    const idx = this.calcEditing();
    if (!name) return 'Enter a name';
    const taken = [...this.selectedFields().map((f) => this.columnLabel(f)), ...this.calcs().filter((_, i) => i !== idx).map((c) => c.name)];
    if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return 'A column with this name already exists';
    const l = this.operandFrom(this.calcLeft(), this.calcLeftValue());
    const r = this.operandFrom(this.calcRight(), this.calcRightValue());
    if (!l || !r) return 'Choose a column or enter a value';
    const draft: CalculatedColumnDto = { name, left: l, operation: this.calcOp(), right: r, decimals: this.calcDecimals() };
    if ([l, r].some((o) => o.kind === 'calc' && o.name.toLowerCase() === name.toLowerCase())) return 'This calculation refers to itself';
    const d = this.depthOfDraft(draft);
    if (d > 3) return d >= 99 ? 'This calculation refers to itself' : 'A calculation can build on others only three levels deep';
    return '';
  });

  private depthOfDraft(draft: CalculatedColumnDto) {
    const saved = this.calcs();
    const idx = this.calcEditing();
    const list = idx !== null && idx >= 0 ? saved.map((c, i) => (i === idx ? draft : c)) : [...saved, draft];
    const byName = new Map(list.map((c) => [c.name, c]));
    const walk = (c: CalculatedColumnDto, seen: Set<string>): number => {
      if (seen.has(c.name)) return 99;
      seen.add(c.name);
      let d = 1;
      for (const o of [c.left, c.right]) if (o.kind === 'calc' && byName.has(o.name)) d = Math.max(d, 1 + walk(byName.get(o.name)!, new Set(seen)));
      return d;
    };
    return walk(draft, new Set());
  }

  /** Default decimals follow the first operand: money 3, whole numbers 0, otherwise 2 (PRD 7.3.1). */
  private defaultDecimals(sel: string) {
    if (!sel.startsWith('f:')) return 2;
    const kind = this.fieldSelections().find((f) => f.field.fieldId === +sel.slice(2))?.field.numberKind;
    return kind === 'money' ? 3 : kind === 'integer' ? 0 : 2;
  }

  onCalcLeftChange(sel: string) {
    this.calcLeft.set(sel);
    if (this.calcEditing() === -1) this.calcDecimals.set(this.defaultDecimals(sel));
  }

  isRatioOp(op: CalcOperation) {
    return op === 'divide' || op === 'percentOf' || op === 'percentDiff';
  }

  calcFormatOptions = computed(() => {
    const d = this.calcDecimals();
    if (this.calcOp() === 'percentOf' || this.calcOp() === 'percentDiff') return [{ value: '', label: `Percent (${d} decimals)` }];
    return [
      { value: '', label: `Number (${d} decimals)` },
      { value: 'c' + d, label: `Currency (${HOSPITAL.currency}, ${d} decimals)` },
      { value: 'p' + d, label: `Percent (${d} decimals)` },
    ];
  });

  openCalcEditor(index = -1) {
    if (index === -1 && this.calcs().length >= this.MAX_CALCS) return;
    const c = index >= 0 ? this.calcs()[index] : null;
    this.calcEditing.set(index);
    this.calcName.set(c?.name || '');
    this.calcLeft.set(c ? this.operandKey(c.left) : '');
    this.calcLeftValue.set(c?.left.kind === 'value' ? String(c.left.value) : '');
    this.calcOp.set(c?.operation || 'add');
    this.calcRight.set(c ? this.operandKey(c.right) : '');
    this.calcRightValue.set(c?.right.kind === 'value' ? String(c.right.value) : '');
    this.calcDecimals.set(c?.decimals ?? 2);
    this.calcFormatSel.set(c?.formatPattern && !/^[np]\d$/.test(c.formatPattern) ? c.formatPattern : c?.formatPattern?.startsWith('p') && !this.isRatioOp(c.operation) ? c.formatPattern : '');
    this.calcAgg.set(c?.aggregate || 'Sum');
    this.calcTouched.set(false);
  }

  saveCalc() {
    this.calcTouched.set(true);
    if (this.calcError()) return;
    const fmtSel = this.calcFormatSel();
    const calc: CalculatedColumnDto = {
      name: this.calcName().trim(),
      left: this.operandFrom(this.calcLeft(), this.calcLeftValue())!,
      operation: this.calcOp(),
      right: this.operandFrom(this.calcRight(), this.calcRightValue())!,
      decimals: Math.max(0, Math.min(4, Math.round(Number(this.calcDecimals()) || 0))),
      formatPattern: fmtSel ? fmtSel.replace(/\d$/, String(this.calcDecimals())) : undefined,
      aggregate: this.isRatioOp(this.calcOp()) ? undefined : this.calcAgg(),
    };
    const idx = this.calcEditing()!;
    const oldName = idx >= 0 ? this.calcs()[idx].name : null;
    this.calcs.update((list) => {
      const next = idx >= 0 ? list.map((c, i) => (i === idx ? calc : c)) : [...list, calc];
      // a renamed calculation keeps the columns that build on it pointing at it
      return oldName && oldName !== calc.name
        ? next.map((c) => ({ ...c, left: c.left.kind === 'calc' && c.left.name === oldName ? { kind: 'calc', name: calc.name } : c.left, right: c.right.kind === 'calc' && c.right.name === oldName ? { kind: 'calc', name: calc.name } : c.right }) as CalculatedColumnDto)
        : next;
    });
    this.calcEditing.set(null);
    this.markEdited();
  }

  cancelCalc() {
    this.calcEditing.set(null);
  }

  removeCalc(i: number) {
    const name = this.calcs()[i].name;
    const users = this.calcs().filter((c) => [c.left, c.right].some((o) => o.kind === 'calc' && o.name === name));
    if (users.length) { this.snackBar.open(`${users[0].name} uses ${name}. Change or remove it first.`, '', { duration: 3500 }); return; }
    this.calcs.update((l) => l.filter((_, k) => k !== i));
    this.markEdited();
  }

  calcFormula(c: CalculatedColumnDto) {
    return `${this.operandLabel(c.left)} ${this.opLabel(c.operation)} ${this.operandLabel(c.right)}`;
  }

  calcSummaryLabel(c: CalculatedColumnDto) {
    return this.isRatioOp(c.operation) ? 'Recalculated from totals' : AGGREGATION_OPTIONS.find((a) => a.value === (c.aggregate || 'Sum'))?.label || 'Total';
  }

  // === Grouping and summaries (PRD 6.5) ===

  /** Grouped columns in the order they were grouped (selection order). */
  groupedFields = computed(() => this.selectedFields().filter((f) => f.grouped));
  groupableOptions = computed(() => this.selectedFields().filter((f) => f.field.isGroupable && !f.grouped));
  /** Columns that can carry a summary: every selected column that isn't a group, with at least one allowed summary. */
  summaryRows = computed(() => this.selectedFields().filter((f) => !f.grouped));

  addGrouping(fieldId: string) {
    if (fieldId) this.toggleFieldGrouped(+fieldId);
  }

  removeGrouping(fieldId: number) {
    this.toggleFieldGrouped(fieldId);
  }

  summaryOptions(fs: FieldSelection) {
    return AGGREGATION_OPTIONS.filter((a) => !a.value || fs.field.allowedAggregations.includes(a.value));
  }

  formatCellValue(value: any, col: string): string {
    const fs = this.selectedFields().find((f) => this.columnLabel(f) === col);
    return formatValue(value, fs?.formatPattern || undefined);
  }

  addConditionalFormat() {
    const cols = this.previewColumns();
    this.conditionalFormats.update((f) => [
      ...f,
      { targetColumn: cols.length > 0 ? cols[0] : '', operator: 'gt', value: '', backgroundColor: '#ffebee', textColor: '', appliesTo: 'both' },
    ]);
  }

  /** Rules apply in order and the first match wins, so order matters. */
  moveRule(index: number, delta: number) {
    const to = index + delta;
    this.conditionalFormats.update((list) => {
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  removeConditionalFormat(index: number) {
    this.conditionalFormats.update((f) => f.filter((_, i) => i !== index));
  }

  updateConditionalFormat(index: number, field: keyof ConditionalFormatRule, value: any) {
    this.conditionalFormats.update((f) =>
      f.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule))
    );
  }

  getCellStyle(value: any, col: string): Record<string, string> {
    const rules = this.conditionalFormats().filter((r) => r.targetColumn === col);
    for (const rule of rules) {
      if (this.evaluateRule(value, rule)) {
        const style: Record<string, string> = {};
        if (rule.backgroundColor) style['background-color'] = rule.backgroundColor;
        if (rule.textColor) style['color'] = rule.textColor;
        if (rule.fontWeight) style['font-weight'] = rule.fontWeight;
        return style;
      }
    }
    return {};
  }

  private evaluateRule(cellValue: any, rule: ConditionalFormatRule): boolean {
    if (cellValue == null || rule.value === '') return false;
    const numCell = typeof cellValue === 'number' ? cellValue : parseFloat(cellValue);
    const numRule = parseFloat(rule.value);
    const isNumeric = !isNaN(numCell) && !isNaN(numRule);
    switch (rule.operator) {
      case 'gt': return isNumeric && numCell > numRule;
      case 'gte': return isNumeric && numCell >= numRule;
      case 'lt': return isNumeric && numCell < numRule;
      case 'lte': return isNumeric && numCell <= numRule;
      case 'eq': return isNumeric ? numCell === numRule : String(cellValue) === String(rule.value);
      case 'neq': return isNumeric ? numCell !== numRule : String(cellValue) !== String(rule.value);
      case 'between': {
        const numRule2 = parseFloat(rule.value2);
        return isNumeric && !isNaN(numRule2) && numCell >= numRule && numCell <= numRule2;
      }
      case 'contains': return String(cellValue).toLowerCase().includes(String(rule.value).toLowerCase());
      default: return false;
    }
  }

  addDashboardWidget(type: VisualizationConfig['type']) {
    const id = 'viz-' + Date.now();
    const title = type === 'Grid' ? 'Data Table' : type + ' Chart';
    const widget: VisualizationConfig = { id, type, title };
    if (type !== 'Grid') {
      widget.xAxisField = this.chartLabelField() || (this.previewColumns().length > 0 ? this.previewColumns()[0] : '');
      widget.yAxisFields = this.chartDataFields().length > 0 ? [...this.chartDataFields()] : [];
    }
    const widgets = this.dashboardWidgets();
    const row = Math.floor(widgets.length / this.dashboardColumns());
    const col = widgets.length % this.dashboardColumns();
    this.dashboardWidgets.update((w) => [...w, widget]);
    this.dashboardLayout.update((l) => [...l, { vizId: id, col, row, colSpan: 1, rowSpan: 1 }]);
  }

  removeDashboardWidget(id: string) {
    this.dashboardWidgets.update((w) => w.filter((v) => v.id !== id));
    this.dashboardLayout.update((l) => l.filter((i) => i.vizId !== id));
  }

  private readonly DEFAULT_WIDGET_TITLES = ['Data Table', 'Bar Chart', 'Line Chart', 'Pie Chart', 'Doughnut Chart', 'Radar Chart', 'PolarArea Chart'];

  updateDashboardWidget(id: string, field: keyof VisualizationConfig, value: any) {
    this.dashboardWidgets.update((w) =>
      w.map((v) => {
        if (v.id !== id) return v;
        const updated = { ...v, [field]: value };
        if (field === 'type' && this.DEFAULT_WIDGET_TITLES.includes(v.title)) {
          updated.title = value === 'Grid' ? 'Data Table' : value + ' Chart';
        }
        return updated;
      })
    );
  }

  updateLayoutItem(vizId: string, field: keyof LayoutItem, value: number) {
    this.dashboardLayout.update((l) =>
      l.map((item) => (item.vizId === vizId ? { ...item, [field]: value } : item))
    );
  }

  getWidgetChartConfig(widget: VisualizationConfig): ChartConfiguration | null {
    const result = this.previewResult();
    if (!result || !widget.xAxisField || !widget.yAxisFields?.length) return null;
    const labels = result.data.map((row) => String(row[widget.xAxisField!] ?? ''));
    const colors = ['#0065cb', '#fe6300', '#2e9d6b', '#7a5af8', '#c99a06', '#0e9fb5', '#b42318', '#64748b', '#1d4ed8', '#0f766e'];
    const chartType = widget.type.toLowerCase() as ChartType;
    if (chartType === 'pie' || chartType === 'doughnut') {
      return {
        type: chartType,
        data: {
          labels,
          datasets: [{ data: result.data.map((row) => Number(row[widget.yAxisFields![0]]) || 0), backgroundColor: labels.map((_, i) => colors[i % colors.length] + 'cc'), borderWidth: 1 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
      };
    }
    return {
      type: chartType,
      data: {
        labels,
        datasets: widget.yAxisFields!.map((f, i) => ({
          label: f,
          data: result.data.map((row) => Number(row[f]) || 0),
          backgroundColor: chartType === 'line' ? 'transparent' : colors[i % colors.length] + 'cc',
          borderColor: colors[i % colors.length],
          borderWidth: chartType === 'line' ? 2 : 1,
          tension: 0.3,
        })),
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: widget.yAxisFields!.length > 1 } } },
    };
  }

  addDrillThrough() {
    const cols = this.previewColumns();
    this.drillThroughConfigs.update((d) => [
      ...d,
      { sourceColumn: cols.length > 0 ? cols[0] : '', targetReportId: '', targetReportName: '', parameterMappings: [] },
    ]);
  }

  removeDrillThrough(index: number) {
    this.drillThroughConfigs.update((d) => d.filter((_, i) => i !== index));
  }

  updateDrillThrough(index: number, field: keyof DrillThroughConfig, value: any) {
    this.drillThroughConfigs.update((d) =>
      d.map((cfg, i) => (i === index ? { ...cfg, [field]: value } : cfg))
    );
  }

  selectDrillThroughTarget(index: number) {
    const tpl = this.loadDialogTpl();
    if (!tpl) return;
    this.loadDialogTab.set('reports');
    this.loadingReports.set(true);
    this.api.getSavedReports().subscribe({
      next: (reports) => {
        this.loadingReports.set(false);
        this.savedReports.set(reports);
      },
      error: () => this.loadingReports.set(false),
    });
    const ref = this.dialog.open(tpl, { width: '520px' });
    this.drillPicking = (reportId: string) => {
      const report = this.savedReports().find((r) => r.reportId === reportId);
      if (report) {
        this.updateDrillThrough(index, 'targetReportId', reportId);
        this.updateDrillThrough(index, 'targetReportName', report.name);
      }
      ref.close();
    };
    ref.afterClosed().subscribe(() => (this.drillPicking = null));
  }

  addDrillThroughMapping(configIndex: number) {
    this.drillThroughConfigs.update((d) =>
      d.map((cfg, i) =>
        i === configIndex
          ? { ...cfg, parameterMappings: [...cfg.parameterMappings, { targetParamId: '', sourceColumn: '' }] }
          : cfg
      )
    );
  }

  removeDrillThroughMapping(configIndex: number, mappingIndex: number) {
    this.drillThroughConfigs.update((d) =>
      d.map((cfg, i) =>
        i === configIndex
          ? { ...cfg, parameterMappings: cfg.parameterMappings.filter((_, mi) => mi !== mappingIndex) }
          : cfg
      )
    );
  }

  updateDrillThroughMapping(configIndex: number, mappingIndex: number, field: keyof DrillThroughMapping, value: string) {
    this.drillThroughConfigs.update((d) =>
      d.map((cfg, i) =>
        i === configIndex
          ? { ...cfg, parameterMappings: cfg.parameterMappings.map((m, mi) => mi === mappingIndex ? { ...m, [field]: value } : m) }
          : cfg
      )
    );
  }

  getDrillThroughForColumn(col: string): DrillThroughConfig | undefined {
    return this.drillThroughConfigs().find((d) => d.sourceColumn === col);
  }

  onCellClick(row: Record<string, any>, col: string) {
    const dt = this.getDrillThroughForColumn(col);
    if (!dt || !dt.targetReportId) return;
    const currentConfig = this.buildFullConfig();
    this.drillThroughStack.update((s) => [
      ...s,
      { reportId: this.currentReportId(), reportName: this.currentReportName() || this.reportTitle() || 'Previous Report', config: currentConfig, dirty: this.dirty() },
    ]);
    this.api.getSavedReport(dt.targetReportId).subscribe({
      next: (detail) => {
        for (const mapping of dt.parameterMappings) {
          if (detail.configuration.parameters) {
            const param = detail.configuration.parameters.find((p) => p.paramId === mapping.targetParamId);
            if (param) param.defaultValue = row[mapping.sourceColumn];
          }
        }
        this.currentReportId.set(detail.reportId);
        this.currentReportName.set(detail.name);
        this.dirty.set(false);
        this.restoreConfig(detail.configuration, () => this.executePreview());
      },
      error: () => {
        this.drillThroughStack.update((s) => s.slice(0, -1));
        this.snackBar.open('Failed to load target report', 'OK', { duration: 3000 });
      },
    });
  }

  drillThroughBack() {
    const stack = this.drillThroughStack();
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    this.drillThroughStack.update((s) => s.slice(0, -1));
    this.currentReportId.set(prev.reportId);
    this.currentReportName.set(prev.reportName);
    this.dirty.set(prev.dirty); // unsaved edits made before drilling are still unsaved
    this.restoreConfig(prev.config, () => this.executePreview());
  }

  onModuleChange(moduleId: number) {
    this.selectedModuleId.set(moduleId);
    this.selectedEntityId.set(null);
    this.fieldSelections.set([]);
    this.filters.set([]);
    this.sortings.set([]);
    this.joins.set([]);
    this.previewResult.set(null);
    this.api.getEntities(moduleId).subscribe((e) => this.entities.set(e));
  }

  onEntityChange(entityId: number) {
    this.selectedEntityId.set(entityId);
    this.filters.set([]);
    this.sortings.set([]);
    this.joins.set([]);
    this.previewResult.set(null);

    this.api.getFields(entityId).subscribe((fields) => {
      this.fields.set(fields);
      this.fieldSelections.set(
        fields
          .filter((f) => f.systemFieldName !== 'TenantId')
          .map((f) => ({ field: f, selected: false, aggregate: '', grouped: false, formatPattern: '', order: 0 }))
      );
    });

    this.api.getRelationships(entityId).subscribe((r) => this.relationships.set(r));
  }

  private allFields() {
    return [...this.fields(), ...this.joins().flatMap((j) => j.fields)];
  }

  fieldType(fieldId: number): string {
    return this.allFields().find((f) => f.fieldId === fieldId)?.dataType || 'String';
  }

  getOperatorsForField(fieldId: number) {
    return OPERATORS_BY_TYPE[this.fieldType(fieldId)] || OPERATORS_BY_TYPE['String'];
  }

  operatorLabel(fieldId: number, op: string) {
    return this.getOperatorsForField(fieldId).find((o) => o.value === op)?.label || op;
  }

  /** Changing the column resets an operator the new type doesn't offer, and clears values of the wrong type. */
  onFilterFieldChange(row: FilterRow, list: 'filters' | 'having') {
    if (!this.getOperatorsForField(row.fieldId).some((o) => o.value === row.operator)) row.operator = 'eq';
    row.value = '';
    row.value2 = '';
    (list === 'filters' ? this.filters : this.havingFilters).update((x) => [...x]);
  }

  onFilterOperatorChange(row: FilterRow, list: 'filters' | 'having') {
    if (row.operator === 'relative') row.value = 'Last 30 days';
    else if (row.value && RELATIVE_DATE_PRESETS.some((p) => p.label === row.value)) row.value = '';
    (list === 'filters' ? this.filters : this.havingFilters).update((x) => [...x]);
  }

  filterError(row: FilterRow, having = false): string {
    const type = having ? 'Number' : this.fieldType(row.fieldId);
    return validateFilterValue(type, row.operator, row.value, row.value2);
  }

  /** Put a parameter reference (@id) into a filter value instead of a fixed value. */
  setFilterParam(row: FilterRow, which: 'value' | 'value2', paramId: string) {
    if (!paramId) return;
    row[which] = '@' + paramId;
    this.filters.update((x) => [...x]);
    this.markEdited();
  }

  clearFilterParam(row: FilterRow, which: 'value' | 'value2') {
    row[which] = '';
    this.filters.update((x) => [...x]);
    this.markEdited();
  }

  isParamRef(v: string | undefined) {
    return !!v && v.startsWith('@');
  }

  private toFilterRow(f: FilterDto): FilterRow {
    if (f.operator === 'between' && Array.isArray(f.value))
      return { fieldId: f.fieldId, operator: f.operator, value: String(f.value[0] ?? ''), value2: String(f.value[1] ?? '') };
    if (typeof f.value === 'boolean') return { fieldId: f.fieldId, operator: f.operator, value: String(f.value) };
    return { fieldId: f.fieldId, operator: f.operator, value: this.filterValueToText(f) };
  }

  getFieldLabel(fieldId: number): string {
    const allFields = [
      ...this.fields(),
      ...this.joins().flatMap((j) => j.fields),
    ];
    return allFields.find((f) => f.fieldId === fieldId)?.displayLabel || `Field ${fieldId}`;
  }

  addFilter() {
    const filterableFields = this.filterableFields();
    if (filterableFields.length === 0 || this.filters().length >= MAX_FILTERS) return;
    this.filters.update((f) => [
      ...f,
      { fieldId: filterableFields[0].fieldId, operator: 'eq', value: '' },
    ]);
  }

  removeFilter(index: number) {
    this.filters.update((f) => f.filter((_, i) => i !== index));
  }

  addHavingFilter() {
    const agg = this.aggregatedFields();
    if (agg.length === 0) return;
    this.havingFilters.update((f) => [
      ...f,
      { fieldId: agg[0].fieldId, operator: 'gt', value: '' },
    ]);
  }

  removeHavingFilter(index: number) {
    this.havingFilters.update((f) => f.filter((_, i) => i !== index));
  }

  addSorting() {
    const used = new Set(this.sortings().map((x) => x.fieldId));
    const next = this.sortableFields().find((f) => !used.has(f.fieldId));
    if (!next || this.sortings().length >= MAX_SORTS) return;
    this.sortings.update((s) => [...s, { fieldId: next.fieldId, direction: 'ASC' }]);
  }

  /** A column can't be sorted twice: each row offers the columns not used by the other rows. */
  sortOptionsFor(index: number) {
    const used = new Set(this.sortings().filter((_, i) => i !== index).map((x) => x.fieldId));
    return this.sortableFields().filter((f) => !used.has(f.fieldId));
  }

  canAddSort = computed(() => this.sortings().length < MAX_SORTS && this.sortableFields().length > this.sortings().length);

  /** PRD 6.6: say whether Top N ranks rows or groups. */
  topNStatement = computed(() => {
    if (!this.topNEnabled()) return '';
    const fs = this.selectedFields().find((f) => f.field.fieldId === this.topNFieldId());
    if (!fs) return 'Choose the column to rank by';
    const groupsRanked = this.hasGroupings() && this.groupingMode() === 'summary';
    return `${this.topNDirection() === 'top' ? 'Top' : 'Bottom'} ${this.topNCount()} ${groupsRanked ? 'groups' : 'rows'} by ${groupsRanked ? this.columnLabel(fs) : fs.field.displayLabel}`;
  });

  topNError = computed(() => {
    if (!this.topNEnabled()) return '';
    const n = Number(this.topNCount());
    if (!Number.isInteger(n) || n < 1 || n > 100) return 'Enter a whole number from 1 to 100';
    if (!this.topNFieldId()) return 'Choose a column to rank by';
    return '';
  });

  removeSorting(index: number) {
    this.sortings.update((s) => s.filter((_, i) => i !== index));
  }

  async addJoin(rel: ReportRelationship) {
    const primaryEntityId = this.selectedEntityId()!;
    const otherEntityId =
      rel.primaryEntityId === primaryEntityId ? rel.foreignEntityId : rel.primaryEntityId;
    const otherEntityName =
      rel.primaryEntityId === primaryEntityId ? rel.foreignEntityName : rel.primaryEntityName;

    let otherEntity = this.entities().find((e) => e.entityId === otherEntityId);
    if (!otherEntity) {
      otherEntity = { entityId: otherEntityId, entityName: otherEntityName, objectType: 'View' } as ReportEntity;
    }

    this.api.getFields(otherEntityId).subscribe((fields) => {
      const joinFields = fields.filter((f) => f.systemFieldName !== 'TenantId');
      this.joins.update((j) => [
        ...j,
        {
          relationship: rel,
          joinType: 'left',
          entity: otherEntity,
          fields: joinFields,
          selectedFieldIds: [],
        },
      ]);
    });
  }

  removeJoin(index: number) {
    this.joins.update((j) => j.filter((_, i) => i !== index));
  }

  toggleJoinField(joinIndex: number, fieldId: number) {
    this.joins.update((joins) =>
      joins.map((j, i) => {
        if (i !== joinIndex) return j;
        const ids = j.selectedFieldIds.includes(fieldId)
          ? j.selectedFieldIds.filter((id) => id !== fieldId)
          : [...j.selectedFieldIds, fieldId];
        return { ...j, selectedFieldIds: ids };
      })
    );
  }

  buildConfig(): ReportConfigurationDto {
    const selected = this.selectedFields();
    const selectedFields: SelectedFieldDto[] = selected.map((fs) => ({
      fieldId: fs.field.fieldId,
      label: this.columnLabel(fs),
      aggregate: fs.aggregate || undefined,
      formatPattern: fs.formatPattern || undefined,
    }));

    const groupings = selected.filter((fs) => fs.grouped).map((fs) => fs.field.fieldId);

    const relatedEntities: RelatedEntityDto[] = this.joins()
      .filter((j) => j.selectedFieldIds.length > 0)
      .map((j) => ({
        entityId: j.entity.entityId,
        relationshipId: j.relationship.relationshipId,
        joinType: j.joinType,
        selectedFields: j.selectedFieldIds.map((fid) => {
          const f = j.fields.find((ff) => ff.fieldId === fid)!;
          return { fieldId: fid, label: f.displayLabel };
        }),
      }));

    let filterGroup: FilterGroupDto | undefined;
    const activeFilters = this.filters().filter((f) => {
      const op = FILTER_OPERATORS.find((o) => o.value === f.operator);
      return op && (!op.needsValue || (f.value.trim() !== '' && (f.operator !== 'between' || (f.value2 ?? '').trim() !== '' || f.value.includes(','))));
    });

    if (activeFilters.length > 0) {
      filterGroup = {
        logic: this.filterLogic(),
        filters: activeFilters.map((f) => this.buildFilterDto(f)),
      };
    }

    const sortings = this.sortings().length > 0 ? this.sortings() : undefined;

    let having: FilterGroupDto | undefined;
    if (this.hasGroupings()) {
      const activeHaving = this.havingFilters().filter((f) => {
        const op = FILTER_OPERATORS.find((o) => o.value === f.operator);
        return op && (!op.needsValue || (f.value.trim() !== '' && (f.operator !== 'between' || (f.value2 ?? '').trim() !== '' || f.value.includes(','))));
      });
      if (activeHaving.length > 0) {
        having = {
          logic: this.havingLogic(),
          filters: activeHaving.map((f) => this.buildFilterDto(f)),
        };
      }
    }

    let topN: TopNConfigDto | undefined;
    if (this.topNEnabled() && this.topNFieldId()) {
      topN = {
        count: this.topNCount(),
        direction: this.topNDirection(),
        byFieldId: this.topNFieldId()!,
      };
    }

    return {
      title: this.reportTitle() || 'Ad-hoc Report',
      moduleId: this.selectedModuleId()!,
      mode: 'preview',
      parameters: this.parameters().length > 0 ? this.parameters() : undefined,
      conditionalFormats: this.conditionalFormats().length > 0 ? this.conditionalFormats() : undefined,
      drillThrough: this.drillThroughConfigs().length > 0 ? this.drillThroughConfigs() : undefined,
      dataConfiguration: {
        primaryEntityId: this.selectedEntityId()!,
        groupingMode: groupings.length ? this.groupingMode() : undefined,
        showGrandTotal: groupings.length ? this.showGrandTotal() : undefined,
        groupsStart: groupings.length ? this.groupsStart() : undefined,
        calculatedColumns: this.calcs().length ? this.calcs() : undefined,
        selectedFields,
        relatedEntities: relatedEntities.length > 0 ? relatedEntities : undefined,
        distinct: this.distinctEnabled() || undefined,
        filterGroup,
        groupings: groupings.length > 0 ? groupings : undefined,
        having,
        sortings,
        topN,
      },
    };
  }

  private buildFilterDto(row: FilterRow): FilterDto {
    const field = [...this.fields(), ...this.joins().flatMap((j) => j.fields)].find(
      (f) => f.fieldId === row.fieldId
    );

    let value: any = row.value;

    if (row.operator === 'relative') {
      const preset = RELATIVE_DATE_PRESETS.find((p) => p.label === row.value);
      value = preset ? preset.value : { unit: 'day', offset: -30, anchor: 'now' };
    } else if (row.operator === 'in' || row.operator === 'notin') {
      value = row.value.split(',').map((v) => v.trim());
    } else if (row.operator === 'between') {
      const num = (x: string) => (field?.dataType === 'Number' && !x.startsWith('@') ? Number(x) : x);
      value = row.value2 !== undefined && row.value2 !== ''
        ? [num(row.value.trim()), num(row.value2.trim())]
        : row.value.split(',').map((v) => num(v.trim()));
    } else if (row.operator === 'isnull' || row.operator === 'isnotnull') {
      value = undefined;
    } else if (field?.dataType === 'Number' && !row.value.startsWith('@')) {
      value = Number(row.value);
    } else if (field?.dataType === 'Boolean' && !row.value.startsWith('@')) {
      value = row.value.toLowerCase() === 'true';
    }

    return { fieldId: row.fieldId, operator: row.operator, value };
  }

  /** Business rules that must hold before a run (PRD 7). Each issue names the section to fix. */
  issues = computed(() => {
    const out: { section: string; message: string }[] = [];
    const title = this.reportTitle().trim();
    if (!title || title.length > 150) out.push({ section: 'title', message: 'Enter a report title (up to 150 characters).' });
    if (this.hasGroupings() && this.groupingMode() === 'summary')
      for (const c of this.calcs())
        for (const o of [c.left, c.right])
          if (o.kind === 'column' && !this.selectedFields().some((f) => f.field.fieldId === o.fieldId && (f.aggregate === 'Sum' || f.grouped)))
            { out.push({ section: 'grouping', message: `In summary-only mode, ${c.name} needs ${this.operandLabel(o)} summarised as Total.` }); break; }
    const sel = this.selectedFields();
    if (!sel.length && !this.joins().some((j) => j.selectedFieldIds.length)) out.push({ section: 'columns', message: 'Select at least one column.' });
    if (this.hasGroupings()) {
      if (!sel.some((f) => f.aggregate)) out.push({ section: 'grouping', message: 'Set at least one summary when grouping.' });
      if (this.groupingMode() === 'summary') {
        const loose = sel.filter((f) => !f.grouped && !f.aggregate).map((f) => f.field.displayLabel);
        if (loose.length) out.push({ section: 'grouping', message: `In summary-only mode, group or summarise every column: ${loose.join(', ')}.` });
      }
    }
    if (this.filters().some((f) => this.filterError(f)) || this.havingFilters().some((f) => this.filterError(f, true)))
      out.push({ section: 'filters', message: 'Fix the highlighted filter values.' });
    if (this.topNError()) out.push({ section: 'sort', message: 'Top / Bottom: ' + this.topNError().toLowerCase() + '.' });
    if (this.parameters().some((_, i) => this.paramIdError(i))) out.push({ section: 'params', message: 'Fix the highlighted parameter identifiers.' });
    if (this.conditionalFormats().some((r) => !r.targetColumn || r.value === '' || (!r.backgroundColor && !r.textColor)))
      out.push({ section: 'format', message: 'Each formatting rule needs a column, a value and a colour.' });
    if (this.calcEditing() !== null) out.push({ section: 'calcs', message: 'Finish or cancel the calculated column you are editing.' });
    if (this.drillThroughConfigs().some((d) => !d.sourceColumn || !d.targetReportId || !d.parameterMappings.length))
      out.push({ section: 'drill', message: 'Each drill-through link needs a target report and at least one parameter mapping.' });
    return out;
  });

  saveIssues = computed(() => this.issues().filter((i) => i.section === 'title' || (i.section === 'columns' && i.message.startsWith('Select'))));

  goToIssue(section: string) {
    if (section === 'title') {
      (document.querySelector('.fx-title-input') as HTMLInputElement | null)?.focus();
      return;
    }
    this.openSections.update((s) => new Set([...s, section]));
  }

  paramIdError(i: number) {
    const ids = this.parameters().map((p) => p.paramId);
    return validateParamId(this.parameters()[i]?.paramId || '', ids);
  }

  runPreview() {
    if (this.issues().length) {
      this.showIssues.set(true);
      for (const i of this.issues()) if (i.section !== 'title') this.openSections.update((s) => new Set([...s, i.section]));
      return;
    }
    this.showIssues.set(false);
    if (this.parameters().length > 0) {
      this.promptParametersThen(() => this.executePreview());
    } else {
      this.executePreview();
    }
  }

  private promptParametersThen(callback: () => void) {
    const tpl = this.paramPromptTpl();
    if (!tpl) { callback(); return; }
    const values: Record<string, any> = {};
    for (const p of this.parameters()) {
      values[p.paramId] = p.defaultValue ?? '';
    }
    this.paramPromptValues.set(values);
    const ref = this.dialog.open(tpl, { width: '420px' });
    ref.afterClosed().subscribe((result) => {
      if (result === 'run') {
        const promptVals = this.paramPromptValues();
        this.parameters.update((params) =>
          params.map((p) => ({ ...p, defaultValue: promptVals[p.paramId] }))
        );
        callback();
      }
    });
  }

  private executePreview() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.reportError.set(null);
    const config = this.buildConfig();
    this.api.preview(config).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.success) {
          this.previewResult.set(res.data);
          this.runAt.set(new Date());
          this.stale.set(false);
          if (res.data.data.length > 0) {
            this.previewColumns.set(Object.keys(res.data.data[0]));
          } else {
            const fields = this.selectedFields().map((f) => this.columnLabel(f));
            const joinFields = this.joins().flatMap((j) =>
              j.selectedFieldIds.map((fid) => j.fields.find((f) => f.fieldId === fid)?.displayLabel || '')
            );
            this.previewColumns.set([...fields, ...joinFields]);
          }
          this.ensureChartFields();
        }
      },
      error: (err) => {
        // Plain-language message with a reference; the report the user built is untouched (PRD 6.8)
        this.loading.set(false);
        this.reportError.set(toReportError(err));
      },
    });
  }

  /** Export needs a current result with at least one row (PRD 7). */
  exportDisabledReason = computed(() => {
    const r = this.previewResult();
    if (!r) return 'Run the preview first';
    if (!r.data.length) return 'There are no rows to export';
    if (this.stale()) return 'The result is out of date. Run the preview again first';
    return '';
  });

  restrictedColumns = computed(() => [
    ...this.selectedFields().filter((f) => f.field.isRestricted).map((f) => f.field.displayLabel),
    ...this.joins().flatMap((j) => j.fields.filter((f) => f.isRestricted && j.selectedFieldIds.includes(f.fieldId)).map((f) => f.displayLabel)),
  ]);

  exportCsv() {
    this.withExportReason('CSV', () => {
      const r = this.previewResult()!;
      if (r.truncated) this.serverExport('csv'); // over the preview limit: the server has the complete result
      else this.exportService.exportCsvReport(this.buildExport());
    });
  }

  exportExcel() {
    this.withExportReason('Excel', () => this.exportService.exportExcelReport(this.buildExport()));
  }

  exportPdf() {
    this.withExportReason('PDF', () => this.serverExport('pdf'));
  }

  /** Restricted columns need a stated reason, stored with the audit record, before any export. */
  private withExportReason(format: string, go: () => void) {
    if (this.exportDisabledReason()) return;
    const cols = this.restrictedColumns();
    if (!cols.length) { go(); return; }
    const tpl = this.exportReasonTpl();
    if (!tpl) return;
    this.exportReason.set('');
    this.exportReasonTouched.set(false);
    this.dialog.open(tpl, { width: '460px', data: { format, cols } }).afterClosed().subscribe((ok) => {
      if (ok !== 'export') return;
      this.api.auditExport({ reportName: this.reportTitle(), format, reason: this.exportReason().trim(), columns: cols }).subscribe(() => go());
    });
  }

  private filterText(f: FilterRow) {
    const label = this.getFieldLabel(f.fieldId);
    const op = this.operatorLabel(f.fieldId, f.operator);
    const show = (v: string) => (v?.startsWith('@') ? this.parameters().find((p) => p.paramId === v.slice(1))?.label || v : displayDate(v));
    if (f.operator === 'isnull' || f.operator === 'isnotnull') return `${label} ${op.toLowerCase()}`;
    if (f.operator === 'between') return `${label} between ${show(f.value)} and ${show(f.value2 || '')}`;
    return `${label} ${op.toLowerCase()} ${show(f.value)}`;
  }

  /** PRD 6.10 criteria line: filters and parameter values used, who ran it, when. */
  criteriaLine() {
    const parts: string[] = [];
    const fl = this.filters().filter((f) => !this.filterError(f)).map((f) => this.filterText(f));
    if (fl.length) parts.push('Filters: ' + fl.join(this.filterLogic() === 'and' ? '; ' : ' OR '));
    if (this.parameters().length)
      parts.push('Parameters: ' + this.parameters().map((p) => `${p.label || p.paramId} ${p.defaultValue === '' || p.defaultValue == null ? 'All' : displayDate(String(p.defaultValue))}`).join(', '));
    parts.push(`Run by ${HOSPITAL.userName} on ${mediumDateTime(this.runAt() || new Date())}`);
    return parts.join(' · ');
  }

  private buildExport(): ReportExport {
    const r = this.previewResult()!;
    const formats: Record<string, string | undefined> = {};
    for (const f of this.selectedFields()) formats[this.columnLabel(f)] = f.formatPattern || undefined;
    return {
      title: (this.reportTitle() || 'Report').trim(),
      columns: this.previewColumns(),
      rows: r.data,
      groups: r.groups,
      grandTotal: r.grandTotal ?? this.exportTotals() ?? null,
      formats,
      criteria: this.criteriaLine(),
      conditionalFormats: this.conditionalFormats(),
    };
  }

  private buildFullConfig(): ReportConfigurationDto {
    const config = this.buildConfig();
    config.layoutType = this.layoutType();
    config.orientation = this.orientation();
    const layout = this.columnLayout();
    if (Object.keys(layout.widths || {}).length || layout.nowrap?.length || layout.pinned?.length) config.columnLayout = layout;
    if (
      (this.layoutType() === 'Chart' || this.layoutType() === 'ChartAndTable') &&
      this.chartLabelField() &&
      this.chartDataFields().length > 0
    ) {
      config.chartConfig = {
        chartType: this.chartType(),
        labelField: this.chartLabelField(),
        dataFields: this.chartDataFields(),
      };
    }
    if (this.dashboardEnabled() && this.dashboardWidgets().length > 0) {
      config.visualizations = this.dashboardWidgets();
      config.layout = {
        type: 'grid',
        columns: this.dashboardColumns(),
        items: this.dashboardLayout(),
      };
    }
    return config;
  }

  private serverExport(format: string) {
    if (this.selectedFields().length === 0) return;
    const config = this.buildFullConfig();
    this.snackBar.open(`Generating ${format.toUpperCase()}...`, '', { duration: 0 });
    this.api.exportFile(config, format).subscribe({
      next: (blob) => {
        const title = this.reportTitle() || 'report';
        const ext = format === 'pdf' ? 'pdf' : 'csv';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        this.snackBar.open(`${format.toUpperCase()} downloaded`, 'OK', { duration: 3000 });
      },
      error: (err) => {
        const msg = err.error?.message || `${format.toUpperCase()} export failed`;
        this.snackBar.open(msg, 'OK', { duration: 5000 });
      },
    });
  }

  toggleChartDataField(col: string) {
    this.chartDataFields.update((fields) =>
      fields.includes(col) ? fields.filter((f) => f !== col) : [...fields, col]
    );
  }

  autoConfigureChart() {
    const cols = this.previewColumns();
    const result = this.previewResult();
    if (!result || result.data.length === 0 || cols.length === 0) return;
    const sample = (c: string) => result.data.find((r) => r[c] != null)?.[c];
    const stringCols = cols.filter((c) => typeof sample(c) !== 'number');
    const numCols = cols.filter((c) => typeof sample(c) === 'number');
    this.chartLabelField.set(stringCols[0] ?? cols[0]);
    this.chartDataFields.set(numCols.length ? [numCols[0]] : []);
  }

  /** Keep the chart pointing at columns that exist; pick sensible ones when it isn't set up yet. */
  private ensureChartFields() {
    if (this.layoutType() === 'Table') return;
    const cols = this.previewColumns();
    const kept = this.chartDataFields().filter((c) => this.numericColumns().includes(c));
    if (kept.length !== this.chartDataFields().length) this.chartDataFields.set(kept);
    if (!cols.includes(this.chartLabelField()) || kept.length === 0) this.autoConfigureChart();
  }

  setLayout(type: 'Table' | 'Chart' | 'ChartAndTable') {
    this.layoutType.set(type);
    this.ensureChartFields();
  }

  // === Save / Load ===

  newReport() {
    this.currentReportId.set(null);
    this.currentOwnerId.set('me');
    this.currentOwnerName.set('');
    this.withdrawn.set([]);
    this.groupingMode.set('summary');
    this.showGrandTotal.set(true);
    this.groupsStart.set('auto');
    this.calcs.set([]);
    this.calcEditing.set(null);
    this.columnLayout.set({});
    this.stale.set(false);
    this.runAt.set(null);
    this.reportError.set(null);
    this.showIssues.set(false);
    this.currentReportName.set('');
    this.selectedModuleId.set(null);
    this.selectedEntityId.set(null);
    this.entities.set([]);
    this.fieldSelections.set([]);
    this.filters.set([]);
    this.sortings.set([]);
    this.joins.set([]);
    this.relationships.set([]);
    this.previewResult.set(null);
    this.previewColumns.set([]);
    this.errorMessage.set(null);
    this.reportTitle.set('');
    this.layoutType.set('Table');
    this.orientation.set('Portrait');
    this.chartType.set('bar');
    this.chartLabelField.set('');
    this.chartDataFields.set([]);
    this.parameters.set([]);
    this.conditionalFormats.set([]);
    this.dashboardEnabled.set(false);
    this.dashboardColumns.set(2);
    this.dashboardWidgets.set([]);
    this.dashboardLayout.set([]);
    this.drillThroughConfigs.set([]);
    this.drillThroughStack.set([]);
  }

  quickSave() {
    if (this.saveIssues().length) { this.showIssues.set(true); return; }
    if (this.isOthersReport()) { this.openSaveDialog(); return; } // someone else's report: save your own copy
    if (this.currentReportId()) {
      const config = this.buildFullConfig();
      this.api.updateReport(this.currentReportId()!, {
        configuration: config,
        changeDescription: 'Quick save',
      }).subscribe({
        next: () => { this.dirty.set(false); this.snackBar.open('Report saved', '', { duration: 2000 }); },
        error: () => this.snackBar.open('Save failed', 'OK', { duration: 5000 }),
      });
    } else {
      this.openSaveDialog();
    }
  }

  openSaveDialog(asTemplate = false) {
    const tpl = this.saveDialogTpl();
    if (!tpl) return;
    if (this.saveIssues().length) { this.showIssues.set(true); return; }
    this.saveDialogName.set(this.isOthersReport() ? 'Copy of ' + (this.currentReportName() || this.reportTitle()) : this.reportTitle() || '');
    this.saveDialogDescription.set('');
    this.saveDialogIsShared.set(false);
    this.saveDialogShareWith.set([]);
    this.saveDialogTouched.set(false);
    this.saveDialogIsTemplate.set(asTemplate);
    this.api.getSavedReports().subscribe((r) => this.savedReports.set(r));
    if (!this.users().length) this.api.getUsers().subscribe((u) => this.users.set(u));
    const ref = this.dialog.open(tpl, { width: '460px' });
    ref.afterClosed().subscribe((result) => {
      if (result === 'save') this.performSave();
    });
  }

  /** Report names are unique per user; descriptions up to 500 characters (PRD 7). */
  saveDialogError = computed(() => {
    const name = this.saveDialogName().trim();
    if (!name) return 'Enter a report name.';
    if (name.length > 150) return 'Keep the name to 150 characters or fewer.';
    if (this.savedReports().some((r) => r.ownerId === 'me' && r.name.trim().toLowerCase() === name.toLowerCase()))
      return 'You already have a report with this name.';
    if (this.saveDialogDescription().length > 500) return 'Descriptions can be up to 500 characters.';
    return '';
  });

  toggleShare(userId: string) {
    this.saveDialogShareWith.update((l) => (l.includes(userId) ? l.filter((x) => x !== userId) : [...l, userId]));
  }

  private performSave() {
    const config = this.buildFullConfig();
    const isTemplate = this.saveDialogIsTemplate();
    this.api.createReport({
      name: this.saveDialogName(),
      description: this.saveDialogDescription() || undefined,
      moduleId: this.selectedModuleId()!,
      isShared: this.saveDialogShareWith().length > 0,
      sharedWith: this.saveDialogShareWith(),
      isTemplate,
      configuration: config,
    }).subscribe({
      next: (saved) => {
        this.currentReportId.set(saved.reportId);
        this.currentReportName.set(saved.name);
        this.currentOwnerId.set('me');
        this.currentOwnerName.set(HOSPITAL.userName);
        this.dirty.set(false);
        const label = isTemplate ? 'Template saved' : 'Saved';
        this.snackBar.open(`${label}: ${saved.name}`, 'OK', { duration: 3000 });
      },
      error: () => this.snackBar.open('Save failed', 'OK', { duration: 5000 }),
    });
  }

  // === Page fit (PRD 7.4.1 / 7.4.3) ===

  /** Estimated printed width: numbers and dates 22mm, codes 20mm, short text 25mm, names 40mm. */
  layoutFit = computed(() => {
    const mm = (f: ReportField) => {
      if (f.dataType === 'Number' || f.dataType === 'Date') return 22;
      if (f.dataType === 'Boolean') return 18;
      if (f.allowedAggregations.includes('CountDistinct')) return 20; // codes and references
      return f.isGroupable ? 25 : 40; // short categorical text vs names
    };
    const cols = [...this.selectedFields().map((f) => mm(f.field)), ...this.calcs().map(() => 22)];
    const total = cols.reduce((a, b) => a + b, 0);
    const portrait = 180, landscape = 267;
    const cap = this.orientation() === 'Landscape' ? landscape : portrait;
    return { count: cols.length, total, cap, fits: total <= cap, fitsLandscape: total <= landscape };
  });

  onLayoutChange(l: { widths?: Record<string, number>; nowrap?: string[]; pinned?: string[] }) {
    this.columnLayout.set(l);
    this.dirty.set(true);
  }

  // === Publish (PRD 6.11) ===

  publishDisabledReason = computed(() => {
    if (!this.currentReportId()) return 'Save the report first';
    if (this.isOthersReport()) return 'Save your own copy to publish it';
    if (this.dirty()) return 'Save your changes first';
    return '';
  });

  openPublishDialog() {
    const tpl = this.publishTpl();
    if (!tpl || this.publishDisabledReason()) return;
    this.pubModuleId.set(this.selectedModuleId());
    this.pubType.set('live');
    this.pubLabel.set('');
    this.pubError.set('');
    this.dialog.open(tpl, { width: '480px' });
  }

  publish() {
    const type = this.pubType();
    const label = this.pubLabel().trim();
    if (!this.pubModuleId()) { this.pubError.set('Choose a module.'); return; }
    if (type === 'snapshot') {
      if (!label) { this.pubError.set('Give the snapshot a label, for example "September 2026 close".'); return; }
      if (!this.previewResult() || this.stale()) { this.pubError.set('Run the preview first. A snapshot stores that result.'); return; }
    }
    const ranWith = this.parameters().map((p) => ({ label: p.label || p.paramId, value: p.defaultValue === '' || p.defaultValue == null ? 'All' : displayDate(String(p.defaultValue)) }));
    this.pubBusy.set(true);
    this.api.publish({
      reportId: this.currentReportId()!,
      reportName: this.currentReportName() || this.reportTitle(),
      description: this.savedReports().find((r) => r.reportId === this.currentReportId())?.description ?? null,
      moduleId: this.pubModuleId()!,
      type,
      label: type === 'snapshot' ? label : undefined,
      snapshot: type === 'snapshot' ? { result: this.previewResult()!, ranWith, runAt: (this.runAt() || new Date()).toISOString() } : undefined,
    }).subscribe({
      next: () => {
        this.pubBusy.set(false);
        this.dialog.closeAll();
        this.snackBar.open(`Published to ${this.moduleName(this.pubModuleId())} as a ${type === 'live' ? 'live report' : 'snapshot'}.`, '', { duration: 3500 });
      },
      error: (e) => {
        this.pubBusy.set(false);
        this.pubError.set(e?.error?.code === 'DUPLICATE_LABEL' ? 'A snapshot with this label was already published to this module today.' : 'Publishing failed. Try again.');
      },
    });
  }

  openVersions(r: SavedReportDto) {
    const tpl = this.versionsTpl();
    if (!tpl) return;
    this.versionsFor.set(r.name);
    this.versions.set([]);
    this.api.getVersions(r.reportId).subscribe((v) => this.versions.set([...v].reverse()));
    this.dialog.open(tpl, { width: '480px' });
  }

  openRequestColumn() {
    const tpl = this.requestTpl();
    if (!tpl) return;
    this.reqText.set('');
    this.reqRef.set('');
    this.dialog.open(tpl, { width: '460px' });
  }

  submitColumnRequest() {
    if (this.reqText().trim().length < 5) return;
    this.api.requestColumn({ moduleId: this.selectedModuleId(), entityId: this.selectedEntityId(), request: this.reqText().trim() })
      .subscribe((r) => this.reqRef.set(r.reference));
  }

  entityInfo = computed(() => this.entities().find((e) => e.entityId === this.selectedEntityId()));
  newEntityInfo = computed(() => this.newEntities().find((e) => e.entityId === this.newEntityId()));

  /** The report as the results grid and exports see it. */
  gridConfig = computed(() => {
    this.stale();
    this.calcs();
    this.columnLayout();
    this.showGrandTotal();
    this.groupsStart();
    this.conditionalFormats();
    this.drillThroughConfigs();
    this.fieldSelections();
    return this.buildFullConfig();
  });

  // === Fusion shell helpers ===

  openLibrary(tab: 'reports' | 'shared' | 'templates' = 'reports') {
    this.libraryTab.set(tab);
    this.view.set('library');
    this.refreshLibrary();
  }

  private refreshLibrary() {
    this.loadingReports.set(true);
    this.loadingTemplates.set(true);
    this.api.getSavedReports().subscribe({
      next: (r) => { this.savedReports.set(r); this.loadingReports.set(false); },
      error: () => this.loadingReports.set(false),
    });
    this.api.getTemplates().subscribe({
      next: (t) => { this.templates.set(t); this.loadingTemplates.set(false); },
      error: () => this.loadingTemplates.set(false),
    });
  }

  startNewReport() {
    if (!this.confirmDiscard()) return;
    const tpl = this.newReportTpl();
    if (!tpl) return;
    this.newModuleId.set(null);
    this.newEntityId.set(null);
    this.newEntities.set([]);
    this.api.getTemplates().subscribe((t) => this.templates.set(t));
    this.dialog.open(tpl, { width: '480px', autoFocus: 'first-tabbable' });
  }

  onNewModule(moduleId: number) {
    this.newModuleId.set(moduleId);
    this.newEntityId.set(null);
    this.api.getEntities(moduleId).subscribe((e) => {
      this.newEntities.set(e);
      if (e.length === 1) this.newEntityId.set(e[0].entityId); // only one choice: take it
    });
  }

  createNewReport() {
    const moduleId = this.newModuleId();
    const entityId = this.newEntityId();
    if (!moduleId || !entityId) return;
    this.dialog.closeAll();
    this.newReport();
    this.dirty.set(false);
    this.view.set('builder');
    this.selectedModuleId.set(moduleId);
    this.entities.set(this.newEntities());
    this.onEntityChange(entityId);
    this.openSections.set(new Set(['columns', 'filters']));
  }

  useTemplateFromNew(templateId: string) {
    this.dirty.set(false); // already confirmed when the dialog opened
    this.cloneTemplate(templateId);
  }

  moduleName(id: number | null | undefined) {
    return this.modules().find((m) => m.moduleId === id)?.moduleName || '';
  }

  entityName() {
    return this.entities().find((e) => e.entityId === this.selectedEntityId())?.entityName || '';
  }



  // === Unsaved changes and out-of-date results ===
  dirty = signal(false);
  private drillPicking: ((reportId: string) => void) | null = null;

  /**
   * Any edit marks the report unsaved. Data changes also mark the result out of date (it stays on screen);
   * presentation-only changes (layout, chart, formats, colour rules, drill links) re-render without a re-run.
   */
  onPanelEvent(ev: Event) {
    const t = ev.target as HTMLElement;
    if (t.closest('.fx-search')) return; // searching the catalogue is not an edit
    if (ev.type === 'click' && !t.closest('.fx-link, .fx-seg button, .fx-chart-types button, .fx-chosen button, .fx-icon-btn')) return;
    this.markEdited(!!t.closest('[data-presentation]'));
  }

  markEdited(presentationOnly = false) {
    this.dirty.set(true);
    if (!presentationOnly && this.previewResult()) this.stale.set(true);
  }

  /** Column order = chip order. Drag a chip, or focus it and use ← / →. */
  dropColumn(e: CdkDragDrop<unknown>) {
    this.moveColumn(e.previousIndex, e.currentIndex);
  }

  moveColumn(from: number, to: number) {
    const list = [...this.selectedFields()];
    if (from === to || to < 0 || to >= list.length) return;
    moveItemInArray(list, from, to);
    const pos = new Map(list.map((f, i) => [f.field.fieldId, i + 1]));
    this.fieldSelections.update((all) => all.map((f) => (pos.has(f.field.fieldId) ? { ...f, order: pos.get(f.field.fieldId)! } : f)));
    this.orderSeq = list.length + 1;
    const order = list.map((f) => this.columnLabel(f));
    this.previewColumns.update((cols) => [...cols].sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999)));
    this.markEdited(true);
  }

  onChipKey(e: KeyboardEvent, i: number) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const to = i + (e.key === 'ArrowLeft' ? -1 : 1);
    this.moveColumn(i, to);
    setTimeout(() => (document.querySelectorAll<HTMLElement>('.fx-chip[cdkDrag], .fx-chip.cdk-drag')[to])?.focus());
  }


  private runIfNoPrompts() {
    if (!this.parameters().length && !this.runDisabledReason()) this.executePreview();
  }

  private confirmDiscard() {
    if (!this.dirty() || !this.selectedFields().length) return true;
    return confirm(`Discard unsaved changes to "${this.reportTitle() || 'this report'}"?`);
  }

  aggLabel(v: string) {
    return AGGREGATION_OPTIONS.find((a) => a.value === v)?.label || '';
  }

  /** Saved filter values come back as objects/arrays; turn them into what the filter row edits. */
  private filterValueToText(f: FilterDto): string {
    if (f.value == null) return '';
    if (f.operator === 'relative' && typeof f.value === 'object') {
      const v = f.value as { unit: string; offset: number; anchor: string };
      const p = RELATIVE_DATE_PRESETS.find(
        (x) => x.value.unit === v.unit && x.value.offset === v.offset && x.value.anchor === v.anchor
      );
      return p ? p.label : '';
    }
    if (Array.isArray(f.value)) return f.value.join(', ');
    return String(f.value);
  }

  /** Summary columns say what the number is ("Total of Net Amount"); detail mode keeps the plain column name. */
  columnLabel(fs: FieldSelection): string {
    if (this.groupingMode() === 'detail' && this.hasGroupings()) return fs.field.displayLabel;
    return summaryLabel(fs.aggregate, fs.field.displayLabel);
  }

  isNumber(v: any) {
    return typeof v === 'number';
  }



  addJoinById(relationshipId: string) {
    const rel = this.availableRelationships().find((r) => r.relationshipId === +relationshipId);
    if (rel) this.addJoin(rel);
  }

  joinedEntityName(r: ReportRelationship) {
    return r.primaryEntityId === this.selectedEntityId() ? r.foreignEntityName : r.primaryEntityName;
  }

  filterSummary() {
    const n = this.filters().length;
    return n ? `${n} filter${n > 1 ? 's' : ''} · ${this.filterLogic().toUpperCase()}` : 'None';
  }

  sortSummary() {
    const parts: string[] = [];
    for (const s of this.sortings()) parts.push(`${this.getFieldLabel(s.fieldId)} ${s.direction}`);
    if (this.topNEnabled()) parts.push(`${this.topNDirection() === 'top' ? 'Top' : 'Bottom'} ${this.topNCount()}`);
    if (this.distinctEnabled()) parts.push('Distinct');
    return parts.join(' · ') || 'None';
  }

  runDisabledReason(): string {
    if (!this.selectedEntityId()) return 'Select a module and data set first';
    if (this.selectedFields().length === 0) return 'Select at least one column';
    return '';
  }

  openLoadDialog() {
    this.openLibrary('reports');
  }

  loadReport(reportId: string) {
    if (this.drillPicking) { this.drillPicking(reportId); return; }
    if (!this.confirmDiscard()) return;
    this.dialog.closeAll();
    this.api.getSavedReport(reportId).subscribe({
      next: (detail) => {
        this.view.set('builder');
        this.currentReportId.set(detail.reportId);
        this.currentReportName.set(detail.name);
        this.currentOwnerId.set(detail.ownerId || 'me');
        this.currentOwnerName.set(detail.ownerName || '');
        this.dirty.set(false);
        this.restoreConfig(detail.configuration, () => this.runIfNoPrompts());
      },
      error: () => this.snackBar.open('Failed to load report', 'OK', { duration: 5000 }),
    });
  }

  deleteReport(reportId: string) {
    const name = this.savedReports().find((r) => r.reportId === reportId)?.name;
    if (!confirm(`Delete "${name}"? People it was shared with will lose it too.`)) return;
    this.api.deleteReport(reportId).subscribe({
      next: () => {
        this.savedReports.update((r) => r.filter((rr) => rr.reportId !== reportId));
        if (this.currentReportId() === reportId) {
          this.currentReportId.set(null);
          this.currentReportName.set('');
        }
        this.snackBar.open('Report deleted', 'OK', { duration: 2000 });
      },
      error: () => this.snackBar.open('Delete failed', 'OK', { duration: 5000 }),
    });
  }

  cloneTemplate(templateId: string) {
    if (!this.confirmDiscard()) return;
    this.dialog.closeAll();
    this.api.cloneFromTemplate(templateId).subscribe({
      next: (detail) => {
        this.view.set('builder');
        this.currentReportId.set(detail.reportId);
        this.currentReportName.set(detail.name);
        this.dirty.set(false);
        this.restoreConfig(detail.configuration, () => this.runIfNoPrompts());
      },
      error: () => this.snackBar.open('Failed to create from template', 'OK', { duration: 5000 }),
    });
  }

  private restoreConfig(config: ReportConfigurationDto, onReady?: () => void) {
    let pending = 2;
    const done = () => { if (--pending === 0) onReady?.(); };
    this.reportTitle.set(config.title || '');
    this.layoutType.set((config.layoutType as any) || 'Table');
    this.orientation.set((config.orientation as any) || 'Portrait');
    this.parameters.set(config.parameters || []);
    this.conditionalFormats.set(config.conditionalFormats || []);
    if (config.visualizations && config.layout) {
      this.dashboardEnabled.set(true);
      this.dashboardWidgets.set(config.visualizations);
      this.dashboardColumns.set(config.layout.columns || 2);
      this.dashboardLayout.set(config.layout.items || []);
    } else {
      this.dashboardEnabled.set(false);
      this.dashboardWidgets.set([]);
      this.dashboardLayout.set([]);
    }
    this.drillThroughConfigs.set(config.drillThrough || []);
    this.previewResult.set(null);
    this.previewColumns.set([]);
    this.errorMessage.set(null);

    const moduleId = config.moduleId;
    this.selectedModuleId.set(moduleId);

    this.api.getEntities(moduleId).subscribe((entities) => {
      this.entities.set(entities);
      const entityId = config.dataConfiguration.primaryEntityId;
      this.selectedEntityId.set(entityId);

      this.api.getFields(entityId).subscribe((fields) => {
        this.fields.set(fields);
        // PRD 6.11: columns withdrawn from the catalogue are listed, and the report opens without them
        const known = new Set(fields.map((f) => f.fieldId));
        const missing = config.dataConfiguration.selectedFields.filter((f) => !known.has(f.fieldId));
        const gone = new Set(missing.map((f) => f.fieldId));
        this.withdrawn.set(missing.map((f) => f.label || 'Field ' + f.fieldId));
        this.groupingMode.set(config.dataConfiguration.groupingMode || 'summary');
        this.showGrandTotal.set(config.dataConfiguration.showGrandTotal !== false);
        this.groupsStart.set(config.dataConfiguration.groupsStart || 'auto');
        this.calcs.set(config.dataConfiguration.calculatedColumns || []);
        this.columnLayout.set(config.columnLayout || {});
        const selectedFieldIds = new Set(config.dataConfiguration.selectedFields.map((f) => f.fieldId));
        const savedOrder = new Map(config.dataConfiguration.selectedFields.map((f, i) => [f.fieldId, i + 1]));
        this.orderSeq = savedOrder.size + 1;
        const fieldAggregates = new Map(
          config.dataConfiguration.selectedFields.filter((f) => f.aggregate).map((f) => [f.fieldId, f.aggregate!])
        );
        const fieldFormats = new Map(
          config.dataConfiguration.selectedFields.filter((f) => f.formatPattern).map((f) => [f.fieldId, f.formatPattern!])
        );
        const groupedFieldIds = new Set(config.dataConfiguration.groupings || []);

        this.fieldSelections.set(
          fields
            .filter((f) => f.systemFieldName !== 'TenantId')
            .map((f) => ({
              field: f,
              selected: selectedFieldIds.has(f.fieldId),
              aggregate: fieldAggregates.get(f.fieldId) || '',
              grouped: groupedFieldIds.has(f.fieldId),
              formatPattern: fieldFormats.get(f.fieldId) || '',
              order: savedOrder.get(f.fieldId) || 0,
            }))
        );

        if (config.dataConfiguration.filterGroup) {
          const fg = config.dataConfiguration.filterGroup;
          this.filterLogic.set(fg.logic);
          this.filters.set(
            (fg.filters || []).filter((f) => !gone.has(f.fieldId)).map((f) => this.toFilterRow(f))
          );
        } else {
          this.filters.set([]);
          this.filterLogic.set('and');
        }

        this.sortings.set((config.dataConfiguration.sortings || []).filter((x) => !gone.has(x.fieldId)));

        this.distinctEnabled.set(config.dataConfiguration.distinct || false);

        if (config.dataConfiguration.topN) {
          this.topNEnabled.set(true);
          this.topNCount.set(config.dataConfiguration.topN.count);
          this.topNDirection.set(config.dataConfiguration.topN.direction);
          this.topNFieldId.set(config.dataConfiguration.topN.byFieldId);
        } else {
          this.topNEnabled.set(false);
          this.topNCount.set(10);
          this.topNDirection.set('top');
          this.topNFieldId.set(null);
        }

        if (config.dataConfiguration.having) {
          const hg = config.dataConfiguration.having;
          this.havingLogic.set(hg.logic);
          this.havingFilters.set(
            (hg.filters || []).filter((f) => !gone.has(f.fieldId)).map((f) => this.toFilterRow(f))
          );
        } else {
          this.havingFilters.set([]);
          this.havingLogic.set('and');
        }

        if (config.chartConfig) {
          this.chartType.set(config.chartConfig.chartType as ChartType);
          this.chartLabelField.set(config.chartConfig.labelField);
          this.chartDataFields.set(config.chartConfig.dataFields);
        } else {
          this.chartLabelField.set('');
          this.chartDataFields.set([]);
        }
        done();
      });

      this.api.getRelationships(entityId).subscribe((rels) => {
        this.relationships.set(rels);
        const relatedEntities = config.dataConfiguration.relatedEntities || [];
        if (relatedEntities.length > 0) {
          const joinConfigs: JoinConfig[] = [];
          let completed = 0;
          for (const re of relatedEntities) {
            const rel = rels.find((r) => r.relationshipId === re.relationshipId);
            if (!rel) { completed++; continue; }
            this.api.getFields(re.entityId).subscribe((joinFields) => {
              const entity = entities.find((e) => e.entityId === re.entityId) ||
                ({ entityId: re.entityId, entityName: `Entity ${re.entityId}`, objectType: 'View' } as ReportEntity);
              joinConfigs.push({
                relationship: rel,
                joinType: re.joinType,
                entity,
                fields: joinFields.filter((f) => f.systemFieldName !== 'TenantId'),
                selectedFieldIds: re.selectedFields.map((sf) => sf.fieldId),
              });
              completed++;
              if (completed === relatedEntities.length) { this.joins.set(joinConfigs); done(); }
            });
          }
        } else {
          this.joins.set([]);
          done();
        }
      });
    });
  }

  // === Parameters ===

  /** Date fields a From–To range can be put on (main entity + joined entities). */
  dateFields = computed(() => [
    ...this.fieldSelections().map((f) => f.field).filter((f) => f.dataType === 'Date'),
    ...this.joins().flatMap((j) => j.fields.filter((f) => f.dataType === 'Date')),
  ]);

  /**
   * One step for the most common report input: a From/To parameter pair plus the Between filter that uses them.
   * The run screen shows two Date parameters in a row as a single date range with presets.
   */
  addDateRange(fieldId: string) {
    const field = this.dateFields().find((f) => f.fieldId === +fieldId);
    if (!field) return;
    const taken = new Set(this.parameters().map((p) => p.paramId));
    let n = 1;
    const suffix = () => (n === 1 ? '' : String(n));
    while (taken.has('fromDate' + suffix()) || taken.has('toDate' + suffix())) n++;
    const from = 'fromDate' + suffix(), to = 'toDate' + suffix();
    const today = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const lbl = n === 1 ? 'date' : field.displayLabel;
    this.parameters.update((p) => [
      ...p,
      { paramId: from, label: 'From ' + lbl, dataType: 'Date', defaultValue: iso(new Date(today.getFullYear(), today.getMonth(), 1)) },
      { paramId: to, label: 'To ' + lbl, dataType: 'Date', defaultValue: iso(today) },
    ]);
    this.filters.update((f) => [...f, { fieldId: field.fieldId, operator: 'between', value: '@' + from, value2: '@' + to }]);
    this.openSections.update((s) => new Set([...s, 'filters']));
    this.dirty.set(true);
  }

  addParameter() {
    this.parameters.update((p) => [
      ...p,
      { paramId: `param${p.length + 1}`, label: '', dataType: 'String' },
    ]);
  }

  removeParameter(index: number) {
    this.parameters.update((p) => p.filter((_, i) => i !== index));
  }

  updateParameter(index: number, field: keyof ReportParameterDto, value: any) {
    this.parameters.update((p) =>
      p.map((param, i) => (i === index ? { ...param, [field]: value } : param))
    );
  }

  setParamPromptValue(paramId: string, value: any) {
    this.paramPromptValues.update((v) => ({ ...v, [paramId]: value }));
  }
}
