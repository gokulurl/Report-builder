// Dev-only: answers /api/v1/reports/* in the browser so the UI runs without the .NET API.
// Remove `withInterceptors([mockApiInterceptor])` in app.config.ts to talk to the real backend.
import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of, delay, throwError, timer, mergeMap } from 'rxjs';
import {
  ReportConfigurationDto,
  FilterDto,
  FilterGroupDto,
  SavedReportDetailDto,
  RELATIVE_DATE_PRESETS,
  GroupSummary,
} from '../models/report.models';
import { MODULES, ENTITIES, FIELDS, RELATIONSHIPS, ROWS, SEED_REPORTS, SEED_SCHEDULES, SEED_PUBLICATIONS, USERS } from './mock-data';
import { PublicationDto, ReportScheduleDto, ReportVersionDto } from '../models/report.models';

const PUB_KEY = 'mock-publications-v1';
let publications: PublicationDto[] = (() => {
  try { const raw = localStorage.getItem(PUB_KEY); if (raw) return JSON.parse(raw); } catch {}
  return structuredClone(SEED_PUBLICATIONS);
})();
function persistPublications() { try { localStorage.setItem(PUB_KEY, JSON.stringify(publications)); } catch {} }
const versions: Record<string, ReportVersionDto[]> = {};
const audit: any[] = [];
let requestSeq = 1040;
const ref = () => 'RB-' + Date.now().toString(36).toUpperCase().slice(-6);

const SCHED_KEY = 'mock-schedules-v1';
let schedules: ReportScheduleDto[] = (() => {
  try { const raw = localStorage.getItem(SCHED_KEY); if (raw) return JSON.parse(raw); } catch {}
  return structuredClone(SEED_SCHEDULES);
})();
function persistSchedules() { try { localStorage.setItem(SCHED_KEY, JSON.stringify(schedules)); } catch {} }

/** Next occurrence of a schedule from now (local time). */
function nextRun(s: Pick<ReportScheduleDto, 'frequency' | 'time' | 'dayOfWeek' | 'dayOfMonth'>): string {
  const [h, m] = s.time.split(':').map(Number);
  const d = new Date(); d.setSeconds(0, 0);
  const at = new Date(d); at.setHours(h, m);
  if (s.frequency === 'Daily') { if (at <= d) at.setDate(at.getDate() + 1); }
  else if (s.frequency === 'Weekly') { const want = s.dayOfWeek ?? 0; let add = (want - at.getDay() + 7) % 7; if (add === 0 && at <= d) add = 7; at.setDate(at.getDate() + add); }
  else { at.setDate(s.dayOfMonth ?? 1); if (at <= d) at.setMonth(at.getMonth() + 1); }
  return at.toISOString();
}

const STORE_KEY = 'mock-saved-reports-v5';
function loadStore(): SavedReportDetailDto[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return structuredClone(SEED_REPORTS);
}
let saved = loadStore();
function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch {}
}

const ok = (data: any) => ({ success: true, data, message: '', errors: null });
const summary = ({ configuration, ...rest }: SavedReportDetailDto) => rest;

