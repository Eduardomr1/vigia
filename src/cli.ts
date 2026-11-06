#!/usr/bin/env node
/**
 * Usage:
 *   vigia [path]               analyzes the tests and flows under that path
 *   vigia --files a.ts b.ts    analyzes specific files (the PR's own)
 *   vigia --src ./src          source root, enables detection of orphan
 *                              negative assertions
 *   vigia --format markdown    emits the comment ready to post on PR
 *   vigia --format sarif       emits OASIS SARIF v2.1.0 for GitHub Code Scanning
 *   vigia -o results.sarif     redirects output to a file
 *
 * Exit code 1 when there's a P1 finding: that's what fails the CI job.
 */

import fs from 'node:fs';
import path from 'node:path';
import { analyzeFiles, collectTestFiles } from './analyze';
import { countBySeverity, renderJson, renderReport } from './report';
import { renderSarif } from './sarif';
import type { Finding } from './types';

export type FailOnSeverity = 'P1' | 'P2' | 'P3';

export interface Args {
  readonly files: string[];
  readonly format: string;
  readonly root: string;
  readonly sourceRoot?: string;
  readonly output?: string;
  readonly failOn?: FailOnSeverity;
}

export interface CliRunResult {
  readonly exitCode: number;
  readonly outputText: string;
  readonly outputFile?: string;
}

export function resolveFailOn(raw?: string): FailOnSeverity {
  const upper = raw?.trim().toUpperCase();
  if (upper === 'P2') return 'P2';
  if (upper === 'P3') return 'P3';
  return 'P1';
}

export function shouldFail(findings: readonly Finding[], failOn: FailOnSeverity = 'P1'): boolean {
  const counts = countBySeverity(findings);
  if (failOn === 'P3') {
    return counts.P1 > 0 || counts.P2 > 0 || counts.P3 > 0;
  }
  if (failOn === 'P2') {
    return counts.P1 > 0 || counts.P2 > 0;
  }
  return counts.P1 > 0;
}

/**
 * Walked by position, not by value: `--src ./demo ./demo` repeats the same
 * text in two different roles, and filtering by value would have dropped
 * the positional one.
 */
export function parseArgs(argv: readonly string[]): Args {
  const files: string[] = [];
  let format = 'text';
  let root: string | undefined;
  let sourceRoot: string | undefined;
  let output: string | undefined;
  let failOn: FailOnSeverity | undefined;
  let collectingFiles = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === '--files') {
      collectingFiles = true;
      continue;
    }

    if (arg === '--format') {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        format = next;
        i += 1;
      }
      collectingFiles = false;
      continue;
    }

    if (arg.startsWith('--format=')) {
      format = arg.slice('--format='.length);
      collectingFiles = false;
      continue;
    }

    if (arg === '--fail-on') {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        failOn = resolveFailOn(next);
        i += 1;
      }
      collectingFiles = false;
      continue;
    }

    if (arg.startsWith('--fail-on=')) {
      failOn = resolveFailOn(arg.slice('--fail-on='.length));
      collectingFiles = false;
      continue;
    }

    if (arg === '--output' || arg === '-o') {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        output = next;
        i += 1;
      }
      collectingFiles = false;
      continue;
    }

    if (arg.startsWith('--output=')) {
      output = arg.slice('--output='.length);
      collectingFiles = false;
      continue;
    }

    if (arg.startsWith('-o=')) {
      output = arg.slice('-o='.length);
      collectingFiles = false;
      continue;
    }

    if (arg === '--src') {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        sourceRoot = next;
        i += 1;
      }
      collectingFiles = false;
      continue;
    }

    if (arg.startsWith('--src=')) {
      sourceRoot = arg.slice('--src='.length);
      collectingFiles = false;
      continue;
    }

    if (arg.startsWith('--') || (arg.startsWith('-') && arg.length > 1)) {
      collectingFiles = false;
      continue;
    }

    if (collectingFiles) {
      files.push(arg);
    } else {
      root ??= arg;
    }
  }

  return {
    files,
    format: format.trim(),
    root: root ?? '.',
    ...(sourceRoot ? { sourceRoot } : {}),
    ...(output ? { output } : {}),
    ...(failOn ? { failOn } : {}),
  };
}

export function runCli(
  argv: readonly string[] = process.argv.slice(2),
  options?: { writeStdout?: boolean },
): CliRunResult {
  const { files, format, root, sourceRoot, output, failOn } = parseArgs(argv);
  const targets = files.length > 0 ? files : collectTestFiles(root);
  const result = analyzeFiles(targets, sourceRoot ? { sourceRoot } : {});

  let outputText = '';
  const normalizedFormat = format.toLowerCase();

  if (normalizedFormat === 'sarif') {
    outputText = renderSarif(result);
  } else if (normalizedFormat === 'markdown') {
    outputText = `${renderReport(result)}\n`;
  } else if (normalizedFormat === 'json') {
    outputText = `${renderJson(result)}\n`;
  } else if (result.findings.length === 0) {
    outputText = `No findings in ${result.filesAnalyzed} file(s).\n`;
  } else {
    const lines = result.findings.map(
      (f) => `${f.file}:${f.line}:${f.column}  ${f.severity}  ${f.rule}  ${f.message}`,
    );
    const counts = countBySeverity(result.findings);
    lines.push(`\n${result.findings.length} finding(s): ${counts.P1} P1, ${counts.P2} P2, ${counts.P3} P3\n`);
    outputText = lines.join('\n');
  }

  if (output) {
    const dir = path.dirname(output);
    if (dir && dir !== '.') {
      fs.mkdirSync(dir, { recursive: true });
    }
    const finalContent = outputText.endsWith('\n') ? outputText : `${outputText}\n`;
    fs.writeFileSync(output, finalContent, 'utf8');
  } else if (options?.writeStdout ?? true) {
    process.stdout.write(outputText.endsWith('\n') ? outputText : `${outputText}\n`);
  }

  const failThreshold = failOn ?? 'P1';
  const exitCode = shouldFail(result.findings, failThreshold) ? 1 : 0;
  return {
    exitCode,
    outputText,
    ...(output ? { outputFile: output } : {}),
  };
}

export function main(): void {
  const { exitCode } = runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}

if (typeof require !== 'undefined' && require.main === module) {
  main();
}

