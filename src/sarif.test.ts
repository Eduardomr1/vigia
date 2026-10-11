import { renderSarif, type SarifLog } from './sarif';
import type { AnalysisResult } from './types';

describe('renderSarif', () => {
  it('generates valid SARIF with empty results when there are no findings', () => {
    const emptyResult: AnalysisResult = {
      filesAnalyzed: 5,
      findings: [],
    };

    const output = renderSarif(emptyResult);
    const parsed = JSON.parse(output) as SarifLog;

    expect(parsed.version).toBe('2.1.0');
    expect(parsed.$schema).toContain('sarif-schema-2.1.0.json');
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0]?.tool.driver.name).toBe('vigia');
    expect(parsed.runs[0]?.results).toEqual([]);
    expect(parsed.runs[0]?.tool.driver.rules).toEqual([]);
  });

  it('maps findings and severities to SARIF results and rules', () => {
    const sampleResult: AnalysisResult = {
      filesAnalyzed: 2,
      findings: [
        {
          rule: 'identical-expression',
          severity: 'P1',
          file: 'tests\\auth.test.ts',
          line: 42,
          column: 5,
          message: 'expect(user.id).toBe(user.id) compares an expression against itself.',
          hint: 'Compare the result against the expected outcome.',
        },
        {
          rule: 'skipped-test',
          severity: 'P3',
          file: 'tests/billing.test.ts',
          line: 12,
          column: 1,
          message: 'Test marked as skipped.',
          hint: 'Remove skip or address the underlying failure.',
        },
      ],
    };

    const output = renderSarif(sampleResult, '1.3.0');
    const parsed = JSON.parse(output) as SarifLog;

    expect(parsed.runs[0]?.tool.driver.version).toBe('1.3.0');
    expect(parsed.runs[0]?.results).toHaveLength(2);

    // Rule 1: identical-expression -> level: error (P1)
    const res1 = parsed.runs[0]?.results[0];
    expect(res1?.ruleId).toBe('identical-expression');
    expect(res1?.level).toBe('error');
    expect(res1?.locations[0]?.physicalLocation.artifactLocation.uri).toBe('tests/auth.test.ts');
    expect(res1?.locations[0]?.physicalLocation.region.startLine).toBe(42);
    expect(res1?.locations[0]?.physicalLocation.region.startColumn).toBe(5);

    // Rule 2: skipped-test -> level: note (P3)
    const res2 = parsed.runs[0]?.results[1];
    expect(res2?.ruleId).toBe('skipped-test');
    expect(res2?.level).toBe('note');
    expect(res2?.locations[0]?.physicalLocation.artifactLocation.uri).toBe('tests/billing.test.ts');

    // Rules metadata
    const rules = parsed.runs[0]?.tool.driver.rules;
    expect(rules).toHaveLength(2);
    expect(rules?.find((r) => r.id === 'identical-expression')?.defaultConfiguration.level).toBe('error');
    expect(rules?.find((r) => r.id === 'skipped-test')?.defaultConfiguration.level).toBe('note');
  });

  it('normalizes windows backward slashes in file paths', () => {
    const result: AnalysisResult = {
      filesAnalyzed: 1,
      findings: [
        {
          rule: 'no-assertion',
          severity: 'P1',
          file: 'src\\features\\users\\user.test.ts',
          line: 10,
          column: 3,
          message: 'Test has no expect.',
          hint: 'Add an assertion.',
        },
      ],
    };

    const parsed = JSON.parse(renderSarif(result)) as SarifLog;
    expect(parsed.runs[0]?.results[0]?.locations[0]?.physicalLocation.artifactLocation.uri).toBe(
      'src/features/users/user.test.ts',
    );
  });
});
