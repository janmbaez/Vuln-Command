const FORMULA_PREFIX = /^[\s\t\r\n]*[=+\-@]/;

export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const sanitized = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

export function downloadCsv(filename: string, rows: unknown[][]): void {
  const csv = rows.map(csvRow).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
