'use client';

import { Download } from 'lucide-react';

export type ReportCsvRow = readonly (string | number | null)[];

function csvCell(value: ReportCsvRow[number]) {
  if (value === null) return '';
  const text = String(value);
  const spreadsheetText = typeof value === 'string' && (/^[=+@-]/.test(text.trimStart()) || /^[\t\r\n]/.test(text))
    ? "'" + text
    : text;
  return '"' + spreadsheetText.replaceAll('"', '""') + '"';
}

export function BusinessReportExport({ rows, filename }: { rows: readonly ReportCsvRow[]; filename: string }) {
  function download() {
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <button type="button" className="admin-button ml-auto shrink-0" onClick={download} aria-label="Export business report CSV">
      <Download className="size-4" aria-hidden />
      Export
    </button>
  );
}
