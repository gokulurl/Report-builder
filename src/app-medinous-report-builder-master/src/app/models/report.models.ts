export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  errors: string[] | null;
}

export interface ReportModule {
  moduleId: number;
  moduleName: string;
  moduleCode: string;
}

export interface ReportEntity {
  entityId: number;
  entityName: string;
  objectType: string;
  /** PRD 5.1: what the entity covers, and what one row represents. */
  description?: string;
  rowMeaning?: string;
}

export interface ReportField {
  fieldId: number;
  systemFieldName: string;
  displayLabel: string;
  description: string | null;
  category: string | null;
  displayOrder: number;
  dataType: string;
  formatPattern: string | null;
  isFilterable: boolean;
  isSortable: boolean;
  isGroupable: boolean;
  isComputed: boolean;
  /** PRD 6.3: column sourced from related data (pre-resolved to one value per row). */
  isRelated?: boolean;
  /** PRD 6.3: restricted column (mobile, passport…). Absent for users without permission; export asks for a reason. */
  isRestricted?: boolean;
  allowedAggregations: string[];
}

export interface ReportRelationship {
  relationshipId: number;
  primaryEntityId: number;
  primaryEntityName: string;
  foreignEntityId: number;
  foreignEntityName: string;
  primaryJoinField: string;
  foreignJoinField: string;
  joinType: string;
}

export interface SelectedFieldDto {
  fieldId: number;
  label?: string;
  aggregate?: string;
  entityId?: number;
  formatPattern?: string;
}

export interface RelatedEntityDto {
  entityId: number;
  relationshipId: number;
  joinType: string;
  selectedFields: SelectedFieldDto[];
}

export interface FilterDto {
  fieldId: number;
  operator: string;
  value?: any;
}

export interface FilterGroupDto {
  logic: 'and' | 'or';
  filters: FilterDto[];
  children?: FilterGroupDto[];
}

export interface SortingDto {
  fieldId: number;
  direction: 'ASC' | 'DESC';
}

export interface TopNConfigDto {
  count: number;
  direction: 'top' | 'bottom';
  byFieldId: number;
}

export interface PaginationConfigDto {
  page: number;
  pageSize: number;
}

export interface DataConfigurationDto {
  primaryEntityId: number;
  relatedEntities?: RelatedEntityDto[];
  selectedFields: SelectedFieldDto[];
  distinct?: boolean;
  filterGroup?: FilterGroupDto;
  groupings?: number[];
  having?: FilterGroupDto;
  sortings?: SortingDto[];
  topN?: TopNConfigDto;
  pagination?: PaginationConfigDto;
  /** PRD 6.5: 'summary' = one row per group; 'detail' = detail rows with a summary under each group and a grand total. */
  groupingMode?: 'summary' | 'detail';
}

export interface ChartExportConfig {
  chartType: string;
  labelField: string;
  dataFields: string[];
}

export interface ReportParameterDto {
  paramId: string;
  label: string;
  dataType: string;
  defaultValue?: any;
  allowedValues?: any[];
  entityFieldId?: number;
}

export interface ConditionalFormatRule {
  targetColumn: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between' | 'contains';
  value: any;
  value2?: any;
  backgroundColor?: string;
  textColor?: string;
  fontWeight?: string;
  icon?: string;
  /** PRD 6.9: which rows the rule colours. Rules apply in order; the first match wins. */
  appliesTo?: 'detail' | 'summary' | 'both';
}

export interface VisualizationConfig {
  id: string;
  type: 'Grid' | 'Bar' | 'Line' | 'Pie' | 'Doughnut' | 'Radar' | 'PolarArea';
  title: string;
  xAxisField?: string;
  yAxisFields?: string[];
}

