import { runCli } from './cli';
import { countBySeverity, renderExecutiveTable, renderJson, renderReport } from './report';
import type { Finding } from './types';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    rule: 'no-assertion',
    severity: 'P1',
    file: 'src/a.test.ts',
    line: 10,
    column: 3,
    message: 'Test "x" contains no assertion.',
    hint: 'Add an expect.',
    ...overrides,
  };
}

describe('renderReport', () => {
  it('reports when there are no findings', () => {
    const report = renderReport({ findings: [], filesAnalyzed: 4 });
    expect(report).toContain('No findings in 4 test files');
  });

  it('matches the singular with a single file', () => {
    expect(renderReport({ findings: [], filesAnalyzed: 1 })).toContain('1 test file');
  });

  it('includes the summary by severity', () => {
    const report = renderReport({
      findings: [finding(), finding({ severity: 'P3' })],
      filesAnalyzed: 1,
    });
    expect(report).toContain('**1 P1**');
    expect(report).toContain('**1 P3**');
  });

  it('omits severities with no findings', () => {
    const report = renderReport({ findings: [finding()], filesAnalyzed: 1 });
    expect(report).not.toContain('P2');
  });

  it('groups by file', () => {
    const report = renderReport({
      findings: [finding({ file: 'a.test.ts' }), finding({ file: 'b.test.ts' })],
      filesAnalyzed: 2,
    });
    expect(report).toContain('`a.test.ts`');
    expect(report).toContain('`b.test.ts`');
  });

  it('sorts P1s before P3s within a file', () => {
    const report = renderReport({
      findings: [finding({ severity: 'P3', line: 1 }), finding({ severity: 'P1', line: 99 })],
      filesAnalyzed: 1,
    });
    expect(report.indexOf('**P1**')).toBeLessThan(report.indexOf('**P3**'));
  });

  it('includes the fix suggestion', () => {
    expect(renderReport({ findings: [finding()], filesAnalyzed: 1 })).toContain(
      'Add an expect.',
    );
  });

  it('leaves a marker so the comment can be updated', () => {
    expect(renderReport({ findings: [finding()], filesAnalyzed: 1 })).toContain(
      '<!-- vigia -->',
    );
  });

  it('includes executive summary table header and row entries', () => {
    const report = renderReport({
      findings: [
        finding({ file: 'src/core.test.ts', line: 42, rule: 'no-assertion', severity: 'P1' }),
      ],
      filesAnalyzed: 1,
    });
    expect(report).toContain('### Executive Summary');
    expect(report).toContain('| File | Line | Severity | Rule | Message |');
    expect(report).toContain('| `src/core.test.ts` | 42 | **P1** | `no-assertion` |');
  });
});

describe('renderExecutiveTable', () => {
  it('formats rows and escapes pipe characters in message', () => {
    const table = renderExecutiveTable([
      finding({ message: 'Found pipe | character in assertion' }),
    ]);
    expect(table).toContain('Found pipe \\| character in assertion');
    expect(table).toContain('| :--- | :---: | :---: | :--- | :--- |');
  });
});

describe('countBySeverity', () => {
  it('counts by severity', () => {
    expect(
      countBySeverity([finding(), finding(), finding({ severity: 'P2' })]),
    ).toEqual({ P1: 2, P2: 1, P3: 0 });
  });

  it('returns zeros with no findings', () => {
    expect(countBySeverity([])).toEqual({ P1: 0, P2: 0, P3: 0 });
  });
});

describe('renderJson', () => {
  it('formats clean JSON structure for empty findings', () => {
    const jsonStr = renderJson({ findings: [], filesAnalyzed: 3 });
    const parsed = JSON.parse(jsonStr);

    expect(parsed).toEqual({
      summary: {
        filesAnalyzed: 3,
        totalFindings: 0,
        p1: 0,
        p2: 0,
        p3: 0,
      },
      findings: [],
    });
  });

  it('formats JSON structure with findings and severity totals', () => {
    const f1 = finding({ rule: 'uninvoked-matcher', severity: 'P1', line: 12, column: 5 });
    const f2 = finding({ rule: 'conditional-assertion', severity: 'P2', line: 25, column: 9 });
    const jsonStr = renderJson({ findings: [f1, f2], filesAnalyzed: 2 });
    const parsed = JSON.parse(jsonStr);

    expect(parsed.summary).toEqual({
      filesAnalyzed: 2,
      totalFindings: 2,
      p1: 1,
      p2: 1,
      p3: 0,
    });
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings[0]).toEqual({
      rule: 'uninvoked-matcher',
      severity: 'P1',
      file: 'src/a.test.ts',
      line: 12,
      column: 5,
      message: 'Test "x" contains no assertion.',
      hint: 'Add an expect.',
    });
  });
});

describe('CLI markdown formatting', () => {
  it('outputs markdown comment with executive summary via --format markdown', () => {
    const result = runCli(['--files', 'src/report.test.ts', '--format', 'markdown'], { writeStdout: false });
    expect(result.outputText).toContain('## Vigía');
    expect(result.outputText).toContain('No findings in 1 test file.');
  });
});
