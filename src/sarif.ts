import type { AnalysisResult, Severity } from './types';

export interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

export interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
}

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  helpUri?: string;
  defaultConfiguration: {
    level: 'error' | 'warning' | 'note';
  };
}

export interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: {
    physicalLocation: {
      artifactLocation: { uri: string };
      region: {
        startLine: number;
        startColumn: number;
      };
    };
  }[];
}

const SEVERITY_TO_LEVEL: Record<Severity, 'error' | 'warning' | 'note'> = {
  P1: 'error',
  P2: 'warning',
  P3: 'note',
};

const RULE_DESCRIPTIONS: Record<string, string> = {
  'no-assertion': 'Test contains no assertions and cannot fail.',
  'expect-without-matcher': 'Expect call has no matcher invoked.',
  'tautology': 'Assertion compares a literal against itself.',
  'identical-expression': 'Assertion compares an identical expression against itself.',
  'skipped-test': 'Test or suite is marked as skipped and ignored.',
  'focused-test': 'Test or suite is marked as focused (only/fit) in commit.',
  'missing-await': 'Async assertion or function is missing await keyword.',
  'assertion-in-catch': 'Assertion inside catch block without rejection verification.',
  'orphan-negative-assertion': 'Negative assertion has no positive baseline assertion.',
};

/**
 * Transforms Vigía analysis findings into the OASIS SARIF v2.1.0 standard,
 * enabling seamless integration with GitHub Code Scanning alerts.
 */
export function renderSarif(result: AnalysisResult, toolVersion = '1.3.0'): string {
  const rulesMap = new Map<string, SarifRule>();

  for (const f of result.findings) {
    if (!rulesMap.has(f.rule)) {
      rulesMap.set(f.rule, {
        id: f.rule,
        name: f.rule.replace(/(?:^|-)(\w)/g, (_, c) => c.toUpperCase()),
        shortDescription: {
          text: RULE_DESCRIPTIONS[f.rule] ?? `Test quality rule: ${f.rule}`,
        },
        helpUri: 'https://github.com/Eduardomr1/vigia#rules',
        defaultConfiguration: {
          level: SEVERITY_TO_LEVEL[f.severity],
        },
      });
    }
  }

  const results: SarifResult[] = result.findings.map((f) => ({
    ruleId: f.rule,
    level: SEVERITY_TO_LEVEL[f.severity],
    message: {
      text: `${f.message} (Hint: ${f.hint})`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: f.file.replace(/\\/g, '/'),
          },
          region: {
            startLine: f.line,
            startColumn: f.column,
          },
        },
      },
    ],
  }));

  const log: SarifLog = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'vigia',
            version: toolVersion,
            informationUri: 'https://github.com/Eduardomr1/vigia',
            rules: Array.from(rulesMap.values()),
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(log, null, 2);
}