export interface LayoutItem {
  vizId: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface LayoutConfig {
  type: 'flow' | 'grid';
  columns: number;
  items: LayoutItem[];
}

export interface DrillThroughMapping {
  targetParamId: string;
  sourceColumn: string;
}

export interface DrillThroughConfig {
  sourceColumn: string;
  targetReportId: string;
  targetReportName?: string;
  parameterMappings: DrillThroughMapping[];
}

export interface ReportConfigurationDto {
  title?: string;
  moduleId: number;
  mode: 'preview' | 'export';
  layoutType?: string;
  orientation?: string;
  chartConfig?: ChartExportConfig;
  parameters?: ReportParameterDto[];
  conditionalFormats?: ConditionalFormatRule[];
  visualizations?: VisualizationConfig[];
  layout?: LayoutConfig;
  drillThrough?: DrillThroughConfig[];
  dataConfiguration: DataConfigurationDto;
}

export interface SavedReportDto {
  reportId: string;
  name: string;
  description: string | null;
  moduleId: number;
  ownerId: string;
  isShared: boolean;
  isTemplate: boolean;
  createdAt: string;
  modifiedAt: string;
  ownerName?: string;
  /** PRD 6.11: users the report is shared with, read-only. */
  sharedWith?: string[];
  version?: number;
}

export interface SavedReportDetailDto extends SavedReportDto {
  configuration: ReportConfigurationDto;
}

export interface CreateSavedReportRequest {
  sharedWith?: string[];
  name: string;
  description?: string;
  moduleId: number;
  isShared: boolean;
  isTemplate: boolean;
  configuration: ReportConfigurationDto;
}

export interface UpdateSavedReportRequest {
  name?: string;
  description?: string;
  isShared?: boolean;
  isTemplate?: boolean;
  changeDescription?: string;
  configuration: ReportConfigurationDto;
}

export interface PreviewResponse {
  data: Record<string, any>[];
  totalCount: number;
  page: number;
  pageSize: number;
  executionTimeMs: number;
  truncated: boolean;
  /** PRD 6.5: group summaries produced in the same pass as the rows (detail mode). */
  groups?: GroupSummary[];
  /** PRD 6.5: grand total over the whole result, not the page. */
  grandTotal?: Record<string, any>;
  groupCount?: number;
}

export interface GroupSummary {
  /** Grouped column label → value */
  key: Record<string, any>;
  rowCount: number;
  /** Summarised column label → value for this group */
  summary: Record<string, any>;
  /** Index of this group's first row in `data` (detail mode) */
  start: number;
}

/** PRD 6.8: failures reach the user in plain language with a reference, never as database errors. */
export interface ReportError {
  code: 'TOO_MANY_GROUPS' | 'TIMEOUT' | 'TOO_LARGE' | 'CONFIG' | 'VALIDATION';
  message: string;
  reference: string;
}

export type FilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'between' | 'in' | 'notin'
  | 'isnull' | 'isnotnull'
  | 'contains' | 'startswith' | 'endswith'
  | 'relative';

/** PRD 6.4: operators offered per data type, with the PRD's wording. */
export const OPERATORS_BY_TYPE: Record<string, { value: FilterOperator; label: string }[]> = {
  String: [
    { value: 'eq', label: 'Equals' }, { value: 'neq', label: 'Not Equals' }, { value: 'contains', label: 'Contains' },
    { value: 'startswith', label: 'Starts With' }, { value: 'endswith', label: 'Ends With' }, { value: 'in', label: 'In List' },
    { value: 'notin', label: 'Not In List' }, { value: 'isnull', label: 'Is Empty' }, { value: 'isnotnull', label: 'Is Not Empty' },
  ],
  Number: [
    { value: 'eq', label: 'Equals' }, { value: 'neq', label: 'Not Equals' }, { value: 'gt', label: 'Greater Than' },
    { value: 'lt', label: 'Less Than' }, { value: 'gte', label: 'Greater or Equal' }, { value: 'lte', label: 'Less or Equal' },
    { value: 'between', label: 'Between' }, { value: 'in', label: 'In List' }, { value: 'isnull', label: 'Is Empty' },
    { value: 'isnotnull', label: 'Is Not Empty' },
  ],
  Date: [
    { value: 'eq', label: 'Equals' }, { value: 'neq', label: 'Not Equals' }, { value: 'gt', label: 'After' },
    { value: 'lt', label: 'Before' }, { value: 'gte', label: 'On or After' }, { value: 'lte', label: 'On or Before' },
    { value: 'between', label: 'Between' }, { value: 'relative', label: 'Relative Date' }, { value: 'isnull', label: 'Is Empty' },
    { value: 'isnotnull', label: 'Is Not Empty' },
  ],
  Boolean: [{ value: 'eq', label: 'Equals' }, { value: 'isnull', label: 'Is Empty' }, { value: 'isnotnull', label: 'Is Not Empty' }],
};
OPERATORS_BY_TYPE['Guid'] = OPERATORS_BY_TYPE['String'].filter((o) => ['eq', 'neq', 'in', 'notin', 'isnull', 'isnotnull'].includes(o.value));

export const FILTER_OPERATORS: { value: FilterOperator; label: string; needsValue: boolean; dataTypes?: string[] }[] = [
  { value: 'eq', label: 'Equals', needsValue: true },
  { value: 'neq', label: 'Not Equals', needsValue: true },
  { value: 'gt', label: 'Greater Than', needsValue: true, dataTypes: ['Number', 'Date'] },
  { value: 'gte', label: 'Greater or Equal', needsValue: true, dataTypes: ['Number', 'Date'] },
  { value: 'lt', label: 'Less Than', needsValue: true, dataTypes: ['Number', 'Date'] },
  { value: 'lte', label: 'Less or Equal', needsValue: true, dataTypes: ['Number', 'Date'] },
  { value: 'contains', label: 'Contains', needsValue: true, dataTypes: ['String'] },
  { value: 'startswith', label: 'Starts With', needsValue: true, dataTypes: ['String'] },
  { value: 'endswith', label: 'Ends With', needsValue: true, dataTypes: ['String'] },
  { value: 'in', label: 'In List', needsValue: true },
  { value: 'notin', label: 'Not In List', needsValue: true },
  { value: 'isnull', label: 'Is Null', needsValue: false },
  { value: 'isnotnull', label: 'Is Not Null', needsValue: false },
  { value: 'between', label: 'Between', needsValue: true, dataTypes: ['Number', 'Date'] },
  { value: 'relative', label: 'Relative Date', needsValue: true, dataTypes: ['Date'] },
];

export const RELATIVE_DATE_PRESETS: { label: string; value: { unit: string; offset: number; anchor: string } }[] = [
  { label: 'Last 7 days', value: { unit: 'day', offset: -7, anchor: 'now' } },
  { label: 'Last 30 days', value: { unit: 'day', offset: -30, anchor: 'now' } },
  { label: 'Last 90 days', value: { unit: 'day', offset: -90, anchor: 'now' } },
  { label: 'Last 365 days', value: { unit: 'day', offset: -365, anchor: 'now' } },
  { label: 'This week', value: { unit: 'week', offset: 0, anchor: 'start' } },
  { label: 'Last week', value: { unit: 'week', offset: -1, anchor: 'start' } },
  { label: 'This month', value: { unit: 'month', offset: 0, anchor: 'start' } },
  { label: 'Last month', value: { unit: 'month', offset: -1, anchor: 'start' } },
  { label: 'This quarter', value: { unit: 'quarter', offset: 0, anchor: 'start' } },
  { label: 'Last quarter', value: { unit: 'quarter', offset: -1, anchor: 'start' } },
  { label: 'This year', value: { unit: 'year', offset: 0, anchor: 'start' } },
  { label: 'Last year', value: { unit: 'year', offset: -1, anchor: 'start' } },
];

export const AGGREGATION_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'Count', label: 'COUNT' },
  { value: 'Sum', label: 'SUM' },
  { value: 'Avg', label: 'AVG' },
  { value: 'Min', label: 'MIN' },
  { value: 'Max', label: 'MAX' },
  { value: 'CountDistinct', label: 'COUNT DISTINCT' },
];

