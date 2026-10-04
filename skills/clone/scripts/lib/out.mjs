// @ts-check

/**
 * A plain-text table, padded so it reads in any terminal and in an agent's
 * tool output, which strips colour.
 * @param {string[]} headers
 * @param {(string | number)[][]} rows
 */
export function table(headers, rows) {
  const cells = [headers, ...rows.map((r) => r.map((c) => String(c ?? '')))];
  const widths = headers.map((_, i) => Math.min(60, Math.max(...cells.map((r) => (r[i] ?? '').length))));
  const line = (/** @type {string[]} */ r) =>
    r
      .map((c, i) => {
        const s = c.length > widths[i] ? c.slice(0, widths[i] - 1) + '…' : c;
        return s.padEnd(widths[i]);
      })
      .join('  ')
      .trimEnd();
  return [line(cells[0]), widths.map((w) => '-'.repeat(w)).join('  '), ...cells.slice(1).map(line)].join('\n');
}

/**
 * A markdown table. Pipes inside a cell are escaped so a quote cannot break
 * the row.
 * @param {string[]} headers
 * @param {(string | number)[][]} rows
 */
export function mdTable(headers, rows) {
  const esc = (/** @type {unknown} */ c) => String(c ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
  return [
    `| ${headers.map(esc).join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n');
}

/** @param {number} n @param {number} [digits] */
export function pct(n, digits = 0) {
  return `${(Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)}%`;
}

/**
 * Print and exit. Commands call this for errors a user can act on, so the
 * message is the whole output, never a stack trace.
 * @param {string} message
 * @param {number} [code]
 * @returns {never}
 */
export function fail(message, code = 2) {
  process.stderr.write(message.trimEnd() + '\n');
  process.exit(code);
}

/** @param {string} s */
export function say(s = '') {
  process.stdout.write(s + '\n');
}
