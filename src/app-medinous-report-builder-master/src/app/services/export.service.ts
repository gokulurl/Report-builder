import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ConditionalFormatRule, GroupSummary } from '../models/report.models';
import { matches } from '../shared/report-format';
import { HOSPITAL } from '../shared/hospital-settings';

/** Everything an export needs, taken from a completed run (PRD 6.10). Always the whole result, never just the page on screen. */
export interface ReportExport {
  title: string;
  columns: string[];
  rows: Record<string, any>[];
  /** Detail mode: group summaries with each group's first row index */
  groups?: GroupSummary[];
  grandTotal?: Record<string, any> | null;
  /** Column label → display format pattern (n2, c2, medium, …) */
  formats: Record<string, string | undefined>;
  /** "Filters: … · Parameters: … · Run by … on …" */
  criteria: string;
  conditionalFormats?: ConditionalFormatRule[];
}

const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

@Injectable({ providedIn: 'root' })
export class ExportService {
  // ---------------- PRD 6.10.1 Excel layout ----------------

  private numFmt(pattern: string | undefined, isDate: boolean): string | undefined {
    const cur = `"${HOSPITAL.currency}" `;
    const dec = '0'.repeat(HOSPITAL.currencyDecimals);
    switch (pattern) {
      case 'n0': return '#,##0';
      case 'n2': return '#,##0.00';
      case 'n3': case 'n4': return '#,##0.000';
      case 'c0': return cur + '#,##0';
      case 'c2': return `${cur}#,##0.${dec}`;
      case 'p0': return '0%';
      case 'p2': return '0.00%';
      case 'short': return 'dd/mm/yyyy';
      case 'long': return 'dd mmmm yyyy';
      case 'iso': return 'yyyy-mm-dd';
      case 'datetime': return 'dd mmm yyyy hh:mm';
      default: return isDate ? 'dd mmm yyyy' : undefined;
    }
  }

  /** Numbers stay numbers and dates become real dates, so the file can be summed and filtered without cleaning. */
  private cellValue(v: any) {
    if (typeof v === 'string' && ISO.test(v)) return new Date(v.length === 10 ? v + 'T00:00:00Z' : v);
    return v ?? null;
  }

  private sheetName(title: string) {
    return (title.replace(/[\\\/\?\*\[\]:]/g, ' ').trim() || 'Report').slice(0, 31);
  }

