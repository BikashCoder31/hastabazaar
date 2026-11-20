import type { ReadinessIssue } from '@/lib/products/category-fields';

export function describeRetainedHelp(detail: Record<string, unknown> = {}) {
  const issues: ReadinessIssue[] = [];
  const fields = new Set<string>();
  if (Array.isArray(detail.issues)) {
    for (const issue of detail.issues) {
      if (
        !issue ||
        typeof issue.field !== 'string' ||
        typeof issue.reason !== 'string' ||
        !['missing', 'invalid', 'policy', 'outside_scope'].includes(
          issue.code,
        ) ||
        fields.has(issue.field)
      )
        continue;
      fields.add(issue.field);
      issues.push({
        field: issue.field,
        code: issue.code,
        reason: issue.reason,
      });
    }
  }
  return {
    note: typeof detail.note === 'string' ? detail.note.trim() : '',
    requested: detail.intent === 'help',
    issues,
  };
}
