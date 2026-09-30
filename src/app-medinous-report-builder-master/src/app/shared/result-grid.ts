import { Component, computed, effect, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GroupSummary, PreviewResponse, ReportConfigurationDto } from '../models/report.models';
import { cellStyle, columnMeta, computeTotals, formatValue } from './report-format';
import { mediumDateTime } from './hospital-settings';

const PAGE_SIZE = 50;
/** Groups start expanded when there are few enough to read (PRD 6.5). */
const EXPAND_UP_TO = 10;
const MIN_W = 80, MAX_W = 320, MAX_PINNED = 2;
const DENSITY_KEY = 'report-grid-density';

type GridRow =
  | { kind: 'detail'; row: Record<string, any>; index: number; group?: number; continued?: boolean }
  | { kind: 'summary'; group: number; continued?: boolean }
  | { kind: 'grand' };

export interface ColumnLayout { widths?: Record<string, number>; nowrap?: string[]; pinned?: string[] }

/**
 * Results table shared by the builder and the run page (PRD 6.5, 6.8, 7.2).
 * Paging holds whole groups; the grand total sits after the last row of the whole result, never at the end of a page.
 * Widths, wrapping and pinning are part of the report; hiding, density and Find are the reader's own and never saved.
 */
@Component({
  selector: 'app-result-grid',
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './result-grid.html',
})
export class ResultGrid {
  result = input.required<PreviewResponse>();
  columns = input.required<string[]>();
  config = input.required<ReportConfigurationDto>();
  runAt = input<Date | null>(null);
  stale = input(false);
  drill = output<{ row: Record<string, any>; col: string }>();
  /** Emitted when the author changes widths, wrapping or pinning (saved with the report). */
  layoutChange = output<ColumnLayout>();

  page = signal(0);
  find = signal('');
  matchingOnly = signal(false);
  expanded = signal<Set<number>>(new Set());
  widths = signal<Record<string, number>>({});
  nowrap = signal<Set<string>>(new Set());
  pinned = signal<string[]>([]);
  hidden = signal<Set<string>>(new Set());
  density = signal<'comfortable' | 'compact'>(this.readDensity());
  menuCol = signal<string | null>(null);

  private meta = computed(() => columnMeta(this.config()));
  detailMode = computed(() => !!this.result().groups?.length);
  groups = computed<GroupSummary[]>(() => this.result().groups || []);
  showGrand = computed(() => this.config().dataConfiguration.showGrandTotal !== false);

  /** Pinned columns first (they stay put while the rest scroll), hidden ones left out of the view only. */
  viewCols = computed(() => {
    const hide = this.hidden();
    const pins = this.pinned().filter((c) => this.columns().includes(c) && !hide.has(c));
    return [...pins, ...this.columns().filter((c) => !pins.includes(c) && !hide.has(c))];
  });

  /** PRD 7.2.2 alignment: text left, numbers right, dates left, yes/no centred. Headers follow their data. */
  kinds = computed(() => {
    const out: Record<string, 'num' | 'date' | 'bool' | 'text'> = {};
    const rows = this.result().data.slice(0, 100);
    for (const c of this.columns()) {
      const v = rows.find((r) => r[c] != null && r[c] !== '')?.[c];
      out[c] = typeof v === 'number' ? 'num' : typeof v === 'boolean' ? 'bool' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? 'date' : 'text';
    }
    return out;
  });

  /** PRD 7.2.1: initial width from the type and the widest value in the first 100 rows, 80–320px. */
  private autoWidth(col: string, cap = MAX_W) {
    const rows = this.result().data.slice(0, 100);
    const longest = Math.max(col.length, ...rows.map((r) => this.format(r[col], col).length));
    return Math.max(MIN_W, Math.min(cap, Math.round(longest * 7.4 + 28)));
  }

  width(col: string) {
    return this.widths()[col] ?? this.autoWidth(col);
  }

  /** Server grand total when sent (correct for AVG / COUNT DISTINCT); otherwise add up what's here. */
  grand = computed<Record<string, { value: any; note?: string }> | null>(() => {
    if (!this.showGrand()) return null;
    const r = this.result();
    if (r.grandTotal && Object.keys(r.grandTotal).length) {
      const out: Record<string, { value: any }> = {};
      for (const [k, v] of Object.entries(r.grandTotal)) out[k] = { value: v };
      return out;
    }
    return this.detailMode() ? null : computeTotals(r.data, this.columns(), this.config());
  });

