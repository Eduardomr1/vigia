export { analyzeFiles, analyzeSource, collectTestFiles, isTestFile } from './analyze';
export { applySuppressions, extractSuppressions } from './suppressions';
export type { InlineSuppression } from './suppressions';
export { countBySeverity, renderExecutiveTable, renderJson, renderReport } from './report';
export type { JsonReport } from './report';
export { parseArgs, resolveFailOn, runCli, shouldFail } from './cli';
export type { Args, CliRunResult, FailOnSeverity } from './cli';
export { renderSarif, validateSarifCompliance } from './sarif';
export {
  assertionInCatch,
  conditionalAssertion,
  duplicateTestTitle,
  expectWithoutMatcher,
  floatingTimerAssertion,
  focusedTest,
  identicalExpression,
  missingAwait,
  mockWithoutAssertion,
  noAssertion,
  redundantBooleanAssertion,
  referenceEqualityOnLiteral,
  rules,
  skippedTest,
  tautology,
  uninvokedMatcher,
  unreturnedPromiseAssertion,
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

