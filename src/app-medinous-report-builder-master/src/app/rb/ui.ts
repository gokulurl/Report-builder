import { Component, ElementRef, HostListener, computed, effect, input, output, signal } from '@angular/core';
import { NgStyle } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CalcCol, ChartModel, PALETTE, Row, Spec, SumFn, TRow, TableModel, agg, colOf, fdate, fval, isNum, ruleStyle } from './engine';

/** Centred modal: title, projected body, and a footer of projected buttons. Esc and the scrim close it. */
@Component({
  selector: 'rb-dialog',
  template: `
    <div class="rb-scrim" (mousedown)="$event.target === $event.currentTarget && closed.emit()">
      <div class="rb-dlg" role="dialog" aria-modal="true" [attr.aria-label]="title()" [style.width.px]="width()">
        <h3>{{ title() }}</h3>
        <ng-content />
        <div class="rb-dlg-foot"><ng-content select="[foot]" /></div>
      </div>
    </div>`,
})
export class RbDialog {
  title = input.required<string>();
  width = input(460);
  closed = output();
  constructor(private el: ElementRef<HTMLElement>) {
    setTimeout(() => (el.nativeElement.querySelector('input:not([disabled]),textarea,select') as HTMLElement | null)?.focus());
  }
  @HostListener('document:keydown.escape') esc() { this.closed.emit(); }
}

/** Popover menu anchored under an element; closes on outside click or Esc. */
@Component({
  selector: 'rb-pop',
  template: `<div class="rb-pop" role="menu" [style.left.px]="pos().x" [style.top.px]="pos().y"><ng-content /></div>`,
})
export class RbPop {
  anchor = input.required<HTMLElement>();
  closed = output();
  pos = signal({ x: -9999, y: -9999 });
  constructor(private el: ElementRef<HTMLElement>) {
    effect(() => {
      const a = this.anchor();
      setTimeout(() => {
        const r = a.getBoundingClientRect(); const p = this.el.nativeElement.firstElementChild as HTMLElement;
        const w = p.offsetWidth, h = p.offsetHeight;
        let x = Math.min(r.left, innerWidth - w - 10), y = r.bottom + 4;
        if (y + h > innerHeight - 10) y = Math.max(10, r.top - h - 4);
        this.pos.set({ x: Math.max(10, x), y });
        (p.querySelector('input,button:not([disabled])') as HTMLElement | null)?.focus();
      });
    });
  }
  @HostListener('document:mousedown', ['$event']) outside(e: MouseEvent) {
    const t = e.target as Node;
    if (!this.el.nativeElement.contains(t) && !this.anchor().contains(t)) this.closed.emit();
  }
  @HostListener('document:keydown.escape') esc() { this.closed.emit(); }
}