  // ---- Find in results (PRD 7.2.4): searches the whole result, highlights, optionally narrows ----
  private q = computed(() => this.find().trim().toLowerCase());
  private rowMatches = (row: Record<string, any>) => {
    const q = this.q();
    return !q || this.columns().some((c) => this.format(row[c], c).toLowerCase().includes(q));
  };
  matchCount = computed(() => (this.q() ? this.result().data.filter(this.rowMatches).length : 0));
  private narrowing = computed(() => !!this.q() && this.matchingOnly());

  /** Rows arranged into pages. Whole groups per page; an oversized group falls back to row paging marked "continued". */
  pages = computed<GridRow[][]>(() => {
    const r = this.result();
    const keep = (row: Record<string, any>) => !this.narrowing() || this.rowMatches(row);
    const pages: GridRow[][] = [];
    let cur: GridRow[] = [];
    const push = () => { if (cur.length) { pages.push(cur); cur = []; } };

    if (!this.detailMode()) {
      r.data.forEach((row, i) => {
        if (!keep(row)) return;
        cur.push({ kind: 'detail', row, index: i });
        if (cur.length === PAGE_SIZE) push();
      });
    } else {
      const exp = this.expanded();
      this.groups().forEach((g, gi) => {
        const slice = r.data.slice(g.start, g.start + g.rowCount);
        if (this.narrowing() && !slice.some(keep)) return;
        const rows: GridRow[] = [];
        if (exp.has(gi)) slice.forEach((row, k) => keep(row) && rows.push({ kind: 'detail', row, index: g.start + k, group: gi }));
        const cost = rows.length + 1;
        if (cost <= PAGE_SIZE) {
          if (cur.length + cost > PAGE_SIZE) push();
          cur.push(...rows, { kind: 'summary', group: gi });
        } else {
          push();
          for (let i = 0; i < rows.length; i += PAGE_SIZE) {
            cur.push(...rows.slice(i, i + PAGE_SIZE).map((x) => ({ ...x, continued: i > 0 }) as GridRow));
            if (i + PAGE_SIZE < rows.length) push();
          }
          cur.push({ kind: 'summary', group: gi, continued: true });
        }
      });
    }
    push();
    if (this.grand()) {
      if (!pages.length) pages.push([]);
      pages[pages.length - 1].push({ kind: 'grand' });
    }
    return pages;
  });

  pageRows = computed(() => this.pages()[Math.min(this.page(), Math.max(0, this.pages().length - 1))] || []);

  showing = computed(() => {
    let before = 0;
    const idx = Math.min(this.page(), this.pages().length - 1);
    this.pages().slice(0, Math.max(0, idx)).forEach((p) => (before += p.filter((x) => x.kind === 'detail').length));
    const here = this.pageRows().filter((x) => x.kind === 'detail').length;
    return { from: here ? before + 1 : 0, to: before + here };
  });

  pageList = computed(() => {
    const n = this.pages().length, p = this.page();
    if (n <= 7) return Array.from({ length: n }, (_, i) => i);
    const set = new Set([0, 1, n - 1, p - 1, p, p + 1].filter((x) => x >= 0 && x < n));
    const list = [...set].sort((a, b) => a - b);
    const out: (number | null)[] = [];
    list.forEach((x, i) => { if (i && x - list[i - 1] > 1) out.push(null); out.push(x); });
    return out;
  });

  runText = computed(() => {
    const r = this.result();
    const bits = [];
    if (this.groups().length || r.groupCount) bits.push(`${(r.groupCount ?? this.groups().length).toLocaleString()} groups`);
    if (this.runAt()) bits.push('Run ' + mediumDateTime(this.runAt()!));
    bits.push(`${(r.executionTimeMs / 1000).toFixed(r.executionTimeMs < 100 ? 2 : 1)} s`);
    return bits.join(' · ');
  });

  constructor() {
    // New result: back to page 1; groups start as the report says (PRD 6.5), "auto" expands only when there are few.
    effect(() => {
      const gs = this.result().groups || [];
      const start = this.config().dataConfiguration.groupsStart || 'auto';
      const open = start === 'expanded' || (start === 'auto' && gs.length <= EXPAND_UP_TO);
      this.page.set(0);
      this.expanded.set(new Set(open ? gs.map((_, i) => i) : []));
    });
    // Saved layout from the report definition
    effect(() => {
      const l = this.config().columnLayout || {};
      this.widths.set({ ...(l.widths || {}) });
      this.nowrap.set(new Set(l.nowrap || []));
      this.pinned.set([...(l.pinned || [])]);
    }, { allowSignalWrites: true } as any);
    effect(() => { this.find(); this.matchingOnly(); this.page.set(0); });
  }

