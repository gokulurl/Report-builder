import { ConditionalFormatRule, ReportConfigurationDto, ReportError } from '../models/report.models';
import { HOSPITAL, mediumDate, mediumDateTime, money } from './hospital-settings';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

/**
 * Display a cell value. Numbers and dates follow hospital settings (KD, 3 decimals; "29 Sep 2026").
 * Unformatted dates still show as medium dates, and empty values stay blank (PRD 6.8).
 */
export function formatValue(value: any, pattern: string | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' || (pattern && /^[cnp]\d$/.test(pattern))) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return String(value);
    const fixed = (n: number, d: number) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    // n0–n4 decimals, p0–p4 percent (value stored as a fraction), c0 whole currency, c2 hospital currency decimals, c1/c3/c4 explicit
    const m = /^([ncp])(\d)$/.exec(pattern || '');
    if (m) {
      const d = Number(m[2]);
      if (m[1] === 'n') return fixed(num, d);
      if (m[1] === 'p') return fixed(num * 100, d) + '%';
      return money(num, pattern === 'c2' ? undefined : d);
    }
    return num.toLocaleString('en-US', { maximumFractionDigits: 3 });
  }
  if (typeof value === 'string' && ISO_DATE.test(value)) {
    const date = new Date(value.length === 10 ? value + 'T00:00:00' : value);
    if (isNaN(date.getTime())) return value;
    switch (pattern) {
      case 'short': return date.toLocaleDateString('en-GB');
      case 'long': return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      case 'iso': return value.slice(0, 10);
      case 'datetime': return mediumDateTime(date);
      default: return mediumDate(date);
    }
  }
  return String(value);
}

/** PRD 6.5 naming: "Total of Net Amount", "Count of Request No." */
export function summaryLabel(aggregate: string | undefined, label: string): string {
  switch (aggregate) {
    case 'Count': return 'Count of ' + label;
    case 'CountDistinct': return 'Count of distinct ' + label;
    case 'Sum': return 'Total of ' + label;
    case 'Avg': return 'Average of ' + label;
    case 'Min': return 'Minimum of ' + label;
    case 'Max': return 'Maximum of ' + label;
    default: return label;
  }
}

/** First matching rule wins (PRD 6.9); rules can be limited to detail rows or summary rows. */
export function cellStyle(value: any, col: string, rules: ConditionalFormatRule[] | undefined, rowKind: 'detail' | 'summary' = 'detail'): Record<string, string> {
  for (const rule of (rules || []).filter((r) => r.targetColumn === col)) {
    const scope = rule.appliesTo || 'both';
    if (scope !== 'both' && scope !== rowKind) continue;
    if (!matches(value, rule)) continue;
    const style: Record<string, string> = {};
    if (rule.backgroundColor) style['background-color'] = rule.backgroundColor;
    if (rule.textColor) style['color'] = rule.textColor;
    if (rule.fontWeight) style['font-weight'] = rule.fontWeight;
    return style;
  }
  return {};
}

export function matches(cell: any, rule: ConditionalFormatRule): boolean {
  if (cell == null || rule.value === '') return false;
  const a = typeof cell === 'number' ? cell : parseFloat(cell);
  const b = parseFloat(rule.value);
  const num = !isNaN(a) && !isNaN(b);
  switch (rule.operator) {
    case 'gt': return num && a > b;
    case 'gte': return num && a >= b;
    case 'lt': return num && a < b;
    case 'lte': return num && a <= b;
    case 'eq': return num ? a === b : String(cell) === String(rule.value);
    case 'neq': return num ? a !== b : String(cell) !== String(rule.value);
    case 'between': { const c = parseFloat(rule.value2); return num && !isNaN(c) && a >= b && a <= c; }
    case 'contains': return String(cell).toLowerCase().includes(String(rule.value).toLowerCase());
    default: return false;
  }
}

/** Display format of a calculated column: its own, else percent for the percent operations, else a number with its decimals. */
export function calcFormat(c: { operation: string; decimals: number; formatPattern?: string }) {
  if (c.formatPattern) return c.formatPattern;
  return (c.operation === 'percentOf' || c.operation === 'percentDiff' ? 'p' : 'n') + Math.max(0, Math.min(4, c.decimals ?? 2));
}

/** Column label → { aggregate, formatPattern } from a saved report's config. */
export function columnMeta(config: ReportConfigurationDto) {
  const meta = new Map<string, { aggregate?: string; formatPattern?: string; fieldId?: number }>();
  for (const f of config.dataConfiguration.selectedFields) if (f.label) meta.set(f.label, f);
  for (const re of config.dataConfiguration.relatedEntities || [])
    for (const f of re.selectedFields) if (f.label) meta.set(f.label, f);
  for (const c of config.dataConfiguration.calculatedColumns || [])
    meta.set(c.name, { formatPattern: calcFormat(c), aggregate: /divide|percent/i.test(c.operation) ? 'Recalc' : c.aggregate || 'Sum' });
  return meta;
}

/**
 * Fallback grand total when the server doesn't send one: COUNT/SUM and plain numbers add up, MIN/MAX take the extreme,
 * AVG and COUNT DISTINCT stay blank because they can't be derived from grouped rows.
 */