/** The report table: grouping, subtotals, pinned columns, widths, wrap, highlight rules, find, drill and row selection. */
@Component({
  selector: 'rb-table',
  imports: [NgStyle, MatIconModule],
  template: `
    @let m = model();
    @if (m.error === 'groups') {
      <div class="rb-empty err"><mat-icon>warning</mat-icon><b>This grouping produces more than 1,000 groups</b>Add a filter, or group by a column with fewer values.</div>
    } @else if (!spec().cols.length) {
      <div class="rb-empty"><b>Pick some columns to start</b>Add columns from the Columns tab and they appear here.</div>
    } @else if (!total()) {
      <div class="rb-empty"><b>No records match the selected criteria</b>Widen a filter, or choose a different date range.</div>
    } @else {
      <div class="rb-tw">
        <table class="rb-t" [class.compact]="density() === 'compact'">
          <thead><tr>
            @if (grouped()) { <th class="pin gcol" style="left:0;z-index:3"><span class="rb-th">{{ groupHead() }}</span></th> }
            @for (id of m.cols; track id) {
              <th [class.n]="num(id)" [class.pin]="id in stick()" [ngStyle]="cellW(id, true)" [attr.data-col]="id">
                <button class="rb-th" (click)="headerMenu.emit({ id, el: $any($event.currentTarget) })" aria-haspopup="menu">
                  @if (id in stick()) { <mat-icon class="xs">push_pin</mat-icon> }
                  @if (num(id) && sortMark(id)) { <mat-icon class="xs">{{ sortMark(id) }}</mat-icon> }
                  <span>{{ label(id) }}</span>
                  @if (restricted(id)) { <mat-icon class="xs">lock</mat-icon> }
                  @if (!num(id) && sortMark(id)) { <mat-icon class="xs">{{ sortMark(id) }}</mat-icon> }
                </button>
                <span class="rb-rz" (mousedown)="startResize($event, id)" aria-hidden="true"></span>
              </th>
            }
          </tr></thead>
          <tbody>
            @for (r of m.rows; track $index) {
              @switch (r.k) {
                @case ('detail') {
                  @if (r.k === 'detail') {
                    <tr [class.hit]="isHit(r.row)" [class.rsel]="selected()?.has(r.row._i)" [class.selectable]="!!selected()"
                        (click)="selected() && rowClick.emit(r.row._i)" [attr.tabindex]="selected() ? 0 : null"
                        (keydown.enter)="selected() && rowClick.emit(r.row._i)">
                      @if (grouped()) { <td class="pin gcol" style="left:0"></td> }
                      @for (id of m.cols; track id) {
                        <td [class.n]="num(id)" [class.wrap]="wrap().includes(id)" [class.pin]="id in stick()" [ngStyle]="cellStyle(id, r.row[id], 'detail')">
                          @if (drillOf(id) && txt(id, r.row[id])) {
                            <button class="rb-lnk" (click)="$event.stopPropagation(); drill.emit({ col: id, value: raw(r.row[id]) })" [innerHTML]="hl(txt(id, r.row[id]))"></button>
                          } @else { <span [innerHTML]="hl(txt(id, r.row[id]))"></span> }
                        </td>
                      }
                    </tr>
                  }
                }
                @case ('gh') {
                  @if (r.k === 'gh') {
                    <tr class="gh" tabindex="0" (click)="toggle.emit(r.key)" (keydown.enter)="toggle.emit(r.key)" [attr.aria-expanded]="!r.collapsed">
                      <td class="pin gcol" style="left:0" [style.padding-left.px]="r.pad">
                        <mat-icon class="tog" [class.c]="r.collapsed">expand_more</mat-icon>
                        @if (drillOf(r.gcol)) { <button class="rb-lnk" (click)="$event.stopPropagation(); drill.emit({ col: r.gcol, value: r.label })">{{ r.label }}</button> } @else { {{ r.label }} }
                        <span class="gc">{{ r.count }} {{ r.count === 1 ? 'line' : 'lines' }}</span>
                      </td>
                      <td [attr.colspan]="m.cols.length"></td>
                    </tr>
                  }
                }
                @case ('srow') {
                  @if (r.k === 'srow') {
                    <tr class="srow">
                      <td class="pin gcol" style="left:0" [style.padding-left.px]="r.pad">
                        @if (drillOf(r.gcol)) { <button class="rb-lnk" (click)="drill.emit({ col: r.gcol, value: r.label })">{{ r.label }}</button> } @else { {{ r.label }} }
                        <span class="gc">({{ r.count }})</span>
                      </td>
                      @for (id of m.cols; track id) { <td [class.n]="num(id)" [class.pin]="id in stick()" [ngStyle]="sumStyle(id, r.rows)">{{ sumTxt(id, r.rows) }}</td> }
                    </tr>
                  }
                }
                @case ('sub') {
                  @if (r.k === 'sub') {
                    <tr class="sub" [class.l2]="r.l2">
                      <td class="pin gcol" style="left:0" [style.padding-left.px]="r.pad">{{ r.label }}</td>
                      @for (id of m.cols; track id) { <td [class.n]="num(id)" [class.pin]="id in stick()" [ngStyle]="sumStyle(id, r.rows)">{{ sumTxt(id, r.rows) }}</td> }
                    </tr>
                  }
                }
                @case ('grand') {
                  @if (r.k === 'grand') {
                    <tr class="gt">
                      @if (grouped()) { <td class="pin gcol" style="left:0">Grand total</td> }
                      @for (id of m.cols; track id; let i = $index) {
                        <td [class.n]="num(id)" [class.pin]="id in stick()" [ngStyle]="sumStyle(id, r.rows)">{{ spec().sums[id] ? sumTxt(id, r.rows) : (!grouped() && i === 0 ? 'Total' : '') }}</td>
                      }
                    </tr>
                  }
                }
              }
            }
          </tbody>
        </table>
      </div>
      @if (m.info.pages > 1 || m.info.unit) {
        <div class="rb-pager">
          <span class="muted tiny">{{ m.info.unit ? 'Showing ' + m.info.from + ' to ' + m.info.to + ' of ' + m.info.total + ' lines' : 'Page ' + (m.info.pg + 1) + ' of ' + m.info.pages + '. Each page holds whole groups.' }}</span>
          @if (m.info.pages > 1) {
            <span class="rb-pager-btns">
              <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="page.emit(-1)" [disabled]="m.info.pg === 0"><mat-icon>chevron_left</mat-icon>Previous</button>
              <button class="fx-btn fx-btn-secondary fx-btn-sm" (click)="page.emit(1)" [disabled]="m.info.pg >= m.info.pages - 1">Next<mat-icon>chevron_right</mat-icon></button>
            </span>
          }
        </div>
      }
    }`,
})
export class RbTable {
  model = input.required<TableModel>();
  spec = input.required<Spec>();
  total = input.required<number>();
  sort = input<{ col: string; dir: string }[]>([]);
  widths = input<Record<string, number>>({});
  wrap = input<string[]>([]);
  density = input<'' | 'compact'>('');
  find = input('');
  selected = input<Set<number> | null>(null);
  toggle = output<string>();
  page = output<number>();
  drill = output<{ col: string; value: string }>();
  rowClick = output<number>();
  headerMenu = output<{ id: string; el: HTMLElement }>();
  resized = output<{ id: string; w: number }>();

