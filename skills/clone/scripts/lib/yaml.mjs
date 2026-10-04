// @ts-check

/**
 * A YAML scalar, quoted whenever plain YAML could read it as something else
 * (a number, a boolean, a comment, a mapping).
 * @param {unknown} v
 */
function scalar(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v === null || v === undefined) return '""';
  const s = String(v);
  const plain = /^[A-Za-z_][A-Za-z0-9 _./()-]*$/.test(s) && !/^(true|false|yes|no|on|off|null|~)$/i.test(s) && !s.endsWith(' ');
  return plain ? s : JSON.stringify(s);
}

/**
 * Plain nested maps and lists as block YAML. Enough for a DESIGN.md front
 * matter, which is all this is used for.
 * @param {unknown} value
 * @param {number} [indent]
 * @returns {string}
 */
export function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]`;
    return value
      .map((item) => (item && typeof item === 'object' ? `${pad}-\n${toYaml(item, indent + 2)}` : `${pad}- ${scalar(item)}`))
      .join('\n');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        const key = /^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k);
        if (v && typeof v === 'object' && (Array.isArray(v) ? v.length : Object.keys(v).length)) return `${pad}${key}:\n${toYaml(v, indent + 2)}`;
        if (v && typeof v === 'object') return `${pad}${key}: ${Array.isArray(v) ? '[]' : '{}'}`;
        return `${pad}${key}: ${scalar(v)}`;
      })
      .join('\n');
  }
  return pad + scalar(value);
}