export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  const m = req.url.match(/\/api\/v1\/reports(\/.*)?$/);
  if (!m) return next(req);
  const path = (m[1] || '').split('?')[0];
  const body: any = req.body;
  let result: any;
  let seg: RegExpMatchArray | null;

  try {
    if (req.method === 'GET' && path === '/modules') result = ok(MODULES);
    else if ((seg = path.match(/^\/modules\/(\d+)\/entities$/)))
      result = ok(ENTITIES.filter((e) => e.moduleId === +seg![1]));
    else if ((seg = path.match(/^\/entities\/(\d+)\/fields$/)))
      result = ok(FIELDS.filter((f) => f.entityId === +seg![1]));
    else if ((seg = path.match(/^\/entities\/(\d+)\/relationships$/)))
      result = ok(RELATIONSHIPS.filter((r) => r.primaryEntityId === +seg![1] || r.foreignEntityId === +seg![1]));
    else if (req.method === 'POST' && path === '/preview') result = ok(runQuery(body));
    else if (req.method === 'POST' && path.startsWith('/export/')) {
      const res = runQuery(body);
      const cols = res.data.length ? Object.keys(res.data[0]) : [];
      const csv = [cols.join(','), ...res.data.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
      return of(new HttpResponse({ status: 200, body: new Blob(['﻿' + csv], { type: 'text/csv' }) })).pipe(delay(400));
    } else if (req.method === 'GET' && path === '/saved') result = ok(saved.filter((r) => !r.isTemplate).map(summary));
    else if (req.method === 'GET' && path === '/templates') result = ok(saved.filter((r) => r.isTemplate).map(summary));
    else if (req.method === 'GET' && (seg = path.match(/^\/saved\/([^/]+)$/)))
      result = ok(structuredClone(saved.find((r) => r.reportId === seg![1])));
    else if (req.method === 'POST' && path === '/saved') {
      const now = new Date().toISOString();
      const rec: SavedReportDetailDto = { ...body, reportId: 'rpt-' + Date.now(), ownerId: 'me', ownerName: 'Gokul M', version: 1, createdAt: now, modifiedAt: now };
      saved.push(rec);
      persist();
      result = ok(rec);
    } else if (req.method === 'PUT' && (seg = path.match(/^\/saved\/([^/]+)$/))) {
      const rec = saved.find((r) => r.reportId === seg![1])!;
      Object.assign(rec, body, { modifiedAt: new Date().toISOString() });
      const list = (versions[rec.reportId] ||= [{ version: 1, savedAt: rec.createdAt, savedBy: rec.ownerName || 'Gokul M', changeDescription: 'Created' }]);
      list.push({ version: list.length + 1, savedAt: rec.modifiedAt, savedBy: 'Gokul M', changeDescription: body.changeDescription || 'Saved' });
      rec.version = list.length;
      persist();
      result = ok(rec);
    } else if (req.method === 'DELETE' && (seg = path.match(/^\/saved\/([^/]+)$/))) {
      saved = saved.filter((r) => r.reportId !== seg![1]);
      persist();
      result = ok(null);
    } else if (req.method === 'POST' && (seg = path.match(/^\/saved\/([^/]+)\/use-as-template$/))) {
      const tpl = saved.find((r) => r.reportId === seg![1])!;
      const now = new Date().toISOString();
      const rec: SavedReportDetailDto = {
        ...structuredClone(tpl),
        reportId: 'rpt-' + Date.now(),
        name: tpl.name + ' (copy)',
        isTemplate: false,
        isShared: false,
        ownerId: 'me',
        createdAt: now,
        modifiedAt: now,
      };
      saved.push(rec);
      persist();
      result = ok(rec);
    } else if (req.method === 'GET' && (seg = path.match(/^\/fields\/(\d+)\/values$/))) {
      const f = FIELDS.find((x) => x.fieldId === +seg![1]);
      const vals = f ? [...new Set((ROWS[f.entityId] || []).map((r) => r[f.systemFieldName]).filter((v) => v != null && v !== ''))] : [];
      result = ok(vals.map(String).sort((a, b) => a.localeCompare(b)));
    } else if (req.method === 'GET' && path === '/users') {
      result = ok(USERS);
    } else if (req.method === 'GET' && (seg = path.match(/^\/saved\/([^/]+)\/versions$/))) {
      const r = saved.find((x) => x.reportId === seg![1]);
      result = ok(versions[seg[1]] || (r ? [{ version: 1, savedAt: r.createdAt, savedBy: r.ownerName || 'Gokul M', changeDescription: 'Created' }] : []));
    } else if (req.method === 'GET' && path === '/publications') {
      result = ok(publications);
    } else if (req.method === 'POST' && path === '/publications') {
      const day = new Date().toISOString().slice(0, 10);
      if (body.type === 'snapshot' && publications.some((x) => !x.removed && x.type === 'snapshot' && x.moduleId === body.moduleId && x.label === body.label && x.publishedAt.slice(0, 10) === day))
        throw { code: 'DUPLICATE_LABEL' };
      const rec: PublicationDto = { ...body, publicationId: 'pub-' + Date.now(), publishedBy: 'Gokul M', publishedAt: new Date().toISOString() };
      publications.push(rec); persistPublications(); audit.push({ action: 'publish', rec, at: new Date() }); result = ok(rec);
    } else if (req.method === 'DELETE' && (seg = path.match(/^\/publications\/([^/]+)$/))) {
      const rec = publications.find((x) => x.publicationId === seg![1])!;
      Object.assign(rec, { removed: true, removedBy: 'Gokul M', removedAt: new Date().toISOString() });
      persistPublications(); audit.push({ action: 'remove', id: rec.publicationId, at: new Date() }); result = ok(rec);
    } else if (req.method === 'POST' && (seg = path.match(/^\/publications\/([^/]+)\/restore$/))) {
      const rec = publications.find((x) => x.publicationId === seg![1])!;
      Object.assign(rec, { removed: false, removedBy: undefined, removedAt: undefined });
      persistPublications(); audit.push({ action: 'restore', id: rec.publicationId, at: new Date() }); result = ok(rec);
    } else if (req.method === 'POST' && path === '/column-requests') {
      audit.push({ action: 'column-request', body, at: new Date() });
      result = ok({ reference: 'CR-' + ++requestSeq });
    } else if (req.method === 'POST' && path === '/audit/export') {
      audit.push({ action: 'export', body, at: new Date() });
      result = ok({ reference: ref() });
    } else if (req.method === 'GET' && path === '/schedules') {
      result = ok(schedules);
    } else if (req.method === 'POST' && path === '/schedules') {
      const rec: ReportScheduleDto = { ...body, scheduleId: 'sch-' + Date.now(), nextRun: nextRun(body) };
      schedules.push(rec); persistSchedules(); result = ok(rec);
    } else if (req.method === 'PUT' && (seg = path.match(/^\/schedules\/([^/]+)$/))) {
      const rec = schedules.find((x) => x.scheduleId === seg![1])!;
      Object.assign(rec, body); rec.nextRun = nextRun(rec); persistSchedules(); result = ok(rec);
    } else if (req.method === 'DELETE' && (seg = path.match(/^\/schedules\/([^/]+)$/))) {
      schedules = schedules.filter((x) => x.scheduleId !== seg![1]); persistSchedules(); result = ok(null);
    } else if (req.method === 'POST' && (seg = path.match(/^\/schedules\/([^/]+)\/run$/))) {
      const rec = schedules.find((x) => x.scheduleId === seg![1])!;
      rec.lastRun = new Date().toISOString(); rec.lastStatus = 'Delivered'; persistSchedules(); result = ok(rec);
    } else return next(req);
  } catch (e: any) {
    // Coded failures (PRD 6.8) carry a reference; anything else is reported as a configuration problem.
    const error = { success: false, code: e?.code || 'CONFIG', reference: ref() };
    return timer(250).pipe(mergeMap(() => throwError(() => new HttpErrorResponse({ status: 400, error, url: req.url }))));
  }
  const slow = req.method === 'POST' && path === '/preview' && /outstanding/i.test(body?.title || '');
  return of(new HttpResponse({ status: 200, body: result })).pipe(delay(slow ? 5000 : 250));
};