  grouped = computed(() => this.spec().groups.length > 0);
  groupHead = computed(() => this.spec().groups.map((g) => colOf(g, this.spec().calcs).label).join(' / '));
  /** Left offsets of pinned columns (after the 230px group column when grouped). */
  stick = computed(() => {
    const m = this.model(); const pins = this.spec().cols.length ? m.cols.filter((c) => this.pinsIn().includes(c)) : [];
    let left = this.grouped() ? 230 : 0; const s: Record<string, number> = {};
    pins.forEach((p) => { s[p] = left; left += this.widths()[p] || 150; }); return s;
  });
  pinsIn = input<string[]>([], { alias: 'pins' });

  private calcs(): CalcCol[] { return this.spec().calcs; }
  col(id: string) { return colOf(id, this.calcs()); }
  label(id: string) { return this.col(id).label; }
  num(id: string) { return isNum(this.col(id)); }
  restricted(id: string) { return !!this.col(id).restricted; }
  sortMark(id: string) {
    const so = this.sort(); const s = so.find((x) => x.col === id); if (!s) return '';
    return s.dir === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }
  txt(id: string, v: any) { return fval(this.col(id), v, null, this.spec().fmt); }
  raw(v: any) { return v instanceof Date ? fdate(v) : String(v); }
  drillOf(id: string) { return this.spec().drill.find((d) => d.col === id); }
  sumTxt(id: string, rows: Row[]) {
    const fn = this.spec().sums[id] as SumFn | undefined; if (!fn) return '';
    return fval(this.col(id), agg(rows, id, fn, this.calcs()), fn, this.spec().fmt);
  }
  cellW(id: string, head = false): Record<string, string> {
    const w = this.widths()[id] || (id in this.stick() ? 150 : 0); const s: Record<string, string> = {};
    if (w) { s['width'] = s['min-width'] = s['max-width'] = w + 'px'; }
    if (id in this.stick()) { s['position'] = 'sticky'; s['left'] = this.stick()[id] + 'px'; s['z-index'] = head ? '3' : '1'; }
    return s;
  }
  cellStyle(id: string, v: any, kind: 'detail' | 'summary') { return { ...this.cellW(id), ...(ruleStyle(this.spec(), id, v, kind) || {}) }; }
  sumStyle(id: string, rows: Row[]) {
    const fn = this.spec().sums[id] as SumFn | undefined;
    return fn ? this.cellStyle(id, agg(rows, id, fn, this.calcs()), 'summary') : this.cellW(id);
  }
  isHit(r: Row) {
    const q = this.find().trim().toLowerCase(); if (!q) return false;
    return this.model().cols.some((id) => this.txt(id, r[id]).toLowerCase().includes(q));
  }
  hl(t: string) {
    const e = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const q = this.find().trim(); if (!q) return e(t);
    const i = t.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return e(t);
    return e(t.slice(0, i)) + '<mark>' + e(t.slice(i, i + q.length)) + '</mark>' + e(t.slice(i + q.length));
  }
  startResize(e: MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation();
    const th = (e.target as HTMLElement).parentElement!; const x0 = e.clientX, w0 = th.getBoundingClientRect().width; let w = w0;
    const cells = () => th.closest('table')!.querySelectorAll<HTMLElement>(`th[data-col="${id}"]`);
    const move = (ev: MouseEvent) => { w = Math.max(70, Math.min(520, Math.round(w0 + ev.clientX - x0))); cells().forEach((c) => { c.style.width = c.style.minWidth = c.style.maxWidth = w + 'px'; }); };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); if (w !== w0) this.resized.emit({ id, w }); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }
}

