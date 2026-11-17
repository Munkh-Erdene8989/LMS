/**
 * RFC 4180 CSV (CRLF, давхар хашилт), Excel-д кирилл зөв харагдахаар UTF-8 BOM-той.
 * Formula injection-оос сэргийлж `= + - @` (болон tab/CR)-ээр эхэлсэн текстийн өмнө `'` нэмнэ —
 * нэр, дансны эзэмшигчийн нэрийг багш өөрөө оруулдаг.
 */
export function toCsv(header: string[], rows: (string | number)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

function cell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