export function computeTotals(data: Record<string, any>[], columns: string[], config: ReportConfigurationDto) {
  if (data.length < 2) return null;
  const meta = columnMeta(config);
  const cells: Record<string, { value: number | null; note?: string }> = {};
  let any = false;
  for (const col of columns) {
    const vals = data.map((r) => r[col]).filter((v) => typeof v === 'number') as number[];
    if (!vals.length) continue;
    const agg = meta.get(col)?.aggregate || '';
    if (agg === 'Recalc') { cells[col] = { value: null, note: 'A ratio or percent total is recalculated from the column totals, which the server provides' }; continue; }
    if (agg === 'Avg' || agg === 'CountDistinct') {
      cells[col] = { value: null, note: agg === 'Avg' ? 'An overall average needs the server — averaging the rows would be wrong' : 'Distinct counts can overlap between rows, so they cannot be added up' };
      continue;
    }
    cells[col] = { value: agg === 'Min' ? Math.min(...vals) : agg === 'Max' ? Math.max(...vals) : Math.round(vals.reduce((a, b) => a + b, 0) * 1000) / 1000 };
    any = true;
  }
  return any ? cells : null;
}

export const CHART_COLORS = ['#0065cb', '#fe6300', '#2e9d6b', '#7a5af8', '#c99a06', '#0e9fb5', '#b42318', '#64748b', '#1d4ed8', '#0f766e'];
export const MAX_CHART_CATEGORIES = 50;

/** Parameter/criteria values in summaries: ISO dates as "29 Sep 2026", empty as "All". */
export function displayDate(iso: string) {
  if (!iso) return iso;
  return ISO_DATE.test(iso) ? mediumDate(new Date(iso.slice(0, 10) + 'T00:00:00')) : iso;
}

// ---------------- PRD 7.1 value validation ----------------

const NUMBER_RX = /^-?\d+(\.\d+)?$/;

/** Returns the PRD's message for an invalid filter value, or '' when it's fine. Parameter references (@id) are checked at run time. */
export function validateFilterValue(dataType: string, operator: string, value: string, value2?: string): string {
  const needsValue = !['isnull', 'isnotnull'].includes(operator);
  if (!needsValue) return '';
  const v = (value ?? '').trim();
  const v2 = (value2 ?? '').trim();
  if (operator === 'relative') return v ? '' : 'Choose a period';
  if (!v || (operator === 'between' && !v2)) return 'Enter a value';
  const isParam = (x: string) => x.startsWith('@');
  if (operator === 'in' || operator === 'notin') {
    const items = v.split(',').map((x) => x.trim()).filter(Boolean);
    if (!items.length) return 'Enter at least one value, separated by commas';
    if (items.length > 200) return 'A list can hold up to 200 values';
    if (dataType === 'Number' && items.some((x) => !isParam(x) && !NUMBER_RX.test(x))) return 'Enter a number, for example 1234.56';
    return '';
  }
  if (dataType === 'String' && ['contains', 'startswith', 'endswith'].includes(operator) && !isParam(v) && v.length < 2) return 'Enter at least two characters';
  if (dataType === 'Number') {
    for (const x of [v, operator === 'between' ? v2 : '']) if (x && !isParam(x) && !NUMBER_RX.test(x)) return 'Enter a number, for example 1234.56';
    if (operator === 'between' && !isParam(v) && !isParam(v2) && Number(v) > Number(v2)) return 'The first value must not be greater than the second';
  }
  if (dataType === 'Date') {
    for (const x of [v, operator === 'between' ? v2 : '']) {
      if (!x || isParam(x)) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x) || isNaN(new Date(x).getTime())) return 'Enter a valid date';
      const y = Number(x.slice(0, 4));
      if (y < 1900 || y > new Date().getFullYear() + 100) return `Enter a date between 1900 and ${new Date().getFullYear() + 100}`;
    }
    if (operator === 'between' && !isParam(v) && !isParam(v2) && v > v2) return 'The first date must not be later than the second';
  }
  return '';
}

/** PRD 7: parameter identifiers are unique, start with a letter and contain only letters and digits. */
export function validateParamId(id: string, all: string[]): string {
  if (!id) return 'Enter an identifier';
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(id)) return 'Start with a letter; use letters and digits only';
  if (all.filter((x) => x === id).length > 1) return 'Each parameter needs a different identifier';
  return '';
}

// ---------------- PRD 6.8 plain-language failures ----------------

export function newReference() {
  return 'RB-' + Date.now().toString(36).toUpperCase().slice(-6);
}

/** Map any HTTP error to the PRD's user-facing message. Database text never reaches the screen. */
export function toReportError(err: any): ReportError {
  const body = err?.error || {};
  const reference = body.reference || newReference();
  switch (body.code) {
    case 'TOO_MANY_GROUPS': return { code: 'TOO_MANY_GROUPS', message: 'The grouping produces too many groups; add a filter or group differently.', reference };
    case 'TIMEOUT': return { code: 'TIMEOUT', message: 'The report took too long; narrow it down with better parameters.', reference };
    default: return { code: 'CONFIG', message: 'The data source has a configuration problem; contact the administrator.', reference };
  }
}

export const HOSPITAL_NAME = HOSPITAL.name;
