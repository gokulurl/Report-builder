import { ConditionalFormatRule, ReportConfigurationDto } from '../models/report.models';

/** Same formatting rules as the builder grid (report-builder.ts applyFormat), shared with the run screen. */
export function formatValue(value: any, pattern: string | undefined): string {
  if (value == null) return '';
  if (!pattern) return String(value);
  if (typeof value === 'number' || /^[cnp]\d$/.test(pattern)) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return String(value);
    switch (pattern) {
      case 'n0': return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
      case 'n2': return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'n4': return num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      case 'c0': return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
      case 'c2': return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
      case 'p0': return (num * 100).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '%';
      case 'p2': return (num * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
      default: return String(value);
    }
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  switch (pattern) {
    case 'short': return date.toLocaleDateString('en-GB');
    case 'medium': return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
    case 'long': return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    case 'iso': return date.toISOString().slice(0, 10);
    case 'datetime': return date.toLocaleDateString('en-GB') + ' ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    default: return String(value);
  }
}

export function cellStyle(value: any, col: string, rules: ConditionalFormatRule[] | undefined): Record<string, string> {
  for (const rule of (rules || []).filter((r) => r.targetColumn === col)) {
    if (!matches(value, rule)) continue;
    const style: Record<string, string> = {};
    if (rule.backgroundColor) style['background-color'] = rule.backgroundColor;
    if (rule.textColor) style['color'] = rule.textColor;
    if (rule.fontWeight) style['font-weight'] = rule.fontWeight;
    return style;
  }
  return {};
}

function matches(cell: any, rule: ConditionalFormatRule): boolean {
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

/** Column label → { aggregate, formatPattern } from a saved report's config. */
export function columnMeta(config: ReportConfigurationDto) {
  const meta = new Map<string, { aggregate?: string; formatPattern?: string }>();
  for (const f of config.dataConfiguration.selectedFields) if (f.label) meta.set(f.label, f);
  for (const re of config.dataConfiguration.relatedEntities || [])
    for (const f of re.selectedFields) if (f.label) meta.set(f.label, f);
  return meta;
}

/**
 * Grand-total row (same rules as the builder): COUNT/SUM and plain numbers add up, MIN/MAX take the extreme,
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

/** dd/MM/yyyy for ISO dates in parameter summaries. */
export function displayDate(iso: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
