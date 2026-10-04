// @ts-check
import fs from 'node:fs';
import path from 'node:path';

/**
 * RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, CRLF.
 * Reviews are pasted from real pages, so all of those turn up in practice.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Rows as objects keyed by lowercased header. `__line` keeps the file line so
 * an error can say where to look.
 * @param {string} text
 * @returns {{ columns: string[], records: Record<string, string>[] }}
 */
export function csvObjects(text) {
  const rows = parseCsv(text).filter((r) => !(r.length === 1 && r[0].trim() === ''));
  if (!rows.length) return { columns: [], records: [] };
  const columns = rows[0].map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((r, idx) => {
    /** @type {Record<string, string>} */
    const o = {};
    columns.forEach((c, j) => {
      o[c] = (r[j] ?? '').trim();
    });
    o.__line = String(idx + 2);
    return o;
  });
  return { columns, records };
}

/** @param {string} file */
export function readCsv(file) {
  return csvObjects(fs.readFileSync(file, 'utf8'));
}

/**
 * @param {string[]} columns
 * @param {Record<string, unknown>[]} records
 */
export function toCsv(columns, records) {
  const esc = (/** @type {unknown} */ v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...records.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

/**
 * Append rows to a CSV, writing the header first if the file is new, and
 * skipping rows whose key already exists so a re-run never duplicates.
 * @param {string} file
 * @param {string[]} columns
 * @param {Record<string, unknown>[]} rows
 * @param {string} key the column that identifies a row
 * @returns {{ added: number, skipped: number }}
 */
export function appendCsv(file, columns, rows, key) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let existing = new Set();
  let cols = columns;
  if (fs.existsSync(file)) {
    const { columns: have, records } = readCsv(file);
    if (have.length) cols = have;
    existing = new Set(records.map((r) => r[key]));
  }
  const fresh = rows.filter((r) => !existing.has(String(r[key] ?? '')));
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').trim() === '') {
    fs.writeFileSync(file, toCsv(cols, fresh));
  } else if (fresh.length) {
    const body = toCsv(cols, fresh).split('\n').slice(1).join('\n');
    const current = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, (current.endsWith('\n') ? current : current + '\n') + body);
  }
  return { added: fresh.length, skipped: rows.length - fresh.length };
}