// ---------- query engine ----------
type Row = Record<number, any>; // keyed by fieldId

function runQuery(config: ReportConfigurationDto) {
  const t0 = performance.now();
  const dc = config.dataConfiguration;
  const params: Record<string, any> = {};
  for (const p of config.parameters || []) params[p.paramId] = p.defaultValue;

  const toRow = (entityId: number, src: Record<string, any>): Row => {
    const r: Row = {};
    for (const f of FIELDS) if (f.entityId === entityId) r[f.fieldId] = src[f.systemFieldName] ?? null;
    return r;
  };

  let rows: Row[] = (ROWS[dc.primaryEntityId] || []).map((s) => toRow(dc.primaryEntityId, s));
  const joinedEntities = [dc.primaryEntityId];

  for (const re of dc.relatedEntities || []) {
    const rel = RELATIONSHIPS.find((r) => r.relationshipId === re.relationshipId);
    if (!rel) throw new Error('Unknown relationship');
    const otherIsForeign = rel.foreignEntityId === re.entityId;
    const otherKey = otherIsForeign ? rel.foreignJoinField : rel.primaryJoinField;
    const myKey = otherIsForeign ? rel.primaryJoinField : rel.foreignJoinField;
    const myEntity = otherIsForeign ? rel.primaryEntityId : rel.foreignEntityId;
    const myFieldId = FIELDS.find((f) => f.entityId === myEntity && f.systemFieldName === myKey)!.fieldId;
    const index = new Map<any, Row[]>();
    for (const s of ROWS[re.entityId] || []) {
      const k = s[otherKey];
      if (!index.has(k)) index.set(k, []);
      index.get(k)!.push(toRow(re.entityId, s));
    }
    const out: Row[] = [];
    for (const r of rows) {
      const matches = index.get(r[myFieldId]);
      if (matches?.length) for (const m of matches) out.push({ ...r, ...m });
      else if (re.joinType !== 'inner') out.push(r);
    }
    rows = out;
    joinedEntities.push(re.entityId);
  }

  const typeOf = (fieldId: number) => FIELDS.find((f) => f.fieldId === fieldId)?.dataType || 'String';

  const resolve = (v: any) => (typeof v === 'string' && v.startsWith('@') ? params[v.slice(1)] : v);

  const test = (val: any, flt: FilterDto): boolean => {
    const type = typeOf(flt.fieldId);
    const refs = (Array.isArray(flt.value) ? flt.value : [flt.value]).filter((x: any) => typeof x === 'string' && x.startsWith('@'));
    if (refs.some((r: string) => { const pv = params[r.slice(1)]; return pv == null || pv === ''; })) return true;
    let v = resolve(flt.value);
    const norm = (x: any) => (type === 'Number' ? Number(x) : type === 'Boolean' ? String(x).toLowerCase() === 'true' : String(x ?? ''));
    const s = (x: any) => String(x ?? '').toLowerCase();
    switch (flt.operator) {
      case 'isnull': return val == null || val === '';
      case 'isnotnull': return !(val == null || val === '');
      case 'eq': return val != null && (type === 'String' ? s(val) === s(v) : norm(val) === norm(v));
      case 'neq': return type === 'String' ? s(val) !== s(v) : norm(val) !== norm(v);
      case 'gt': return val != null && norm(val) > norm(v);
      case 'gte': return val != null && norm(val) >= norm(v);
      case 'lt': return val != null && norm(val) < norm(v);
      case 'lte': return val != null && norm(val) <= norm(v);
      case 'contains': return s(val).includes(s(v));
      case 'startswith': return s(val).startsWith(s(v));
      case 'endswith': return s(val).endsWith(s(v));
      case 'in':
      case 'notin': {
        const list = (Array.isArray(v) ? v : String(v).split(',')).map((x: any) => s(resolve(String(x).trim())));
        const hit = list.includes(s(val));
        return flt.operator === 'in' ? hit : !hit;
      }
      case 'between': {
        const [a, b] = Array.isArray(v) ? v : String(v).split(',');
        return val != null && norm(val) >= norm(resolve(a)) && norm(val) <= norm(resolve(b));
      }
      case 'relative': {
        if (val == null) return false;
        if (typeof v === 'string') v = RELATIVE_DATE_PRESETS.find((p) => p.label === v)?.value;
        const [from, to] = relativeRange(v);
        return val >= from && val <= to;
      }
    }
    return true;
  };

  const matchGroup = (row: Row, g: FilterGroupDto | undefined, get: (row: Row, fid: number) => any): boolean => {
    if (!g) return true;
    const results = [
      ...(g.filters || []).map((flt) => test(get(row, flt.fieldId), flt)),
      ...(g.children || []).map((c) => matchGroup(row, c, get)),
    ];
    if (!results.length) return true;
    return g.logic === 'or' ? results.some(Boolean) : results.every(Boolean);
  };

  rows = rows.filter((r) => matchGroup(r, dc.filterGroup, (row, id) => row[id]));

  const cols = [
    ...dc.selectedFields.map((s) => ({ ...s })),
    ...(dc.relatedEntities || []).flatMap((re) => re.selectedFields),
  ].map((s) => ({ ...s, label: s.label || FIELDS.find((f) => f.fieldId === s.fieldId)?.displayLabel || 'Field ' + s.fieldId }));

  const agg = (vals: any[], a?: string) => {
    const v = vals.filter((x) => x != null && x !== '');
    switch (a) {
      case 'Count': return v.length;
      case 'CountDistinct': return new Set(v).size;
      case 'Sum': return round(v.reduce((s, b) => s + Number(b), 0));
      case 'Avg': return v.length ? round(v.reduce((s, b) => s + Number(b), 0) / v.length) : null;
      case 'Min': return v.length ? v.reduce((x, y) => (y < x ? y : x)) : null;
      case 'Max': return v.length ? v.reduce((x, y) => (y > x ? y : x)) : null;
      default: return undefined;
    }
  };
  const summarised = cols.filter((c) => c.aggregate);
  const toLabels = (r: Row) => { const o: Record<string, any> = {}; for (const c of cols) o[c.label] = r[c.fieldId]; return o; };
  const cmp = (a: any, b: any) => (a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0);
  const MAX_GROUPS = 100;

  // Grand total over every filtered row, in the same pass (PRD 6.5) — correct for AVG and COUNT DISTINCT too.
  const grandTotal: Record<string, any> = {};
  for (const c of summarised) grandTotal[c.label] = agg(rows.map((r) => r[c.fieldId]), c.aggregate);

  const groupIds = dc.groupings?.length ? dc.groupings : [];
  const keyOf = (r: Row) => JSON.stringify(groupIds.map((id) => r[id]));

  // ---------- detail mode: detail rows, a summary under each group, a grand total ----------
  if (dc.groupingMode === 'detail' && groupIds.length) {
    let detail = rows;
    if (dc.topN) {
      // Ranks detail rows; group summaries then reflect only the survivors (PRD 6.6)
      const t = dc.topN;
      detail = [...detail].sort((a, b) => cmp(a[t.byFieldId], b[t.byFieldId]) * (t.direction === 'top' ? -1 : 1)).slice(0, t.count);
    }
    // Grouped columns order first; the user's sort applies within each group
    detail = [...detail].sort((a, b) => {
      for (const id of groupIds) { const c = cmp(a[id], b[id]); if (c) return c; }
      for (const s of dc.sortings || []) { const c = cmp(a[s.fieldId], b[s.fieldId]) * (s.direction === 'DESC' ? -1 : 1); if (c) return c; }
      return 0;
    });
    const groups: GroupSummary[] = [];
    let cur = '';
    detail.forEach((r, i) => {
      const k = keyOf(r);
      if (k !== cur) {
        cur = k;
        const key: Record<string, any> = {};
        for (const id of groupIds) { const c = cols.find((x) => x.fieldId === id); if (c) key[c.label] = r[id]; }
        groups.push({ key, rowCount: 0, summary: {}, start: i });
      }
      groups[groups.length - 1].rowCount++;
    });
    if (groups.length > MAX_GROUPS) throw { code: 'TOO_MANY_GROUPS' };
    for (const g of groups) {
      const slice = detail.slice(g.start, g.start + g.rowCount);
      for (const c of summarised) g.summary[c.label] = agg(slice.map((r) => r[c.fieldId]), c.aggregate);
    }
    if (dc.topN) for (const c of summarised) grandTotal[c.label] = agg(detail.map((r) => r[c.fieldId]), c.aggregate);
    const data = detail.slice(0, 1000).map(toLabels);
    return {
      data, totalCount: detail.length, page: 1, pageSize: data.length,
      executionTimeMs: Math.max(3, Math.round(performance.now() - t0)), truncated: detail.length > 1000,
      groups, grandTotal, groupCount: groups.length,
    };
  }

  // ---------- summary mode (one row per group) or a plain list ----------
  const aggregated = summarised.length > 0 || groupIds.length > 0;
  let out: Row[];
  let groupCount: number | undefined;
  if (aggregated) {
    const ids = groupIds.length ? groupIds : cols.filter((c) => !c.aggregate).map((c) => c.fieldId);
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const k = JSON.stringify(ids.map((id) => r[id]));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    if (groupIds.length && map.size > MAX_GROUPS) throw { code: 'TOO_MANY_GROUPS' };
    out = [...map.values()].map((g) => {
      const o: Row = {};
      for (const c of cols) o[c.fieldId] = c.aggregate ? agg(g.map((r) => r[c.fieldId]), c.aggregate) : g[0][c.fieldId];
      return o;
    });
    out = out.filter((r) => matchGroup(r, dc.having, (row, id) => row[id]));
    groupCount = groupIds.length ? out.length : undefined;
  } else {
    out = rows;
  }

  if (dc.distinct) {
    const seen = new Set<string>();
    out = out.filter((r) => {
      const k = JSON.stringify(cols.map((c) => r[c.fieldId]));
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  if (dc.sortings?.length) {
    out = [...out].sort((a, b) => {
      for (const s of dc.sortings!) { const c = cmp(a[s.fieldId], b[s.fieldId]) * (s.direction === 'DESC' ? -1 : 1); if (c) return c; }
      return 0;
    });
  }
  if (dc.topN) {
    // In summary mode the rows are groups, so this ranks groups (PRD 6.6)
    const t = dc.topN;
    out = [...out].sort((a, b) => cmp(a[t.byFieldId], b[t.byFieldId]) * (t.direction === 'top' ? -1 : 1)).slice(0, t.count);
    if (aggregated) for (const c of summarised) grandTotal[c.label] = agg(out.map((r) => r[c.fieldId]), c.aggregate === 'Avg' || c.aggregate === 'CountDistinct' ? undefined : c.aggregate === 'Count' ? 'Sum' : c.aggregate) ?? null;
  }

  const totalCount = out.length;
  const data = out.slice(0, 1000).map(toLabels);
  return {
    data,
    totalCount,
    page: 1,
    pageSize: data.length,
    executionTimeMs: Math.max(3, Math.round(performance.now() - t0)),
    truncated: totalCount > 1000,
    grandTotal: summarised.length ? grandTotal : undefined,
    groupCount,
  };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

function relativeRange(v: { unit: string; offset: number; anchor: string } | undefined): [string, string] {
  const today = new Date('2026-09-24T00:00:00');
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (!v) v = { unit: 'day', offset: -30, anchor: 'now' };
  if (v.unit === 'day') {
    const from = new Date(today);
    from.setDate(from.getDate() + v.offset);
    return [iso(from), iso(today)];
  }
  const y = today.getFullYear(), m = today.getMonth();
  if (v.unit === 'week') {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + v.offset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [iso(monday), iso(sunday)];
  }
  if (v.unit === 'month') {
    const from = new Date(y, m + v.offset, 1);
    const to = new Date(y, m + v.offset + 1, 0);
    return [iso(from), iso(to)];
  }
  if (v.unit === 'quarter') {
    const q = Math.floor(m / 3) + v.offset;
    return [iso(new Date(y, q * 3, 1)), iso(new Date(y, q * 3 + 3, 0))];
  }
  return [iso(new Date(y + v.offset, 0, 1)), iso(new Date(y + v.offset, 11, 31))];
}