export const FORMAT_OPTIONS: { value: string; label: string; dataTypes: string[] }[] = [
  { value: '', label: 'Default', dataTypes: ['Number', 'Date', 'String', 'Boolean', 'Guid'] },
  { value: 'n0', label: 'Whole number (1,234)', dataTypes: ['Number'] },
  { value: 'n2', label: '2 decimals (1,234.56)', dataTypes: ['Number'] },
  { value: 'n3', label: '3 decimals (1,234.567)', dataTypes: ['Number'] },
  { value: 'c0', label: 'Currency (KD 1,234)', dataTypes: ['Number'] },
  { value: 'c2', label: 'Currency (KD 1,234.500)', dataTypes: ['Number'] },
  { value: 'p0', label: 'Percent (56%)', dataTypes: ['Number'] },
  { value: 'p2', label: 'Percent (56.78%)', dataTypes: ['Number'] },
  { value: 'short', label: 'Short date (31/12/2025)', dataTypes: ['Date'] },
  { value: 'medium', label: 'Medium date (31 Dec 2025)', dataTypes: ['Date'] },
  { value: 'long', label: 'Long date (31 December 2025)', dataTypes: ['Date'] },
  { value: 'iso', label: 'ISO date (2025-12-31)', dataTypes: ['Date'] },
  { value: 'datetime', label: 'Date and time (31 Dec 2025 14:30)', dataTypes: ['Date'] },
];

