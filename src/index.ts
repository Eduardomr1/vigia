export { analyzeFiles, analyzeSource, collectTestFiles, isTestFile } from './analyze';
export { applySuppressions, extractSuppressions } from './suppressions';
export type { InlineSuppression } from './suppressions';
export { countBySeverity, renderExecutiveTable, renderReport } from './report';
export { renderSarif, validateSarifCompliance } from './sarif';
export {
  assertionInCatch,
  duplicateTestTitle,
  expectWithoutMatcher,
  floatingTimerAssertion,
  focusedTest,
  identicalExpression,
  missingAwait,
  noAssertion,
  redundantBooleanAssertion,
  rules,
  skippedTest,
  tautology,
  vacuousAssertion,
} from './rules';
export type { Rule, RuleContext } from './rules';
export type { AnalysisResult, Finding, Severity } from './types';
export type {
  SarifLog,
  SarifRun,
  SarifRule,
  SarifResult,
  SarifValidationResult,
} from './sarif';

