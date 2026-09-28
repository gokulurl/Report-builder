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
}

export interface SavedReportDetailDto extends SavedReportDto {
  configuration: ReportConfigurationDto;
}

export interface CreateSavedReportRequest {
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
}

export type FilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'between' | 'in' | 'notin'
  | 'isnull' | 'isnotnull'
  | 'contains' | 'startswith' | 'endswith'
  | 'relative';

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
  { value: 'in', label: 'In (comma-separated)', needsValue: true },
  { value: 'isnull', label: 'Is Null', needsValue: false },
  { value: 'isnotnull', label: 'Is Not Null', needsValue: false },
  { value: 'between', label: 'Between', needsValue: true, dataTypes: ['Number', 'Date'] },
  { value: 'relative', label: 'Relative Date', needsValue: true, dataTypes: ['Date'] },
];

export const RELATIVE_DATE_PRESETS: { label: string; value: { unit: string; offset: number; anchor: string } }[] = [
  { label: 'Last 7 days', value: { unit: 'day', offset: -7, anchor: 'now' } },
  { label: 'Last 30 days', value: { unit: 'day', offset: -30, anchor: 'now' } },
  { label: 'Last 90 days', value: { unit: 'day', offset: -90, anchor: 'now' } },
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
  { value: 'n0', label: 'Integer (1,234)', dataTypes: ['Number'] },
  { value: 'n2', label: '2 Decimals (1,234.56)', dataTypes: ['Number'] },
  { value: 'n4', label: '4 Decimals (1,234.5678)', dataTypes: ['Number'] },
  { value: 'c0', label: 'Currency ($1,234)', dataTypes: ['Number'] },
  { value: 'c2', label: 'Currency ($1,234.56)', dataTypes: ['Number'] },
  { value: 'p0', label: 'Percent (56%)', dataTypes: ['Number'] },
  { value: 'p2', label: 'Percent (56.78%)', dataTypes: ['Number'] },
  { value: 'short', label: 'Short Date (31/12/2025)', dataTypes: ['Date'] },
  { value: 'medium', label: 'Medium Date (31 Dec 2025)', dataTypes: ['Date'] },
  { value: 'long', label: 'Long Date (31 December 2025)', dataTypes: ['Date'] },
  { value: 'iso', label: 'ISO Date (2025-12-31)', dataTypes: ['Date'] },
  { value: 'datetime', label: 'Date & Time (31/12/2025 14:30)', dataTypes: ['Date'] },
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