/** Bar, line, pie and doughnut, drawn as SVG so the chart prints and exports exactly as shown. */
@Component({
  selector: 'rb-chart',
  template: `
    @let c = model();
    @if (!c) {
      <div class="rb-chart empty muted tiny">Choose a label column and at least one value column to draw a chart.</div>
    } @else if (c.type === 'pie' || c.type === 'doughnut') {
      <div class="rb-chart"><div class="rb-pie">
        <svg viewBox="0 0 300 260" role="img" [attr.aria-label]="c.type + ' chart of ' + c.series[0].name + ' by ' + c.label">
          @for (s of slices(); track $index) { <path [attr.d]="s.d" [attr.fill]="s.color" stroke="#fff" stroke-width="2"><title>{{ s.title }}</title></path> }
        </svg>
        <div class="rb-plist">
          @for (s of slices().slice(0, 9); track $index) { <div class="pl"><i [style.background]="s.color"></i><span>{{ s.k }}</span><b>{{ s.v }}</b><em>{{ s.pct }}%</em></div> }
        </div>
      </div>@if (c.capped) { <div class="muted tiny">Showing the first 50 categories.</div> }</div>
    } @else {
      <div class="rb-chart">
        <div class="rb-legend">@for (s of c.series; track $index) { <span><i [style.background]="color($index)"></i>{{ s.name }}</span> }</div>
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="c.type + ' chart by ' + c.label">
          @for (t of axis(); track $index) {
            <line [attr.x1]="pl" [attr.x2]="W - pr" [attr.y1]="t.y" [attr.y2]="t.y" stroke="#e7eaee" />
            <text [attr.x]="pl - 8" [attr.y]="t.y + 4" text-anchor="end" font-size="11" fill="#6c757d">{{ t.l }}</text>
          }
          @for (x of xlabels(); track $index) {
            <text [attr.x]="x.x" [attr.y]="H - pb + 16" text-anchor="end" font-size="11" fill="#495057" [attr.transform]="'rotate(-30 ' + x.x + ' ' + (H - pb + 16) + ')'">{{ x.l }}</text>
          }
          @for (b of bars(); track $index) { <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="3" [attr.fill]="b.color"><title>{{ b.title }}</title></rect> }
          @for (l of lines(); track $index) {
            <polyline [attr.points]="l.pts" fill="none" [attr.stroke]="l.color" stroke-width="2.5" />
            @for (p of l.dots; track $index) { <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.5" [attr.fill]="l.color"><title>{{ p.title }}</title></circle> }
          }
        </svg>
        @if (c.capped) { <div class="muted tiny">Showing the first 50 categories. Group or filter the data to reduce them.</div> }
      </div>
    }`,
})
export class RbChart {
  model = input<ChartModel | null>(null);
  W = 760; H = 260; pl = 70; pr = 16; pt = 14; pb = 56;
  color(i: number) { return PALETTE[i % 8]; }
  private max = computed(() => { const c = this.model(); return c ? Math.max(1, ...c.series.flatMap((s) => s.data.map((v) => (isNaN(v) ? 0 : v)))) : 1; });
  private bw = computed(() => (this.W - this.pl - this.pr) / Math.max(1, this.model()?.labels.length || 1));
  private ih = this.H - this.pt - this.pb;
  axis = computed(() => {
    const c = this.model(); if (!c) return [];
    return [0, 1, 2, 3, 4].map((t) => ({ y: this.pt + this.ih - (this.ih * t) / 4, l: c.fmt(0, (this.max() * t) / 4).replace('KD ', '') }));
  });
  xlabels = computed(() => (this.model()?.labels || []).map((k, i) => ({ x: this.pl + this.bw() * i + this.bw() / 2, l: k.length > 14 ? k.slice(0, 13) + '…' : k })));
  bars = computed(() => {
    const c = this.model(); if (!c || c.type !== 'bar') return [];
    const n = c.series.length; const gw = Math.min(46, this.bw() * 0.7) / n; const out: any[] = [];
    c.labels.forEach((k, i) => c.series.forEach((s, j) => {
      const v = s.data[i]; const h = (this.ih * (isNaN(v) ? 0 : v)) / this.max();
      out.push({ x: this.pl + this.bw() * i + (this.bw() - gw * n) / 2 + gw * j, y: this.pt + this.ih - h, w: gw - 2, h, color: this.color(j), title: `${k}: ${c.fmt(j, v)}` });
    }));
    return out;
  });
  lines = computed(() => {
    const c = this.model(); if (!c || c.type !== 'line') return [];
    return c.series.map((s, j) => {
      const dots = c.labels.map((k, i) => ({ x: this.pl + this.bw() * i + this.bw() / 2, y: this.pt + this.ih - (this.ih * (isNaN(s.data[i]) ? 0 : s.data[i])) / this.max(), title: `${k}: ${c.fmt(j, s.data[i])}` }));
      return { color: this.color(j), dots, pts: dots.map((d) => `${d.x},${d.y}`).join(' ') };
    });
  });
  slices = computed(() => {
    const c = this.model(); if (!c || (c.type !== 'pie' && c.type !== 'doughnut')) return [];
    const vals = c.series[0].data.map((v) => Math.max(0, v || 0)); const tot = vals.reduce((a, b) => a + b, 0) || 1;
    let a0 = -Math.PI / 2; const cx = 150, cy = 130, r = 110, ri = c.type === 'doughnut' ? 62 : 0;
    const p = (a: number, rr: number) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    return c.labels.map((k, i) => {
      const a1 = a0 + (2 * Math.PI * vals[i]) / tot; const lg = a1 - a0 > Math.PI ? 1 : 0;
      const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r); let d = `M${x0},${y0} A${r},${r} 0 ${lg} 1 ${x1},${y1}`;
      if (ri) { const [x2, y2] = p(a1, ri), [x3, y3] = p(a0, ri); d += ` L${x2},${y2} A${ri},${ri} 0 ${lg} 0 ${x3},${y3} Z`; } else d += ` L${cx},${cy} Z`;
      a0 = a1; const v = c.fmt(0, c.series[0].data[i]);
      return { d, color: this.color(i), title: `${k}: ${v}`, k, v, pct: Math.round((100 * vals[i]) / tot) };
    });
  });
}
