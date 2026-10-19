/**
 * Inline suppression comments parser and validator for Vigía.
 *
 * Allows developers to suppress false positives or intentional design choices
 * on the immediately following line using:
 *
 * // vigia-ignore-next-line <rule-id> -- <justification>
 * or
 * /* vigia-ignore-next-line <rule-id> -- <justification> *\/
 *
 * Vigía enforces that every suppression must provide a non-empty justification
 * to prevent blind silencing of failing test detections.
 */

import type { Finding } from './types';

export interface InlineSuppression {
  /** 1-based line where the suppression comment appears */
  readonly commentLine: number;
  /** 1-based line being suppressed (commentLine + 1) */
  readonly targetLine: number;
  /** Specific rule IDs suppressed, or ['*'] for all rules */
  readonly rules: readonly string[];
  /** Mandatory or optional justification explaining why the suppression is required */
  readonly reason?: string;
  /** 1-based column of the suppression marker */
  readonly column: number;
}

const SUPPRESSION_TRIGGER = 'vigia-ignore-next-line';

/**
 * Extracts inline suppression directives from file source code.
 */
export function extractSuppressions(code: string): InlineSuppression[] {
  const lines = code.split(/\r?\n/);
  const suppressions: InlineSuppression[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    if (rawLine === undefined) continue;

    const triggerPos = rawLine.indexOf(SUPPRESSION_TRIGGER);
    if (triggerPos === -1) continue;

    // Check that it occurs inside a comment marker (// or /*)
    const prefix = rawLine.slice(0, triggerPos).trim();
    if (!prefix.endsWith('//') && !prefix.endsWith('/*') && !prefix.includes('//') && !prefix.includes('/*')) {
      continue;
    }

    const commentLine = lineIndex + 1;
    const targetLine = commentLine + 1;
    const column = triggerPos + 1;

    let payload = rawLine.slice(triggerPos + SUPPRESSION_TRIGGER.length).trim();
    if (payload.endsWith('*/')) {
      payload = payload.slice(0, -2).trim();
    }

    let rulePart = '';
    let reasonPart: string | undefined;

    const dashIndex = payload.indexOf('--');
    if (dashIndex !== -1) {
      rulePart = payload.slice(0, dashIndex).trim();
      const rawReason = payload.slice(dashIndex + 2).trim();
      if (rawReason.length > 0) {
        reasonPart = rawReason;
      }
    } else {
      rulePart = payload.trim();
    }

    let rules: string[];
    if (rulePart.length === 0) {
      rules = ['*'];
    } else {
      rules = rulePart
        .split(/[,\s]+/)
        .map((r) => r.trim())
        .filter((r) => r.length > 0);
      if (rules.length === 0) {
        rules = ['*'];
      }
    }

    suppressions.push({
      commentLine,
      targetLine,
      rules,
      ...(reasonPart ? { reason: reasonPart } : {}),
      column,
    });
  }

  return suppressions;
}

/**
 * Applies inline suppressions to findings, removing suppressed findings and generating
 * warnings for unjustified or unused suppression comments.
 */
export function applySuppressions(
  findings: readonly Finding[],
  suppressions: readonly InlineSuppression[],
  file: string,
): Finding[] {
  const result: Finding[] = [];
  const usedSuppressions = new Set<InlineSuppression>();

  for (const s of suppressions) {
    if (!s.reason || s.reason.trim().length === 0) {
      result.push({
        rule: 'unjustified-suppression',
        severity: 'P2',
        file,
        line: s.commentLine,
        column: s.column,
        message: 'Inline suppression directive requires a justification reason after "-- <reason>".',
        hint: 'Provide a concise justification for silencing test health findings.',
      });
    }
  }

  for (const finding of findings) {
    const matching = suppressions.find(
      (s) => s.targetLine === finding.line && (s.rules.includes('*') || s.rules.includes(finding.rule)),
    );
    if (matching) {
      usedSuppressions.add(matching);
    } else {
      result.push(finding);
    }
  }

  for (const s of suppressions) {
    if (!usedSuppressions.has(s)) {
      result.push({
        rule: 'unused-suppression',
        severity: 'P3',
        file,
        line: s.commentLine,
        column: s.column,
        message: `Unused suppression comment. No finding matching "${s.rules.join(', ')}" was detected on line ${s.targetLine}.`,
        hint: 'Remove this obsolete suppression comment.',
      });
    }
  }

  return result.sort((a, b) => a.line - b.line || a.column - b.column);
}