  private emitLayout() {
    this.layoutChange.emit({ widths: this.widths(), nowrap: [...this.nowrap()], pinned: this.pinned() });
  }

  format(v: any, col: string) {
    return formatValue(v, this.meta().get(col)?.formatPattern);
  }

  /** Cell text with Find matches wrapped in <mark>. Values are escaped first. */
  html(v: any, col: string) {
    const text = this.format(v, col).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
    const q = this.q();
    if (!q) return text;
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
    return text.replace(new RegExp(esc, 'gi'), (m) => `<mark>${m}</mark>`);
  }

  style(v: any, col: string, kind: 'detail' | 'summary') {
    return cellStyle(v, col, this.config().conditionalFormats, kind);
  }
  drillFor(col: string) {
    return this.config().drillThrough?.some((d) => d.sourceColumn === col && d.targetReportId);
  }
  summaryOf(gi: number) {
    return this.groups()[gi];
  }
  groupLabel(gi: number) {
    const g = this.groups()[gi];
    return g ? Object.values(g.key).map((v) => (v == null || v === '' ? '(blank)' : this.format(v, ''))).join(' · ') : '';
  }
  summaryCell(gi: number, col: string) {
    const src = this.groups()[gi]?.summary;
    if (!src || !(col in src)) return '';
    const v = src[col];
    return v === null ? '—' : this.format(v, col);
  }

  // ---- pinning: left offsets for sticky columns ----
  isPinned(col: string) {
    return this.pinned().includes(col) && !this.hidden().has(col);
  }
  pinLeft(col: string) {
    let left = 44 + (this.detailMode() ? 30 : 0); // row number (+ group toggle)
    for (const c of this.viewCols()) {
      if (c === col) break;
      if (this.isPinned(c)) left += this.width(c);
    }
    return left;
  }
  lastPinned(col: string) {
    const pins = this.viewCols().filter((c) => this.isPinned(c));
    return pins[pins.length - 1] === col;
  }

  // ---- column menu actions ----
  toggleMenu(col: string, ev: Event) {
    ev.stopPropagation();
    this.menuCol.set(this.menuCol() === col ? null : col);
  }
  closeMenu() {
    this.menuCol.set(null);
  }
  toggleWrap(col: string) {
    this.nowrap.update((s) => { const n = new Set(s); n.has(col) ? n.delete(col) : n.add(col); return n; });
    this.emitLayout();
    this.closeMenu();
  }
  togglePin(col: string) {
    this.pinned.update((p) => (p.includes(col) ? p.filter((x) => x !== col) : p.length < MAX_PINNED ? [...p, col] : p));
    this.emitLayout();
    this.closeMenu();
  }
  canPin(col: string) {
    return this.pinned().includes(col) || this.pinned().length < MAX_PINNED;
  }
  hide(col: string) {
    this.hidden.update((s) => new Set([...s, col]));
    this.closeMenu();
  }
  showAll() {
    this.hidden.set(new Set());
  }
  fit(col: string) {
    this.widths.update((w) => ({ ...w, [col]: this.autoWidth(col, 640) }));
    this.emitLayout();
    this.closeMenu();
  }
  resetWidths() {
    this.widths.set({});
    this.emitLayout();
  }
  setDensity(d: 'comfortable' | 'compact') {
    this.density.set(d);
    try { localStorage.setItem(DENSITY_KEY, d); } catch {}
  }
  private readDensity(): 'comfortable' | 'compact' {
    try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'; } catch { return 'comfortable'; }
  }

  toggle(gi: number) {
    this.expanded.update((s) => { const n = new Set(s); n.has(gi) ? n.delete(gi) : n.add(gi); return n; });
  }
  expandAll(open: boolean) {
    this.expanded.set(new Set(open ? this.groups().map((_, i) => i) : []));
  }
  go(p: number) {
    this.page.set(Math.max(0, Math.min(p, this.pages().length - 1)));
  }

  // ---- column resize: drag the edge; double-click fits to content ----
  startResize(ev: MouseEvent, col: string) {
    ev.preventDefault();
    ev.stopPropagation();
    const startX = ev.clientX, startW = this.width(col);
    const move = (e: MouseEvent) => this.widths.update((w) => ({ ...w, [col]: Math.max(MIN_W, Math.round(startW + e.clientX - startX)) }));
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); this.emitLayout(); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
}
