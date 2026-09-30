import fs from 'node:fs';
import path from 'node:path';
import { CliError } from './errors.mjs';

function tabularRows(result) {
  for (const key of ['items', 'words', 'categories', 'priceSegs']) {
    if (Array.isArray(result?.[key])) return result[key];
  }
  if (Array.isArray(result?.trend)) return result.trend;
  if (result?.trend && typeof result.trend === 'object') {
    const array = Object.values(result.trend).find(Array.isArray);
    if (array) return array;
  }
  return [result];
}

function plainCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function csvEscape(value) {
  const text = String(plainCell(value));
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function preflight(file, force) {
  const absolute = path.resolve(file);
  if (fs.existsSync(absolute) && !force) {
    throw new CliError('OUTPUT_EXISTS', `Output file already exists: ${absolute}`, { hint: 'Choose a new path or pass --force to replace this known file.' });
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return absolute;
}

export async function writeOutput(result, file, { format, force = false } = {}) {
  const absolute = preflight(file, force);
  const selected = (format || path.extname(absolute).slice(1) || 'json').toLowerCase();
  if (!['json', 'csv', 'xlsx'].includes(selected)) throw new CliError('UNSUPPORTED_FORMAT', `Unsupported output format: ${selected}`);
  if (selected === 'json') {
    fs.writeFileSync(absolute, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  } else if (selected === 'csv') {
    const rows = tabularRows(result);
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
    const csv = [headers.map(csvEscape).join(','), ...rows.map((row) => headers.map((header) => csvEscape(row?.[header])).join(','))].join('\n');
    fs.writeFileSync(absolute, `\uFEFF${csv}\n`, { mode: 0o600 });
  } else {
    const { default: writeExcelFile } = await import('write-excel-file/node');
    const rows = tabularRows(result);
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
    const sheetData = [
      headers.map((header) => ({ value: header, fontWeight: 'bold', backgroundColor: '#EAF2F8' })),
      ...rows.map((row) => headers.map((header) => plainCell(row?.[header])))
    ];
    const columns = headers.map((header) => ({ width: Math.min(60, Math.max(12, header.length + 2)) }));
    await writeExcelFile(sheetData, { columns, stickyRowsCount: 1 }).toFile(absolute);
    try { fs.chmodSync(absolute, 0o600); } catch {}
  }
  const stat = fs.statSync(absolute);
  return { path: absolute, format: selected, bytes: stat.size, mode: (stat.mode & 0o777).toString(8) };
}
