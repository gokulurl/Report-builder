import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

@Injectable({ providedIn: 'root' })
export class ExportService {
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
