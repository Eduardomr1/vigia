import { extractSuppressions } from './suppressions';

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
