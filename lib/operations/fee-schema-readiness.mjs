/** Compare the entire reviewed SQL definition, preserving operators, grouping,
 * literal case and token boundaries. Only formatting/backtick quoting/word case
 * are normalized. Comments and unknown syntax fail closed, not stripped. */
export function sameFeeSqlDefinition(actual, expected) {
  function tokens(value) {
    if (typeof value !== 'string') return null;
    const source = value.trim().replace(/;$/, '');
    const pattern = /\s+|'(?:''|[^'\\])*'|`[a-z_][a-z0-9_]*`|[a-z_][a-z0-9_]*|\d+|<>|!=|<=|>=|[=<>(),;-]/giy;
    const result = [];
    let cursor = 0;
    while (cursor < source.length) {
      pattern.lastIndex = cursor;
      const match = pattern.exec(source);
      if (!match) return null;
      const token = match[0];
      if (!/^\s+$/.test(token)) result.push(token.startsWith("'") ? token : token.replaceAll('`', '').toLowerCase());
      cursor = pattern.lastIndex;
    }
    return JSON.stringify(result);
  }
  const left = tokens(actual), right = tokens(expected);
  return left !== null && right !== null && left === right;
}