// ---- Run screen & scheduling (UI redesign; back end endpoints still to be built — see NOTES-for-backend.md) ----

export type ScheduleFrequency = 'Daily' | 'Weekly' | 'Monthly';
export type ScheduleFormat = 'Excel' | 'PDF' | 'CSV';

/** Rolling periods a scheduled run resolves its date parameters to. */
export const SCHEDULE_DATE_RANGES = ['Previous day', 'Previous 7 days', 'Month to date', 'Previous month'] as const;

export interface ReportScheduleDto {
  scheduleId: string;
  reportId: string;
  reportName: string;
  moduleId: number;
  frequency: ScheduleFrequency;
  time: string;              // HH:mm
  dayOfWeek?: number;        // 0 = Sunday, for Weekly
  dayOfMonth?: number;       // 1–28, for Monthly
  dateRange?: string;        // one of SCHEDULE_DATE_RANGES, used for the report's date parameters
  parameters: Record<string, any>;
  deliverNotification: boolean;
  deliverEmail: boolean;
  emails: string;
  format: ScheduleFormat;
  active: boolean;
  nextRun: string;           // ISO
  lastRun?: string;
  lastStatus?: 'Delivered' | 'Failed';
}

export type SaveScheduleRequest = Omit<ReportScheduleDto, 'scheduleId' | 'nextRun' | 'lastRun' | 'lastStatus'>;

// ---- Publishing, sharing, favourites (PRD 6.7, 6.11) ----

export interface AppUser {
  userId: string;
  name: string;
  department: string;
}

/** A report placed inside a module: live (re-runs) or snapshot (stored result, never re-run). */
export interface PublicationDto {
  publicationId: string;
  reportId: string;
  reportName: string;
  description: string | null;
  moduleId: number;
  type: 'live' | 'snapshot';
  /** Snapshot label, unique per module per day */
  label?: string;
  publishedBy: string;
  publishedAt: string;
  removed?: boolean;
  removedBy?: string;
  removedAt?: string;
  /** Snapshot only: the stored result and the parameter values it ran with */
  snapshot?: { result: PreviewResponse; ranWith: { label: string; value: string }[]; runAt: string };
}

export interface ReportVersionDto {
  version: number;
  savedAt: string;
  savedBy: string;
  changeDescription: string;
}

export interface ParameterFavourite {
  name: string;
  values: Record<string, any>;
}
