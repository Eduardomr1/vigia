import { analyzeSource } from './analyze';
import { applySuppressions, extractSuppressions } from './suppressions';
import type { Finding } from './types';

describe('extractSuppressions', () => {
  it('extracts single-line suppression with rule and reason', () => {
    const code = `
      // vigia-ignore-next-line duplicate-test-title -- intentional duplicate snapshot
      it('renders correctly', () => {});
    `;
    const result = extractSuppressions(code);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      commentLine: 2,
      targetLine: 3,
      rules: ['duplicate-test-title'],
      reason: 'intentional duplicate snapshot',
      column: expect.any(Number),
    });
  });

  it('extracts block comment suppression', () => {
    const code = `
      /* vigia-ignore-next-line no-assertion -- legacy test migration */
      test('legacy run', () => {});
    `;
    const result = extractSuppressions(code);
    expect(result).toHaveLength(1);
    expect(result[0]?.rules).toEqual(['no-assertion']);
    expect(result[0]?.reason).toBe('legacy test migration');
    expect(result[0]?.targetLine).toBe(3);
  });

  it('handles wildcard suppression when no specific rule is passed', () => {
    const code = `
      // vigia-ignore-next-line -- external integration test
      it('calls api', () => {});
    `;
    const result = extractSuppressions(code);
    expect(result).toHaveLength(1);
    expect(result[0]?.rules).toEqual(['*']);
    expect(result[0]?.reason).toBe('external integration test');
  });

  it('captures suppression without reason', () => {
    const code = `
      // vigia-ignore-next-line tautology
      expect(true).toBe(true);
    `;
    const result = extractSuppressions(code);
    expect(result).toHaveLength(1);
    expect(result[0]?.rules).toEqual(['tautology']);
    expect(result[0]?.reason).toBeUndefined();
  });

  it('parses multiple rules separated by comma or space', () => {
    const code = `
      // vigia-ignore-next-line duplicate-test-title, no-assertion -- dual suppression
      it('complex legacy test', () => {});
    `;
    const result = extractSuppressions(code);
    expect(result).toHaveLength(1);
    expect(result[0]?.rules).toEqual(['duplicate-test-title', 'no-assertion']);
    expect(result[0]?.reason).toBe('dual suppression');
  });

  it('ignores lines without comment syntax even if trigger word appears in string', () => {
    const code = `
      const msg = "vigia-ignore-next-line should not trigger";
      it('valid', () => { expect(1).toBe(1); });
    `;
    const result = extractSuppressions(code);
    expect(result).toHaveLength(0);
  });
});

describe('applySuppressions', () => {
  const dummyFinding: Finding = {
    rule: 'tautology',
    severity: 'P1',
    file: 'demo.test.ts',
    line: 5,
    column: 5,
    message: 'Tautology detected',
    hint: 'Fix assertion',
  };

  it('filters out matching finding on target line', () => {
    const suppressions = [
      {
        commentLine: 4,
        targetLine: 5,
        rules: ['tautology'],
        reason: 'verified baseline equivalence',
        column: 1,
      },
    ];

    const findings = applySuppressions([dummyFinding], suppressions, 'demo.test.ts');
    expect(findings).toHaveLength(0);
  });

  it('emits unjustified-suppression when suppression lacks reason', () => {
    const suppressions = [
      {
        commentLine: 4,
        targetLine: 5,
        rules: ['tautology'],
        column: 1,
      },
    ];

    const findings = applySuppressions([dummyFinding], suppressions, 'demo.test.ts');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('unjustified-suppression');
    expect(findings[0]?.severity).toBe('P2');
  });

  it('emits unused-suppression warning when suppression targets a line with no violations', () => {
    const suppressions = [
      {
        commentLine: 10,
        targetLine: 11,
        rules: ['no-assertion'],
        reason: 'supposedly has no assertion',
        column: 1,
      },
    ];

    const findings = applySuppressions([], suppressions, 'demo.test.ts');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('unused-suppression');
    expect(findings[0]?.severity).toBe('P3');
  });

  it('integrates seamlessly with analyzeSource', () => {
    const code = `
      it('suppressed tautology', () => {
        // vigia-ignore-next-line tautology -- testing custom equivalence
        expect(1).toBe(1);
      });
    `;
    const findings = analyzeSource('test.spec.ts', code);
    expect(findings.filter((f) => f.rule === 'tautology')).toHaveLength(0);
    expect(findings.filter((f) => f.rule === 'unused-suppression')).toHaveLength(0);
  });

  it('suppresses uninvoked-matcher and conditional-assertion when annotated with valid justification', () => {
    const code = `
      it('suppresses new AST rules with reason', () => {
        // vigia-ignore-next-line uninvoked-matcher -- testing property reference
        expect(target).toBeDefined;

        if (ready) {
          // vigia-ignore-next-line conditional-assertion -- testing intentional branch
          expect(ready).toBe(true);
        }
      });
    `;
    const findings = analyzeSource('test.spec.ts', code);
    expect(findings.filter((f) => f.rule === 'uninvoked-matcher')).toHaveLength(0);
    expect(findings.filter((f) => f.rule === 'conditional-assertion')).toHaveLength(0);
    expect(findings.filter((f) => f.rule === 'unused-suppression')).toHaveLength(0);
  });
});
