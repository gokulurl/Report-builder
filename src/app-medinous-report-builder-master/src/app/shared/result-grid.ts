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

type GridRow =
  | { kind: 'detail'; row: Record<string, any>; index: number; group?: number; continued?: boolean }
  | { kind: 'summary'; group: number; continued?: boolean }
  | { kind: 'grand' };

/**
 * Results table shared by the builder and the run page (PRD 6.5, 6.8).
 * Paging holds whole groups; the grand total sits after the last row of the whole result, never at the end of a page.
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

  page = signal(0);
  search = signal('');
  wrap = signal(false);
  expanded = signal<Set<number>>(new Set());
  widths = signal<Record<string, number>>({});

  private meta = computed(() => columnMeta(this.config()));
  detailMode = computed(() => !!this.result().groups?.length);
  groups = computed<GroupSummary[]>(() => this.result().groups || []);
  groupCols = computed(() => (this.groups()[0] ? Object.keys(this.groups()[0].key) : []));

  /** Server grand total when sent (correct for AVG / COUNT DISTINCT); otherwise add up what's here. */
  grand = computed<Record<string, { value: any; note?: string }> | null>(() => {
    const r = this.result();
    if (r.grandTotal && Object.keys(r.grandTotal).length) {
      const out: Record<string, { value: any }> = {};
      for (const [k, v] of Object.entries(r.grandTotal)) out[k] = { value: v };
      return out;
    }
    return this.detailMode() ? null : computeTotals(r.data, this.columns(), this.config());
  });

  private matchesSearch = (row: Record<string, any>) => {
    const q = this.search().trim().toLowerCase();
    if (!q) return true;
    return this.columns().some((c) => this.format(row[c], c).toLowerCase().includes(q));
  };

  /** Rows arranged into pages. Whole groups per page; an oversized group falls back to row paging marked "continued". */
  pages = computed<GridRow[][]>(() => {
    const r = this.result();
    const pages: GridRow[][] = [];
    let cur: GridRow[] = [];
    const push = () => { if (cur.length) { pages.push(cur); cur = []; } };

    if (!this.detailMode()) {
      r.data.forEach((row, i) => {
        if (!this.matchesSearch(row)) return;
        cur.push({ kind: 'detail', row, index: i });
        if (cur.length === PAGE_SIZE) push();
      });
    } else {
      const exp = this.expanded();
      this.groups().forEach((g, gi) => {
        const rows: GridRow[] = [];
        if (exp.has(gi)) {
          for (let i = g.start; i < g.start + g.rowCount && i < r.data.length; i++)
            if (this.matchesSearch(r.data[i])) rows.push({ kind: 'detail', row: r.data[i], index: i, group: gi });
          if (this.search() && !rows.length) return;
        } else if (this.search() && !r.data.slice(g.start, g.start + g.rowCount).some(this.matchesSearch)) {
          return;
        }
        const cost = rows.length + 1;
        if (cost <= PAGE_SIZE) {
          if (cur.length + cost > PAGE_SIZE) push();
          cur.push(...rows, { kind: 'summary', group: gi });
        } else {
          push();
          for (let i = 0; i < rows.length; i += PAGE_SIZE) {
            const chunk = rows.slice(i, i + PAGE_SIZE).map((x) => ({ ...x, continued: i > 0 }) as GridRow);
            cur.push(...chunk);
            if (i + PAGE_SIZE < rows.length) push();
          }
          cur.push({ kind: 'summary', group: gi, continued: true });
        }
      });
    }
    push();
    if (this.grand() && !this.search()) {
      if (!pages.length) pages.push([]);
      pages[pages.length - 1].push({ kind: 'grand' });
    }
    return pages;
  });

  pageRows = computed(() => this.pages()[Math.min(this.page(), Math.max(0, this.pages().length - 1))] || []);

  /** "Showing 1 to 50 of 213 rows" counts detail rows on the page. */
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
    bits.push(r.executionTimeMs < 1000 ? `${(r.executionTimeMs / 1000).toFixed(r.executionTimeMs < 100 ? 2 : 1)} s` : `${(r.executionTimeMs / 1000).toFixed(1)} s`);
    return bits.join(' · ');
  });

  constructor() {
    // New result: back to page 1, expand groups only when there are few of them.
    effect(() => {
      const gs = this.result().groups || [];
      this.page.set(0);
      this.expanded.set(new Set(gs.length <= EXPAND_UP_TO ? gs.map((_, i) => i) : []));
    });
    effect(() => { this.search(); this.page.set(0); });
  }

  format(v: any, col: string) {
    return formatValue(v, this.meta().get(col)?.formatPattern);
  }
  style(v: any, col: string, kind: 'detail' | 'summary') {
    return cellStyle(v, col, this.config().conditionalFormats, kind);
  }
  isNum(v: any) {
    return typeof v === 'number';
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
  /** Count summaries read "3 bills" style under their column, like the PRD example. */
  summaryCell(gi: number | null, col: string) {
    const src = gi === null ? this.result().grandTotal : this.groups()[gi]?.summary;
    if (!src || !(col in src)) return '';
    const v = src[col];
    return v === null ? '—' : this.format(v, col);
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

  // ---- column resize ----
  startResize(ev: MouseEvent, col: string) {
    ev.preventDefault();
    ev.stopPropagation();
    const th = (ev.target as HTMLElement).parentElement!;
    const startX = ev.clientX, startW = th.getBoundingClientRect().width;
    const move = (e: MouseEvent) => this.widths.update((w) => ({ ...w, [col]: Math.max(60, Math.round(startW + e.clientX - startX)) }));
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
}