  async exportExcelReport(x: ReportExport) {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    const ws = wb.addWorksheet(this.sheetName(x.title), {
      views: [{ state: 'frozen', ySplit: 5 }],
      properties: { outlineLevelRow: 1, defaultRowHeight: 16 },
    });
    ws.properties.outlineProperties = { summaryBelow: true, summaryRight: false };
    const n = Math.max(1, x.columns.length);

    // A1–A3: hospital, title, criteria line — merged across all report columns
    const banner = (row: number, text: string, font: any, height?: number) => {
      ws.mergeCells(row, 1, row, n);
      const c = ws.getCell(row, 1);
      c.value = text;
      c.font = font;
      c.alignment = { vertical: 'middle', wrapText: row === 3 };
      if (height) ws.getRow(row).height = height;
    };
    banner(1, HOSPITAL.name, { bold: true, size: 14 }, 20);
    banner(2, x.title, { bold: true, size: 12 }, 18);
    banner(3, x.criteria, { size: 9, color: { argb: 'FF6C757D' } }, Math.min(60, 14 * Math.ceil(x.criteria.length / 110)));
    // A4 spacer; A5 headers: bold white on the header fill, frozen, autofilter
    const head = ws.getRow(5);
    x.columns.forEach((col, i) => {
      const c = head.getCell(i + 1);
      c.value = col;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0065CB' } };
      c.alignment = { vertical: 'middle' };
    });
    head.height = 18;
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: n } };

    const isDateCol = (col: string) => x.rows.some((r) => typeof r[col] === 'string' && ISO.test(r[col]));
    const dateCols = new Set(x.columns.filter(isDateCol));
    const colour = (cell: any, value: any, col: string, kind: 'detail' | 'summary') => {
      for (const rule of (x.conditionalFormats || []).filter((r) => r.targetColumn === col)) {
        const scope = rule.appliesTo || 'both';
        if ((scope !== 'both' && scope !== kind) || !matches(value, rule)) continue;
        if (rule.backgroundColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rule.backgroundColor.slice(1).toUpperCase() } };
        if (rule.textColor) cell.font = { ...(cell.font || {}), color: { argb: 'FF' + rule.textColor.slice(1).toUpperCase() } };
        return;
      }
    };
    const writeRow = (values: Record<string, any>, kind: 'detail' | 'summary' | 'grand', label?: string, outline = 0) => {
      const row = ws.addRow(x.columns.map((col, i) => (label && i === 0 && (values[col] == null || kind !== 'detail') ? label : this.cellValue(values[col]))));
      row.outlineLevel = outline;
      x.columns.forEach((col, i) => {
        const c = row.getCell(i + 1);
        const fmt = this.numFmt(x.formats[col], dateCols.has(col));
        if (fmt && !(label && i === 0)) c.numFmt = fmt;
        if (kind !== 'detail') {
          c.font = { bold: true };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kind === 'grand' ? 'FFC9DDF5' : 'FFEEF4FB' } };
        }
        colour(c, values[col], col, kind === 'detail' ? 'detail' : 'summary');
      });
    };

    if (x.groups?.length) {
      for (const g of x.groups) {
        for (let i = g.start; i < g.start + g.rowCount && i < x.rows.length; i++) writeRow(x.rows[i], 'detail', undefined, 1);
        const label = Object.values(g.key).map((v) => (v == null || v === '' ? '(blank)' : String(v))).join(' · ') + ' subtotal';
        writeRow({ ...g.key, ...g.summary }, 'summary', label);
      }
    } else {
      for (const r of x.rows) writeRow(r, 'detail');
    }
    if (x.grandTotal && Object.keys(x.grandTotal).length) writeRow(x.grandTotal, 'grand', 'Grand total');

    // Widths sized to content, capped so a long remarks column can't push the sheet screens wide
    x.columns.forEach((col, i) => {
      const longest = Math.max(col.length, ...x.rows.slice(0, 500).map((r) => String(r[col] ?? '').length));
      ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 10), 45);
    });

    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${x.title}.xlsx`);
  }

  // ---------------- PRD 6.10 CSV: unstyled, with a row-type column ----------------

  exportCsvReport(x: ReportExport) {
    const cell = (v: any) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [['Row Type', ...x.columns].map(cell).join(',')];
    const line = (type: string, values: Record<string, any>) => lines.push([type, ...x.columns.map((c) => values[c])].map(cell).join(','));
    if (x.groups?.length) {
      for (const g of x.groups) {
        for (let i = g.start; i < g.start + g.rowCount && i < x.rows.length; i++) line('Detail', x.rows[i]);
        line('Subtotal', { ...g.key, ...g.summary });
      }
    } else {
      x.rows.forEach((r) => line('Detail', r));
    }
    if (x.grandTotal && Object.keys(x.grandTotal).length) line('Grand total', x.grandTotal);
    saveAs(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `${x.title}.csv`);
  }

  /** Appends a grand-total row; "Total" goes in the first column that has no total of its own. */
  private withTotals(data: Record<string, any>[], columns: string[], totals?: Record<string, any>) {
    if (!totals) return data;
    const row: Record<string, any> = {};
    for (const col of columns) row[col] = totals[col] ?? '';
    const labelCol = columns.find((c) => row[c] === '');
    if (labelCol) row[labelCol] = 'Total';
    return [...data, row];
  }

  /** @param headerLines optional lines above the table (hospital, report, parameters used), then a blank row. */
  exportCsv(data: Record<string, any>[], columns: string[], filename: string, totals?: Record<string, any>, headerLines?: string[]) {
    data = this.withTotals(data, columns, totals);
    const header = columns.join(',');
    const rows = data.map((row) =>
      columns
        .map((col) => {
          const val = row[col] ?? '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    );
    const top = headerLines?.length ? [...headerLines.map((l) => (/[",\n]/.test(l) ? `"${l.replace(/"/g, '""')}"` : l)), ''] : [];
    const csv = [...top, header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `${filename}.csv`);
  }

  exportExcel(data: Record<string, any>[], columns: string[], filename: string, totals?: Record<string, any>, headerLines?: string[]) {
    data = this.withTotals(data, columns, totals);
    const top: any[][] = headerLines?.length ? [...headerLines.map((l) => [l]), []] : [];
    const worksheet = XLSX.utils.aoa_to_sheet([...top, columns, ...data.map((row) => columns.map((col) => row[col] ?? ''))]);

    const colWidths = columns.map((col) => {
      const maxLen = Math.max(
        col.length,
        ...data.map((row) => String(row[col] ?? '').length)
      );
      return { wch: Math.min(maxLen + 2, 40) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, `${filename}.xlsx`);
  }

  exportPdf(
    data: Record<string, any>[],
    columns: string[],
    title: string,
    chartCanvas?: HTMLCanvasElement
  ) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let chartHtml = '';
    if (chartCanvas) {
      const chartImage = chartCanvas.toDataURL('image/png');
      chartHtml = `<div class="chart-section"><img src="${chartImage}" style="max-width:100%;height:auto;margin-bottom:20px;" /></div>`;
    }

    const tableHtml = `
      <table>
        <thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${data.map((row) => `<tr>${columns.map((c) => `<td>${row[c] ?? ''}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>`;

    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
        table { border-collapse: collapse; width: 100%; font-size: 11px; }
        th { background: #1976d2; color: white; padding: 8px 10px; text-align: left; white-space: nowrap; }
        td { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; }
        tr:nth-child(even) { background: #f5f5f5; }
        .chart-section { page-break-after: always; text-align: center; }
        @media print { .no-print { display: none; } }
      </style></head><body>
      <h1>${title}</h1>
      <div class="meta">${data.length} rows &middot; Generated ${new Date().toLocaleString()}</div>
      ${chartHtml}
      ${tableHtml}
      <script>window.onload = function() { window.print(); }</script>
    </body></html>`);
    printWindow.document.close();
  }
}
