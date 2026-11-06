/**
 * Format of the comment posted on the Pull Request.
 *
 * In Markdown and grouped by file: whoever reads a PR reviews it file by
 * file, not rule by rule. Includes an executive summary table for quick
 * triage of blocker issues.
 */

import type { AnalysisResult, Finding, Severity } from './types';

const SEVERITY_ORDER: Record<Severity, number> = { P1: 0, P2: 1, P3: 2 };

/**
 * Renders an executive markdown table of findings sorted by severity and location.
 */
export function renderExecutiveTable(findings: readonly Finding[]): string {
  const sorted = [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );

  const rows = [
    '| File | Line | Severity | Rule | Message |',
    '| :--- | :---: | :---: | :--- | :--- |',
  ];

  for (const f of sorted) {
    const escapedMsg = f.message.replace(/\|/g, '\\|');
    rows.push(`| \`${f.file}\` | ${f.line} | **${f.severity}** | \`${f.rule}\` | ${escapedMsg} |`);
  }

  return rows.join('\n');
}

export function renderReport(result: AnalysisResult): string {
  const { findings, filesAnalyzed } = result;
  const plural = filesAnalyzed === 1 ? 'file' : 'files';

  if (findings.length === 0) {
    return `## Vigía\n\nNo findings in ${filesAnalyzed} test ${plural}.`;
  }

  const counts = countBySeverity(findings);
  const summary = (['P1', 'P2', 'P3'] as const)
    .filter((s) => counts[s] > 0)
    .map((s) => `**${counts[s]} ${s}**`)
    .join(' · ');

  const lines = [
    '## Vigía',
    '',
    `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'} in ${filesAnalyzed} ${plural}: ${summary}`,
    '',
    '### Executive Summary',
    '',
    renderExecutiveTable(findings),
    '',
  ];

  for (const [file, group] of groupByFile(findings)) {
    lines.push(`### \`${file}\``, '');
    for (const f of group) {
      lines.push(`- **${f.severity}** · line ${f.line} · \`${f.rule}\``);
      lines.push(`  ${f.message}`);
      lines.push(`  _${f.hint}_`);
    }
    lines.push('');
  }

  lines.push('<!-- vigia -->');
  return lines.join('\n');
}

export interface JsonReport {
  readonly summary: {
    readonly filesAnalyzed: number;
    readonly totalFindings: number;
    readonly p1: number;
    readonly p2: number;
    readonly p3: number;
  };
  readonly findings: readonly {
    readonly rule: string;
    readonly severity: Severity;
    readonly file: string;
    readonly line: number;
    readonly column: number;
    readonly message: string;
    readonly hint: string;
  }[];
}

export function renderJson(result: AnalysisResult): string {
  const counts = countBySeverity(result.findings);
  const payload: JsonReport = {
    summary: {
      filesAnalyzed: result.filesAnalyzed,
      totalFindings: result.findings.length,
      p1: counts.P1,
      p2: counts.P2,
      p3: counts.P3,
    },
    findings: result.findings.map((f) => ({
      rule: f.rule,
      severity: f.severity,
      file: f.file,
      line: f.line,
      column: f.column,
      message: f.message,
      hint: f.hint,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { P1: 0, P2: 0, P3: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

function groupByFile(findings: readonly Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const bucket = groups.get(f.file);
    if (bucket) bucket.push(f);
    else groups.set(f.file, [f]);
  }
  for (const group of groups.values()) {
    group.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line,
    );
  }
  return groups;
}
