import { analyzeSource } from './analyze';
import {
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
  skippedTest,
  tautology,
  uninvokedMatcher,
  vacuousAssertion,
} from './rules';

function findings(code: string, rule: Parameters<typeof analyzeSource>[2]) {
  return analyzeSource('ejemplo.test.ts', code, rule);
}

describe('noAssertion', () => {
  it('detects a test with no expect', () => {
    const result = findings(
      `it('suma dos numeros', () => {
         const total = 1 + 1;
       });`,
      [noAssertion],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('no-assertion');
    expect(result[0]?.message).toContain('suma dos numeros');
  });

  it('accepts a test with expect', () => {
    expect(
      findings(`it('suma', () => { expect(1 + 1).toBe(2); });`, [noAssertion]),
    ).toEqual([]);
  });

  it('recognizes an expect nested inside a callback', () => {
    expect(
      findings(
        `it('itera', () => { [1, 2].forEach((n) => { expect(n).toBeGreaterThan(0); }); });`,
        [noAssertion],
      ),
    ).toEqual([]);
  });

  it('accepts an async test with expect', () => {
    expect(
      findings(`it('espera', async () => { await expect(f()).resolves.toBe(1); });`, [
        noAssertion,
      ]),
    ).toEqual([]);
  });

  // An expect inside a comment or a string isn't an assertion: that's why
  // the analysis uses the AST instead of regular expressions.
  it('is not fooled by an expect inside a comment', () => {
    expect(
      findings(`it('finge', () => { /* expect(1).toBe(1) */ const x = 1; });`, [
        noAssertion,
      ]),
    ).toHaveLength(1);
  });

  it('is not fooled by an expect inside a string', () => {
    expect(
      findings(`it('finge', () => { const s = 'expect(1).toBe(1)'; });`, [noAssertion]),
    ).toHaveLength(1);
  });

  it('works with test() as well as it()', () => {
    expect(findings(`test('vacia', () => {});`, [noAssertion])).toHaveLength(1);
  });

  it('reports the correct line', () => {
    const result = findings(`\n\nit('vacia', () => {});`, [noAssertion]);
    expect(result[0]?.line).toBe(3);
  });
});

describe('expectWithoutMatcher', () => {
  it('detects a bare expect()', () => {
    const result = findings(`it('a', () => { expect(valor); });`, [expectWithoutMatcher]);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('expect-without-matcher');
  });

  it('accepts expect with a matcher', () => {
    expect(
      findings(`it('a', () => { expect(valor).toBe(1); });`, [expectWithoutMatcher]),
    ).toEqual([]);
  });

  it('accepts expect with a negated matcher', () => {
    expect(
      findings(`it('a', () => { expect(valor).not.toBe(1); });`, [expectWithoutMatcher]),
    ).toEqual([]);
  });
});

describe('tautology', () => {
  it('detects expect(true).toBe(true)', () => {
    const result = findings(`it('a', () => { expect(true).toBe(true); });`, [tautology]);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('tautology');
  });

  it.each([
    `expect(1).toBe(1)`,
    `expect('x').toEqual('x')`,
    `expect(null).toStrictEqual(null)`,
  ])('detects %s', (assertion) => {
    expect(findings(`it('a', () => { ${assertion}; });`, [tautology])).toHaveLength(1);
  });

  it('accepts comparing a variable against a literal', () => {
    expect(findings(`it('a', () => { expect(total).toBe(2); });`, [tautology])).toEqual([]);
  });

  it('accepts different literals: that actually can fail', () => {
    expect(findings(`it('a', () => { expect(1).toBe(2); });`, [tautology])).toEqual([]);
  });
});

describe('skippedTest', () => {
  it.each(['it.skip', 'test.skip', 'describe.skip', 'xit', 'xdescribe'])(
    'detects %s',
    (form) => {
      const result = findings(`${form}('algo', () => { expect(1).toBe(2); });`, [
        skippedTest,
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]?.severity).toBe('P3');
    },
  );

  it('accepts an active test', () => {
    expect(
      findings(`it('activa', () => { expect(1).toBe(2); });`, [skippedTest]),
    ).toEqual([]);
  });
});

describe('focusedTest', () => {
  it.each(['it.only', 'describe.only', 'test.only'])('detects %s', (form) => {
    const result = findings(`${form}('algo', () => { expect(1).toBe(2); });`, [
      focusedTest,
    ]);
    expect(result).toHaveLength(1);
    // It's P1: in CI it silences the rest of the suite without warning.
    expect(result[0]?.severity).toBe('P1');
  });

  it('accepts a normal test', () => {
    expect(findings(`it('normal', () => { expect(1).toBe(2); });`, [focusedTest])).toEqual(
      [],
    );
  });
});

describe('all the rules together', () => {
  it('sorts findings by line', () => {
    const result = analyzeSource(
      'x.test.ts',
      `it.only('enfocada', () => { expect(1).toBe(1); });
       it('vacia', () => {});`,
    );

    expect(result.length).toBeGreaterThan(1);
    const lines = result.map((f) => f.line);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
  });

  it('reports nothing in a healthy file', () => {
    expect(
      analyzeSource(
        'sano.test.ts',
        `describe('suma', () => {
           it('suma dos numeros', () => {
             expect(sumar(1, 2)).toBe(3);
           });
         });`,
      ),
    ).toEqual([]);
  });

  it('tolerates code with syntax errors without throwing', () => {
    expect(() => analyzeSource('roto.test.ts', `it('a', () => { expect(`)).not.toThrow();
  });
});

describe('uncommon ways of declaring tests', () => {
  it('recognizes it.each with a tagged template', () => {
    const result = findings(
      'it.each`\n  a\n  ${1}\n`("caso $a", () => {});',
      [noAssertion],
    );
    expect(result).toHaveLength(1);
  });

  it('recognizes a test written with function() instead of an arrow', () => {
    expect(
      findings(`it('clasica', function () { const x = 1; });`, [noAssertion]),
    ).toHaveLength(1);
  });

  it('ignores a call with no body, like it.todo', () => {
    // it.todo only carries a title: there's no body to inspect, and the
    // skipped-test rule already covers it.
    expect(findings(`it.todo('pendiente');`, [noAssertion])).toEqual([]);
  });

  it('detects the missing title without breaking', () => {
    const result = findings(`it(nombreDinamico, () => {});`, [noAssertion]);
    expect(result[0]?.message).toContain('(untitled)');
  });
});

describe('missingAwait', () => {
  // The defect: the promise settles after the test has already finished,
  // and the failure is lost or blamed on a different case.
  it.each([
    `expect(login('malo')).rejects.toThrow();`,
    `expect(cargar()).resolves.toBe(1);`,
    `expect(f()).rejects.toThrowError('x');`,
    `expect(f()).resolves.toEqual({ a: 1 });`,
  ])('detects %s without await', (assertion) => {
    const result = findings(`it('a', async () => { ${assertion} });`, [missingAwait]);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('missing-await');
    expect(result[0]?.severity).toBe('P1');
  });

  it('accepts the version with await', () => {
    expect(
      findings(`it('a', async () => { await expect(f()).rejects.toThrow(); });`, [
        missingAwait,
      ]),
    ).toEqual([]);
  });

  it('accepts the version with return', () => {
    expect(
      findings(`it('a', () => { return expect(f()).rejects.toThrow(); });`, [missingAwait]),
    ).toEqual([]);
  });

  it('accepts a synchronous assertion with no await', () => {
    expect(
      findings(`it('a', () => { expect(sumar(1, 1)).toBe(2); });`, [missingAwait]),
    ).toEqual([]);
  });

  it('does not flag a promise assigned to a variable', () => {
    // Here the promise is stored, presumably to be awaited later.
    expect(
      findings(`it('a', async () => { const p = expect(f()).rejects.toThrow(); await p; });`, [
        missingAwait,
      ]),
    ).toEqual([]);
  });

  it('names the modifier in the message', () => {
    const result = findings(`it('a', async () => { expect(f()).rejects.toThrow(); });`, [
      missingAwait,
    ]);
    expect(result[0]?.message).toContain('rejects');
  });

  it('detects several in the same test', () => {
    const result = findings(
      `it('a', async () => {
         expect(f()).rejects.toThrow();
         expect(g()).resolves.toBe(1);
       });`,
      [missingAwait],
    );
    expect(result).toHaveLength(2);
  });

  it('does not flag an expect with no async modifier', () => {
    expect(
      findings(`it('a', () => { expect(obj).toHaveProperty('rejects'); });`, [missingAwait]),
    ).toEqual([]);
  });
});

describe('missingAwait in Playwright', () => {
  const IMPORT = `import { expect, test } from '@playwright/test';\n`;

  it.each([
    `expect(page.locator('#boton')).toBeVisible();`,
    `expect(page.getByRole('button')).toBeEnabled();`,
    `expect(page.getByTestId('total')).toHaveText('$0.00');`,
    `expect(page.locator('.fila')).toHaveCount(3);`,
    `expect(page).toHaveURL('/inicio');`,
  ])('detects %s without await', (assertion) => {
    const result = findings(
      `${IMPORT}test('a', async ({ page }) => { ${assertion} });`,
      [missingAwait],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('missing-await');
  });

  it('accepts the version with await', () => {
    expect(
      findings(
        `${IMPORT}test('a', async ({ page }) => { await expect(page.locator('#x')).toBeVisible(); });`,
        [missingAwait],
      ),
    ).toEqual([]);
  });

  it('accepts a negated assertion with await', () => {
    expect(
      findings(
        `${IMPORT}test('a', async ({ page }) => { await expect(page.locator('#x')).not.toBeVisible(); });`,
        [missingAwait],
      ),
    ).toEqual([]);
  });

  // Without the Playwright import, toBeVisible is the synchronous matcher
  // from jest-dom or React Native Testing Library: requiring await would be
  // a false positive.
  it('does not flag toBeVisible in a file that does not use Playwright', () => {
    expect(
      findings(`it('a', () => { expect(getByTestId('x')).toBeVisible(); });`, [
        missingAwait,
      ]),
    ).toEqual([]);
  });

  it('still detects .rejects in a Playwright file', () => {
    expect(
      findings(`${IMPORT}test('a', async () => { expect(f()).rejects.toThrow(); });`, [
        missingAwait,
      ]),
    ).toHaveLength(1);
  });

  it('recognizes the Playwright import with a subpath', () => {
    expect(
      findings(
        `import { expect } from '@playwright/test/index';\ntest('a', async ({ page }) => { expect(page.locator('#x')).toBeVisible(); });`,
        [missingAwait],
      ),
    ).toHaveLength(1);
  });

  it('detects expect.soft locator assertions without await in Playwright', () => {
    const result = findings(
      `${IMPORT}test('a', async ({ page }) => { expect.soft(page.locator('#alert')).toBeVisible(); });`,
      [missingAwait],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('missing-await');
    expect(result[0]?.message).toContain('toBeVisible');
  });

  it('accepts expect.soft locator assertions with await in Playwright', () => {
    expect(
      findings(
        `${IMPORT}test('a', async ({ page }) => { await expect.soft(page.locator('#alert')).toBeVisible(); });`,
        [missingAwait],
      ),
    ).toEqual([]);
  });

  it('detects expect(...).toPass() retry blocks without await', () => {
    const result = findings(
      `${IMPORT}test('a', async () => {
         expect(async () => {
           expect(await fetchStatus()).toBe(200);
         }).toPass({ timeout: 5000 });
       });`,
      [missingAwait],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('toPass');
  });

  it('detects expect(...).not.toPass() without await even via custom fixture imports', () => {
    const result = findings(
      `import { test, expect } from './fixtures';
       test('a', async () => {
         expect(async () => {
           expect(await ping()).toBe('pong');
         }).not.toPass();
       });`,
      [missingAwait],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('toPass');
  });

  it('accepts expect(...).toPass() when awaited', () => {
    expect(
      findings(
        `${IMPORT}test('a', async () => {
           await expect(async () => {
             expect(await fetchStatus()).toBe(200);
           }).toPass();
         });`,
        [missingAwait],
      ),
    ).toEqual([]);
  });
});

describe('missingAwait with expect.poll', () => {
  it.each([
    `expect.poll(() => getStatus()).toBe('ready');`,
    `expect.poll(async () => fetchCount(), { timeout: 3000 }).toBeGreaterThan(0);`,
    `expect.poll(() => items.length).not.toBe(0);`,
  ])('detects %s without await in Vitest or Playwright', (assertion) => {
    const result = findings(`it('polls state', async () => { ${assertion} });`, [missingAwait]);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('missing-await');
    expect(result[0]?.severity).toBe('P1');
    expect(result[0]?.message).toContain('expect.poll(...)');
  });

  it('accepts awaited or returned expect.poll assertions', () => {
    expect(
      findings(
        `it('polls state', async () => {
           await expect.poll(() => getStatus()).toBe('ready');
         });
         it('returns poll promise', () => {
           return expect.poll(() => getStatus()).toBe('ready');
         });`,
        [missingAwait],
      ),
    ).toEqual([]);
  });

  it('does not flag synchronous expect.soft assertions in Vitest', () => {
    expect(
      findings(
        `it('soft sync', () => {
           expect.soft(sum(1, 2)).toBe(3);
         });`,
        [missingAwait],
      ),
    ).toEqual([]);
  });
});

describe('noAssertion with other assertion forms', () => {
  // Cypress asserts with .should(), not expect. Without recognizing that,
  // every Cypress test would be reported as defective.
  it('accepts a Cypress test with should', () => {
    expect(
      findings(`it('a', () => { cy.get('#total').should('have.text', '$0.00'); });`, [
        noAssertion,
      ]),
    ).toEqual([]);
  });

  it('accepts the chained and', () => {
    expect(
      findings(`it('a', () => { cy.get('#x').should('exist').and('be.visible'); });`, [
        noAssertion,
      ]),
    ).toEqual([]);
  });

  it('accepts Chai assert', () => {
    expect(
      findings(`it('a', () => { assert.equal(sumar(1, 1), 2); });`, [noAssertion]),
    ).toEqual([]);
  });

  // A Cypress test that only performs actions still verifies nothing.
  it('detects a Cypress test with no assertion at all', () => {
    expect(
      findings(`it('a', () => { cy.visit('/'); cy.get('#boton').click(); });`, [
        noAssertion,
      ]),
    ).toHaveLength(1);
  });
});

describe('assertionInCatch', () => {
  it('detects an assertion inside catch without guard in try block', () => {
    const result = findings(
      `it('fails on invalid input', async () => {
         try {
           await doSomething();
         } catch (err) {
           expect(err).toBeDefined();
         }
       });`,
      [assertionInCatch],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('assertion-in-catch');
    expect(result[0]?.severity).toBe('P1');
    expect(result[0]?.hint).toContain('await expect(promise).rejects.toThrow()');
  });

  it('accepts try block protected with expect.unreachable()', () => {
    expect(
      findings(
        `it('fails on invalid input', async () => {
           try {
             await doSomething();
             expect.unreachable();
           } catch (err) {
             expect(err).toBeDefined();
           }
         });`,
        [assertionInCatch],
      ),
    ).toEqual([]);
  });

  it('accepts try block protected with fail() or expect.fail()', () => {
    expect(
      findings(
        `it('fails on invalid input', async () => {
           try {
             await doSomething();
             fail('should have thrown');
           } catch (err) {
             expect(err).toBeDefined();
           }
         });`,
        [assertionInCatch],
      ),
    ).toEqual([]);

    expect(
      findings(
        `it('fails on invalid input', async () => {
           try {
             await doSomething();
             expect.fail();
           } catch (err) {
             expect(err).toBeDefined();
           }
         });`,
        [assertionInCatch],
      ),
    ).toEqual([]);
  });

  it('accepts try block protected with throw', () => {
    expect(
      findings(
        `it('fails on invalid input', async () => {
           try {
             await doSomething();
             throw new Error('should fail');
           } catch (err) {
             expect(err).toBeDefined();
           }
         });`,
        [assertionInCatch],
      ),
    ).toEqual([]);
  });

  it('accepts tests declaring expect.assertions(...) or expect.hasAssertions()', () => {
    expect(
      findings(
        `it('fails on invalid input', async () => {
           expect.assertions(1);
           try {
             await doSomething();
           } catch (err) {
             expect(err).toBeDefined();
           }
         });`,
        [assertionInCatch],
      ),
    ).toEqual([]);

    expect(
      findings(
        `it('fails on invalid input', async () => {
           expect.hasAssertions();
           try {
             await doSomething();
           } catch (err) {
             expect(err).toBeDefined();
           }
         });`,
        [assertionInCatch],
      ),
    ).toEqual([]);
  });

  it('accepts try/catch when catch has no assertions', () => {
    expect(
      findings(
        `it('handles cleanup', async () => {
           try {
             await cleanup();
           } catch (err) {
             console.error(err);
           }
           expect(1).toBe(1);
         });`,
        [assertionInCatch],
      ),
    ).toEqual([]);
  });

  it('detects Chai assert inside catch', () => {
    const result = findings(
      `it('fails on invalid input', async () => {
         try {
           await doSomething();
         } catch (err) {
           assert.isNotNull(err);
         }
       });`,
      [assertionInCatch],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('assertion-in-catch');
  });
});

describe('identicalExpression', () => {
  describe('positive cases & copy-paste error hints', () => {
    it('detects identical property access in toBe: expect(user.id).toBe(user.id)', () => {
      const result = findings(
        `it('checks user id', () => {
           expect(user.id).toBe(user.id);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('identical-expression');
      expect(result[0]?.severity).toBe('P1');
      expect(result[0]?.message).toContain('expect(user.id).toBe(user.id)');
      expect(result[0]?.message).toContain('copy-paste error');
      expect(result[0]?.hint).toContain('expect(user.id).toBe(expectedId)');
      expect(result[0]?.hint).toContain('expect(user.id).toBe(expectedUser.id)');
    });

    it('detects identical variable assertion with autofix suggestion: expect(data).toEqual(data)', () => {
      const result = findings(
        `it('checks data', () => {
           expect(data).toEqual(data);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('identical-expression');
      expect(result[0]?.severity).toBe('P1');
      expect(result[0]?.message).toContain('expect(data).toEqual(data)');
      expect(result[0]?.message).toContain('copy-paste error');
      expect(result[0]?.hint).toContain('expect(data).toEqual(expectedData)');
    });

    it('detects identical property on data: expect(data.status).toEqual(data.status)', () => {
      const result = findings(
        `it('checks status', () => {
           expect(data.status).toEqual(data.status);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(data.status).toEqual(expectedStatus)');
    });

    it('detects identical nested property access in toEqual', () => {
      const result = findings(
        `it('checks data items', () => {
           expect(response.data.items).toEqual(response.data.items);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('identical-expression');
      expect(result[0]?.hint).toContain('expectedItems');
    });

    it('detects identical function call in assertion', () => {
      const result = findings(
        `it('checks calculation', () => {
           expect(calculateTotal()).toStrictEqual(calculateTotal());
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('identical-expression');
      expect(result[0]?.hint).toContain('expect(calculateTotal()).toStrictEqual(expectedTotal)');
      expect(result[0]?.hint).toContain("instead of invoking 'calculateTotal()' on both sides");
    });

    it('detects getter function calls: expect(getUser(123)).toEqual(getUser(123))', () => {
      const result = findings(
        `it('checks user fetch', () => {
           expect(getUser(123)).toEqual(getUser(123));
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(getUser(123)).toEqual(expectedUser)');
    });

    it('detects identical variable assertion with actual identifier', () => {
      const result = findings(
        `it('checks variable', () => {
           expect(actual).toBe(actual);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('identical-expression');
      expect(result[0]?.hint).toContain('expect(actual).toBe(expected)');
    });

    it('detects identifier with actual prefix and suggests expected prefix', () => {
      const result = findings(
        `it('checks user', () => {
           expect(actualUser).toEqual(actualUser);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actualUser).toEqual(expectedUser)');
    });

    it('detects property access on object with actual prefix', () => {
      const result = findings(
        `it('checks name', () => {
           expect(actualUser.name).toBe(actualUser.name);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actualUser.name).toBe(expectedUser.name)');
    });

    it('detects identical array element indexing: expect(items[0]).toBe(items[0])', () => {
      const result = findings(
        `it('checks item', () => {
           expect(items[0]).toBe(items[0]);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('identical-expression');
      expect(result[0]?.hint).toContain('expect(items[0]).toBe(expectedItem)');
    });

    it('detects element access on array with actual prefix', () => {
      const result = findings(
        `it('checks element', () => {
           expect(actualRows[0]).toEqual(actualRows[0]);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actualRows[0]).toEqual(expectedRows[0])');
    });

    it('detects identical binary expression: expect(a + b).toBe(a + b)', () => {
      const result = findings(
        `it('checks sum', () => {
           expect(a + b).toBe(a + b);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(a + b).toBe(expectedResult)');
      expect(result[0]?.hint).toContain('instead of evaluating');
    });

    it('handles parenthesized expressions: expect((user.id)).toBe(user.id)', () => {
      const result = findings(
        `it('checks paren left', () => {
           expect((user.id)).toBe(user.id);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('identical-expression');
    });

    it('handles parenthesized expected expression: expect(user.id).toBe((user.id))', () => {
      const result = findings(
        `it('checks paren right', () => {
           expect(user.id).toBe((user.id));
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('identical-expression');
    });

    it('handles multiline formatted identical expressions', () => {
      const result = findings(
        `it('checks multiline', () => {
           expect(user.id).toBe(
             user.id
           );
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('identical-expression');
    });

    it('detects async assertion with .resolves: await expect(fetchData()).resolves.toEqual(fetchData())', () => {
      const result = findings(
        `it('checks async resolves', async () => {
           await expect(fetchData()).resolves.toEqual(fetchData());
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.message).toContain('expect(fetchData()).resolves.toEqual(fetchData())');
      expect(result[0]?.hint).toContain('expect(fetchData()).resolves.toEqual(expectedData)');
    });

    it('detects async assertion with .rejects: await expect(loadUser()).rejects.toBe(loadUser())', () => {
      const result = findings(
        `it('checks async rejects', async () => {
           await expect(loadUser()).rejects.toBe(loadUser());
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.message).toContain('expect(loadUser()).rejects.toBe(loadUser())');
    });

    it('detects Chai assert.equal with copy-paste error explanation and hint', () => {
      const result = findings(
        `it('checks chai equal', () => {
           assert.equal(user.id, user.id);
         });`,
        [identicalExpression],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.message).toContain('assert.equal(user.id, user.id) compares an expression against itself: likely a copy-paste error.');
      expect(result[0]?.hint).toContain('assert.equal(user.id, expectedId)');
    });

    it('detects Chai assert.deepEqual and assert.strictEqual', () => {
      const r1 = findings(
        `it('checks chai deepEqual', () => {
           assert.deepEqual(response.body, response.body);
         });`,
        [identicalExpression],
      );
      expect(r1).toHaveLength(1);
      expect(r1[0]?.message).toContain('assert.deepEqual(response.body, response.body)');

      const r2 = findings(
        `it('checks chai strictEqual', () => {
           assert.strictEqual(data, data);
         });`,
        [identicalExpression],
      );
      expect(r2).toHaveLength(1);
      expect(r2[0]?.hint).toContain('assert.strictEqual(data, expectedData)');
    });
  });

  describe('false positives (valid assertions that should not be flagged)', () => {
    it('ignores comparisons between different variables', () => {
      expect(
        findings(
          `it('checks result', () => {
             expect(actual).toBe(expected);
             expect(result).toEqual(expectedResult);
           });`,
          [identicalExpression],
        ),
      ).toEqual([]);
    });

    it('ignores comparisons between different properties of the same object', () => {
      expect(
        findings(
          `it('checks parent', () => {
             expect(user.id).toBe(user.parentId);
             expect(data.created).not.toBe(data.updated);
           });`,
          [identicalExpression],
        ),
      ).toEqual([]);
    });

    it('ignores comparisons between the same property on different objects', () => {
      expect(
        findings(
          `it('checks users', () => {
             expect(user1.id).toBe(user2.id);
             expect(actualUser.name).toEqual(expectedUser.name);
           });`,
          [identicalExpression],
        ),
      ).toEqual([]);
    });

    it('ignores comparisons between different array indices', () => {
      expect(
        findings(
          `it('checks array indices', () => {
             expect(items[0]).toBe(items[1]);
             expect(matrix[0][1]).toBe(matrix[1][0]);
           });`,
          [identicalExpression],
        ),
      ).toEqual([]);
    });

    it('ignores comparisons between different function arguments or different functions', () => {
      expect(
        findings(
          `it('checks function calls', () => {
             expect(getUser(1)).toEqual(getUser(2));
             expect(calculateTotal(cartA)).toBe(calculateTotal(cartB));
             expect(getActual()).toBe(getExpected());
           });`,
          [identicalExpression],
        ),
      ).toEqual([]);
    });

    it('ignores comparisons between expressions and literals', () => {
      expect(
        findings(
          `it('checks literals', () => {
             expect(user.id).toBe(42);
             expect(data.status).toBe('success');
             expect(items.length).toBe(3);
             expect(isValid).toBe(true);
           });`,
          [identicalExpression],
        ),
      ).toEqual([]);
    });

    it('ignores literals (handled by tautology rule)', () => {
      expect(
        findings(
          `it('checks literals', () => {
             expect(1).toBe(1);
             expect('abc').toEqual('abc');
             expect(true).toBe(true);
             expect(null).toBe(null);
           });`,
          [identicalExpression],
        ),
      ).toEqual([]);
    });

    it('ignores negated comparisons of different values', () => {
      expect(
        findings(
          `it('checks negated', () => {
             expect(user.id).not.toBe(expectedId);
           });`,
          [identicalExpression],
        ),
      ).toEqual([]);
    });

    it('ignores valid Chai assertions', () => {
      expect(
        findings(
          `it('checks chai valid', () => {
             assert.equal(user.id, expectedId);
             assert.strictEqual(actual, expected);
             assert.deepEqual(user, { name: 'Alice' });
           });`,
          [identicalExpression],
        ),
      ).toEqual([]);
    });
  });
});

describe('redundantBooleanAssertion', () => {
  describe('positive cases', () => {
    it('detects expect(a === b).toBe(true) and suggests expect(a).toBe(b)', () => {
      const result = findings(
        `it('checks equality', () => {
           expect(actual === expected).toBe(true);
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('redundant-boolean-assertion');
      expect(result[0]?.severity).toBe('P2');
      expect(result[0]?.message).toBe('Redundant boolean assertion: expect(actual === expected).toBe(true).');
      expect(result[0]?.hint).toContain('expect(actual).toBe(expected)');
    });

    it('detects expect(a !== b).toBe(true) and suggests expect(a).not.toBe(b)', () => {
      const result = findings(
        `it('checks inequality', () => {
           expect(actual !== expected).toBe(true);
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('redundant-boolean-assertion');
      expect(result[0]?.severity).toBe('P2');
      expect(result[0]?.hint).toContain('expect(actual).not.toBe(expected)');
    });

    it('detects expect(a === b).toBe(false) and suggests expect(a).not.toBe(b)', () => {
      const result = findings(
        `it('checks equality to false', () => {
           expect(actual === expected).toBe(false);
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actual).not.toBe(expected)');
    });

    it('detects expect(a !== b).toBe(false) and suggests expect(a).toBe(b)', () => {
      const result = findings(
        `it('checks inequality to false', () => {
           expect(actual !== expected).toBe(false);
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actual).toBe(expected)');
    });

    it('detects expect(a == b).toBe(true) and suggests expect(a).toEqual(b)', () => {
      const result = findings(
        `it('checks loose equality', () => {
           expect(actual == expected).toBe(true);
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actual).toEqual(expected)');
    });

    it('detects expect(a != b).toBe(true) and suggests expect(a).not.toEqual(b)', () => {
      const result = findings(
        `it('checks loose inequality', () => {
           expect(actual != expected).toBe(true);
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actual).not.toEqual(expected)');
    });

    it('detects expect(condicion).toBeTruthy() with binary equality', () => {
      const result = findings(
        `it('checks truthy comparison', () => {
           expect(status === 200).toBeTruthy();
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(status).toBe(200)');
    });

    it('detects expect(condicion).toBeTruthy() with inequality', () => {
      const result = findings(
        `it('checks truthy inequality', () => {
           expect(user.role !== 'guest').toBeTruthy();
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain("expect(user.role).not.toBe('guest')");
    });

    it('detects expect(a === b).toBeFalsy() and suggests expect(a).not.toBe(b)', () => {
      const result = findings(
        `it('checks falsy equality', () => {
           expect(actual === expected).toBeFalsy();
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actual).not.toBe(expected)');
    });

    it('detects expect(a !== b).toBeFalsy() and suggests expect(a).toBe(b)', () => {
      const result = findings(
        `it('checks falsy inequality', () => {
           expect(actual !== expected).toBeFalsy();
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actual).toBe(expected)');
    });

    it('detects expect(a === b).toEqual(true)', () => {
      const result = findings(
        `it('checks toEqual(true)', () => {
           expect(actual === expected).toEqual(true);
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actual).toBe(expected)');
    });

    it('detects expect(a === b).toStrictEqual(true)', () => {
      const result = findings(
        `it('checks toStrictEqual(true)', () => {
           expect(actual === expected).toStrictEqual(true);
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actual).toBe(expected)');
    });

    it('detects expect(a === b).not.toBe(true) and suggests expect(a).not.toBe(b)', () => {
      const result = findings(
        `it('checks not.toBe(true)', () => {
           expect(actual === expected).not.toBe(true);
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actual).not.toBe(expected)');
    });

    it('detects expect(a === b).not.toBeTruthy() and suggests expect(a).not.toBe(b)', () => {
      const result = findings(
        `it('checks not.toBeTruthy()', () => {
           expect(actual === expected).not.toBeTruthy();
         });`,
        [redundantBooleanAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(actual).not.toBe(expected)');
    });

    it('detects relational comparisons: >, >=, <, <=', () => {
      const r1 = findings(`it('gt', () => { expect(count > 0).toBe(true); });`, [redundantBooleanAssertion]);
      expect(r1[0]?.hint).toContain('expect(count).toBeGreaterThan(0)');

      const r2 = findings(`it('gte', () => { expect(count >= 10).toBe(true); });`, [redundantBooleanAssertion]);
      expect(r2[0]?.hint).toContain('expect(count).toBeGreaterThanOrEqual(10)');

      const r3 = findings(`it('lt', () => { expect(count < 5).toBe(true); });`, [redundantBooleanAssertion]);
      expect(r3[0]?.hint).toContain('expect(count).toBeLessThan(5)');

      const r4 = findings(`it('lte', () => { expect(count <= 100).toBe(true); });`, [redundantBooleanAssertion]);
      expect(r4[0]?.hint).toContain('expect(count).toBeLessThanOrEqual(100)');

      const r5 = findings(`it('gt truthy', () => { expect(total > 0).toBeTruthy(); });`, [redundantBooleanAssertion]);
      expect(r5[0]?.hint).toContain('expect(total).toBeGreaterThan(0)');
    });

    it('detects array/string .includes() calls', () => {
      const r1 = findings(
        `it('includes', () => { expect(items.includes('admin')).toBe(true); });`,
        [redundantBooleanAssertion],
      );
      expect(r1[0]?.hint).toContain("expect(items).toContain('admin')");

      const r2 = findings(
        `it('includes false', () => { expect(items.includes('guest')).toBe(false); });`,
        [redundantBooleanAssertion],
      );
      expect(r2[0]?.hint).toContain("expect(items).not.toContain('guest')");
    });

    it('detects logical negation !cond', () => {
      const r1 = findings(
        `it('negated', () => { expect(!user.isActive).toBe(true); });`,
        [redundantBooleanAssertion],
      );
      expect(r1[0]?.hint).toContain('expect(user.isActive).toBe(false)');

      const r2 = findings(
        `it('negated truthy', () => { expect(!hasPermission).toBeTruthy(); });`,
        [redundantBooleanAssertion],
      );
      expect(r2[0]?.hint).toContain('expect(hasPermission).toBe(false)');
    });

    it('detects Playwright locator boolean checks', () => {
      const r1 = findings(
        `it('locator isVisible', async () => {
           expect(await page.locator('.btn').isVisible()).toBe(true);
         });`,
        [redundantBooleanAssertion],
      );
      expect(r1[0]?.hint).toContain("await expect(page.locator('.btn')).toBeVisible()");

      const r2 = findings(
        `it('locator isEnabled', async () => {
           expect(await submitButton.isEnabled()).toBe(true);
         });`,
        [redundantBooleanAssertion],
      );
      expect(r2[0]?.hint).toContain('await expect(submitButton).toBeEnabled()');
    });

    it('detects instanceof and in operators', () => {
      const r1 = findings(
        `it('instanceof', () => { expect(err instanceof CustomError).toBe(true); });`,
        [redundantBooleanAssertion],
      );
      expect(r1[0]?.hint).toContain('expect(err).toBeInstanceOf(CustomError)');

      const r2 = findings(
        `it('in', () => { expect('id' in user).toBe(true); });`,
        [redundantBooleanAssertion],
      );
      expect(r2[0]?.hint).toContain("expect(user).toHaveProperty('id')");
    });

    it('detects logical operators && and || with appropriate advice', () => {
      const r1 = findings(
        `it('and', () => { expect(isLoaded && isValid).toBe(true); });`,
        [redundantBooleanAssertion],
      );
      expect(r1[0]?.hint).toContain('Split into separate assertions');

      const r2 = findings(
        `it('or', () => { expect(isAdmin || isOwner).toBe(true); });`,
        [redundantBooleanAssertion],
      );
      expect(r2[0]?.hint).toContain('Avoid logical OR in assertions');
    });

    it('handles parenthesized comparisons correctly', () => {
      const result = findings(
        `it('parenthesized', () => { expect((a === b)).toBe(true); });`,
        [redundantBooleanAssertion],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.hint).toContain('expect(a).toBe(b)');
    });

    it('simplifies comparison against boolean literals', () => {
      const r1 = findings(
        `it('flag true', () => { expect(flag === true).toBe(true); });`,
        [redundantBooleanAssertion],
      );
      expect(r1[0]?.hint).toContain('expect(flag).toBe(true)');

      const r2 = findings(
        `it('flag false', () => { expect(flag === false).toBe(true); });`,
        [redundantBooleanAssertion],
      );
      expect(r2[0]?.hint).toContain('expect(flag).toBe(false)');
    });
  });

  describe('false positives (valid assertions that should not be flagged)', () => {
    it('accepts semantic direct assertions', () => {
      expect(
        findings(
          `it('valid', () => {
             expect(actual).toBe(expected);
             expect(actual).not.toBe(expected);
             expect(items).toEqual(['a', 'b']);
           });`,
          [redundantBooleanAssertion],
        ),
      ).toEqual([]);
    });

    it('accepts checking a boolean variable or property directly with .toBe(true)', () => {
      expect(
        findings(
          `it('valid boolean', () => {
             expect(isValid).toBe(true);
             expect(user.isActive).toBe(true);
             expect(status.hasFinished).toBe(false);
           });`,
          [redundantBooleanAssertion],
        ),
      ).toEqual([]);
    });

    it('accepts checking an object or value directly with .toBeTruthy() or .toBeFalsy()', () => {
      expect(
        findings(
          `it('valid truthy/falsy', () => {
             expect(user).toBeTruthy();
             expect(response.data).toBeTruthy();
             expect(error).toBeFalsy();
             expect(nullValue).toBeFalsy();
           });`,
          [redundantBooleanAssertion],
        ),
      ).toEqual([]);
    });

    it('accepts custom boolean returning functions with .toBe(true)', () => {
      expect(
        findings(
          `it('valid function call', () => {
             expect(isTestFile(file)).toBe(true);
             expect(checkAccess(token)).toBe(false);
           });`,
          [redundantBooleanAssertion],
        ),
      ).toEqual([]);
    });

    it('ignores expect without matcher (handled by expectWithoutMatcher)', () => {
      expect(
        findings(
          `it('no matcher', () => {
             expect(a === b);
           });`,
          [redundantBooleanAssertion],
        ),
      ).toEqual([]);
    });

    it('ignores tautology literals (handled by tautology rule)', () => {
      expect(
        findings(
          `it('tautology', () => {
             expect(true).toBe(true);
             expect(false).toBe(false);
           });`,
          [redundantBooleanAssertion],
        ),
      ).toEqual([]);
    });

    it('ignores numerical or non-boolean assertions', () => {
      expect(
        findings(
          `it('number compare', () => {
             expect(items.length).toBe(3);
             expect(calculateTotal()).toBe(42);
             expect(compare(a, b)).toBe(0);
           });`,
          [redundantBooleanAssertion],
        ),
      ).toEqual([]);
    });
  });
});

describe('floatingTimerAssertion', () => {
  describe('positive cases', () => {
    it.each([
      ['setTimeout', `setTimeout(() => { expect(getCount()).toBe(1); }, 100);`],
      ['setInterval', `setInterval(() => { expect(isReady()).toBe(true); }, 50);`],
      ['setImmediate', `setImmediate(() => { expect(result).toBe('ok'); });`],
      ['requestAnimationFrame', `requestAnimationFrame(() => { expect(frame).toBe(2); });`],
      ['window.setTimeout', `window.setTimeout(() => { expect(state).toBe('open'); }, 10);`],
      ['globalThis.setTimeout', `globalThis.setTimeout(function () { expect(doneFlag).toBe(true); }, 25);`],
      ['process.nextTick', `process.nextTick(() => { expect(flushed).toBe(true); });`],
    ])('detects unawaited assertion inside %s callback', (label, timerCode) => {
      const result = findings(
        `it('checks delayed effect', () => {
           triggerAction();
           ${timerCode}
         });`,
        [floatingTimerAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('floating-timer-assertion');
      expect(result[0]?.severity).toBe('P1');
      expect(result[0]?.message).toContain(`${label}()`);
      expect(result[0]?.hint).toContain('advanceTimersByTime');
    });

    it('detects Chai and Cypress assertions trapped in floating timers', () => {
      const result = findings(
        `it('checks delayed chai & cypress', () => {
           setTimeout(() => {
             assert.equal(getStatus(), 'ready');
           }, 50);
           setTimeout(() => {
             cy.get('#banner').should('be.visible');
           }, 50);
         });`,
        [floatingTimerAssertion],
      );

      expect(result).toHaveLength(2);
    });

    it('still flags floating timers in async Playwright tests with destructured fixtures', () => {
      const result = findings(
        `test('playwright floating timer', async ({ page }) => {
           await page.goto('/');
           setTimeout(() => {
             expect(page.url()).toContain('/dashboard');
           }, 200);
         });`,
        [floatingTimerAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('floating-timer-assertion');
    });

    it('reports only the innermost timer when timers are nested', () => {
      const result = findings(
        `it('nested timers', () => {
           setTimeout(() => {
             setTimeout(() => {
               expect(value).toBe(42);
             }, 20);
           }, 50);
         });`,
        [floatingTimerAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.line).toBe(3);
    });
  });

  describe('safe patterns (no false positives)', () => {
    it('accepts synchronous tests declaring a done completion callback', () => {
      expect(
        findings(
          `it('completes via done callback', (done) => {
             triggerAction();
             setTimeout(() => {
               expect(getCount()).toBe(1);
               done();
             }, 20);
           });`,
          [floatingTimerAssertion],
        ),
      ).toEqual([]);
    });

    it('accepts timers wrapped inside a new Promise executor', () => {
      expect(
        findings(
          `it('awaits promise-wrapped timer', async () => {
             await new Promise<void>((resolve) => {
               setTimeout(() => {
                 expect(getCount()).toBe(1);
                 resolve();
               }, 20);
             });
           });`,
          [floatingTimerAssertion],
        ),
      ).toEqual([]);
    });

    it.each([
      `jest.advanceTimersByTime(100);`,
      `jest.runAllTimers();`,
      `jest.runOnlyPendingTimers();`,
      `vi.advanceTimersByTime(100);`,
      `await vi.advanceTimersByTimeAsync(100);`,
      `vi.runAllTimers();`,
      `clock.tick(100);`,
      `cy.tick(100);`,
    ])('accepts fake timer progression via %s', (runnerCall) => {
      expect(
        findings(
          `it('advances fake timers', async () => {
             setTimeout(() => {
               expect(getCount()).toBe(1);
             }, 100);
             ${runnerCall}
           });`,
          [floatingTimerAssertion],
        ),
      ).toEqual([]);
    });

    it('ignores timer callbacks that perform setup without assertions', () => {
      expect(
        findings(
          `it('uses timer only to emit event', async () => {
             setTimeout(() => {
               emitter.emit('ready', 42);
             }, 10);
             await expect(waitForEvent(emitter, 'ready')).resolves.toBe(42);
           });`,
          [floatingTimerAssertion],
        ),
      ).toEqual([]);
    });
  });
});

describe('vacuousAssertion', () => {
  describe('positive cases', () => {
    it.each([
      `expect({}).toBeTruthy()`,
      `expect({ ok: false }).toBeDefined()`,
      `expect([]).toBeTruthy()`,
      `expect([1, 2]).not.toBeNull()`,
      `expect(() => validateOrder()).toBeTruthy()`,
      `expect(function () { return null; }).not.toBeUndefined()`,
      `expect(typeof response.body).toBeTruthy()`,
      `expect(typeof missingVar).not.toBeUndefined()`,
      `expect(\`order-\${orderId}\`).toBeTruthy()`,
      `expect(\`\${maybeEmpty}\`).toBeDefined()`,
      `expect('ready').toBeTruthy()`,
      `expect(42).not.toBeFalsy()`,
      `expect(/^[a-z]+$/).toBeTruthy()`,
      `expect(false).toBeDefined()`,
      `expect(0).not.toBeNull()`,
      `expect('').not.toBeUndefined()`,
      `expect(({ nested: true })).toBeTruthy()`,
    ])('detects vacuous Jest/Vitest assertion: %s', (assertionExpr) => {
      const result = findings(
        `it('always passes by construction', () => {
           ${assertionExpr};
         });`,
        [vacuousAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('vacuous-assertion');
      expect(result[0]?.severity).toBe('P1');
      expect(result[0]?.message).toContain(assertionExpr);
      expect(result[0]?.hint).toContain('guaranteed-truthy');
    });

    it.each([
      `assert.isOk({})`,
      `assert.isDefined([])`,
      `assert.isNotNull(() => compute())`,
      `assert.exists('constant')`,
    ])('detects vacuous Chai assertion: %s', (chaiExpr) => {
      const result = findings(
        `it('always passes in Chai', () => {
           ${chaiExpr};
         });`,
        [vacuousAssertion],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('vacuous-assertion');
      expect(result[0]?.severity).toBe('P1');
    });
  });

  describe('safe patterns (no false positives)', () => {
    it('accepts truthiness and existence checks on runtime variables and calls', () => {
      expect(
        findings(
          `it('checks runtime state', () => {
             expect(result).toBeTruthy();
             expect(createSession()).toBeDefined();
             expect(user.token).not.toBeNull();
             expect(items[0]).not.toBeUndefined();
             assert.isOk(response);
             assert.isDefined(config.apiKey);
           });`,
          [vacuousAssertion],
        ),
      ).toEqual([]);
    });

    it('accepts pure dynamic template literal checked for truthiness', () => {
      expect(
        findings(
          `it('can fail when dynamic variable is empty string', () => {
             expect(\`\${dynamicToken}\`).toBeTruthy();
           });`,
          [vacuousAssertion],
        ),
      ).toEqual([]);
    });

    it('does not flag falsy primitives checked for truthiness (they fail at runtime)', () => {
      expect(
        findings(
          `it('fails rather than passing vacuously', () => {
             expect(false).toBeTruthy();
             expect(0).toBeTruthy();
             expect('').toBeTruthy();
             expect(0).not.toBeFalsy();
           });`,
          [vacuousAssertion],
        ),
      ).toEqual([]);
    });

    it('accepts structural matchers and throw assertions on literals and callbacks', () => {
      expect(
        findings(
          `it('uses structural or exception matchers', () => {
             expect({}).toEqual({});
             expect([]).toHaveLength(0);
             expect(() => parsePayload('')).toThrow();
             expect(typeof value).toBe('string');
           });`,
          [vacuousAssertion],
        ),
      ).toEqual([]);
    });
  });
});

describe('duplicateTestTitle', () => {
  describe('positive cases', () => {
    it('detects duplicate it() titles within the same describe block', () => {
      const result = findings(
        `describe('cart', () => {
           it('calculates total', () => { expect(total(1, 2)).toBe(3); });
           it('applies discount', () => { expect(discount(10)).toBe(8); });
           it('calculates total', () => { expect(total(2, 3)).toBe(5); });
         });`,
        [duplicateTestTitle],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('duplicate-test-title');
      expect(result[0]?.severity).toBe('P2');
      expect(result[0]?.line).toBe(4);
      expect(result[0]?.message).toContain('"calculates total"');
      expect(result[0]?.message).toContain('first defined on line 2');
    });

    it('detects collision between it() and test() sharing a title in top-level scope', () => {
      const result = findings(
        `it('authenticates user', () => { expect(login()).toBe(true); });
         test('authenticates user', () => { expect(relogin()).toBe(true); });`,
        [duplicateTestTitle],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.line).toBe(2);
      expect(result[0]?.message).toContain('first defined on line 1');
    });

    it('detects duplicate describe() suite titles in the same parent scope', () => {
      const result = findings(
        `describe('payments', () => {
           it('charges card', () => { expect(charge()).toBe('ok'); });
         });
         describe('payments', () => {
           it('refunds card', () => { expect(refund()).toBe('ok'); });
         });`,
        [duplicateTestTitle],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('duplicate-test-title');
      expect(result[0]?.severity).toBe('P2');
      expect(result[0]?.line).toBe(4);
      expect(result[0]?.message).toContain('Duplicate suite title "payments"');
    });

    it('detects duplicate it.each template titles in the same suite', () => {
      const result = findings(
        `describe('validators', () => {
           it.each(['a', 'b'])('accepts %s', (v) => { expect(isValid(v)).toBe(true); });
           it.each(['c', 'd'])('accepts %s', (v) => { expect(isValid(v)).toBe(true); });
         });`,
        [duplicateTestTitle],
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.line).toBe(3);
    });
  });

  describe('safe patterns (no false positives)', () => {
    it('allows identical test titles in distinct sibling or nested describe blocks', () => {
      expect(
        findings(
          `describe('API', () => {
             describe('GET /orders', () => {
               it('returns 200', () => { expect(getStatus()).toBe(200); });
             });
             describe('POST /orders', () => {
               it('returns 200', () => { expect(postStatus()).toBe(200); });
             });
           });`,
          [duplicateTestTitle],
        ),
      ).toEqual([]);
    });

    it('does not collide suite title with a nested test of the same name', () => {
      expect(
        findings(
          `describe('parseArgs', () => {
             it('parseArgs', () => { expect(parseArgs([])).toBeDefined(); });
           });`,
          [duplicateTestTitle],
        ),
      ).toEqual([]);
    });

    it('ignores dynamic interpolated template titles and mutually exclusive if/else branches', () => {
      expect(
        findings(
          `describe('platform behavior', () => {
             for (const id of [1, 2]) {
               it(\`processes item \${id}\`, () => { expect(processItem(id)).toBe(true); });
             }
             if (process.platform === 'win32') {
               it('normalizes separators', () => { expect(norm('a\\\\b')).toBe('a/b'); });
             } else {
               it('normalizes separators', () => { expect(norm('a/b')).toBe('a/b'); });
             }
           });`,
          [duplicateTestTitle],
        ),
      ).toEqual([]);
    });
  });

  describe('mockWithoutAssertion', () => {
    it('detects jest.spyOn when no assertion verifies it', () => {
      const result = findings(
        `it('fetches data', () => {
           const fetchSpy = jest.spyOn(api, 'fetch');
           fetchData();
           expect(state.loaded).toBe(true);
         });`,
        [mockWithoutAssertion],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('mock-without-assertion');
      expect(result[0]?.severity).toBe('P2');
      expect(result[0]?.message).toContain('fetchSpy');
      expect(result[0]?.message).toContain('jest.spyOn');
    });

    it('detects vi.spyOn when unasserted', () => {
      const result = findings(
        `it('sends email', () => {
           const emailSpy = vi.spyOn(mailer, 'send');
           triggerNotification();
           expect(result.status).toBe('ok');
         });`,
        [mockWithoutAssertion],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('mock-without-assertion');
    });

    it('detects jest.fn named mock or spy without assertion', () => {
      const result = findings(
        `it('handles callback', () => {
           const callbackSpy = jest.fn();
           runAction(callbackSpy);
           expect(isDone()).toBe(true);
         });`,
        [mockWithoutAssertion],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('mock-without-assertion');
    });

    it('accepts spy verified via expect(spy).toHaveBeenCalled()', () => {
      expect(
        findings(
          `it('fetches data', () => {
             const fetchSpy = jest.spyOn(api, 'fetch');
             fetchData();
             expect(fetchSpy).toHaveBeenCalled();
           });`,
          [mockWithoutAssertion],
        ),
      ).toEqual([]);
    });

    it('accepts spy verified via expect(spy).toHaveBeenCalledWith(...)', () => {
      expect(
        findings(
          `it('dispatches event', () => {
             const dispatchSpy = jest.spyOn(bus, 'emit');
             bus.emit('event', 123);
             expect(dispatchSpy).toHaveBeenCalledWith('event', 123);
           });`,
          [mockWithoutAssertion],
        ),
      ).toEqual([]);
    });

    it('accepts mock verified via property access in expect', () => {
      expect(
        findings(
          `it('tracks count', () => {
             const counterMock = jest.fn();
             counterMock();
             expect(counterMock.mock.calls.length).toBe(1);
           });`,
          [mockWithoutAssertion],
        ),
      ).toEqual([]);
    });

    it('ignores dummy handler not named spy or mock', () => {
      expect(
        findings(
          `it('renders button with noop', () => {
             const onClick = jest.fn();
             renderButton({ onClick });
             expect(buttonIsVisible()).toBe(true);
           });`,
          [mockWithoutAssertion],
        ),
      ).toEqual([]);
    });
  });

  describe('uninvokedMatcher', () => {
    it('detects expect(x).toBeDefined referenced without parentheses', () => {
      const result = findings(
        `it('checks user exists', () => {
           const user = getUser();
           expect(user).toBeDefined;
         });`,
        [uninvokedMatcher],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('uninvoked-matcher');
      expect(result[0]?.severity).toBe('P1');
      expect(result[0]?.message).toContain('.toBeDefined');
      expect(result[0]?.hint).toContain('expect(...).toBeDefined()');
    });

    it('detects expect(x).toBeTruthy without call', () => {
      const result = findings(
        `it('validates active state', () => {
           expect(isActive).toBeTruthy;
         });`,
        [uninvokedMatcher],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('uninvoked-matcher');
      expect(result[0]?.message).toContain('.toBeTruthy');
    });

    it('detects expect(x).not.toBeNull without call', () => {
      const result = findings(
        `it('checks not null', () => {
           expect(result).not.toBeNull;
         });`,
        [uninvokedMatcher],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('uninvoked-matcher');
      expect(result[0]?.message).toContain('.toBeNull');
    });

    it('detects expect(p).resolves.toBeDefined without call', () => {
      const result = findings(
        `it('checks async resolution', async () => {
           await expect(fetchData()).resolves.toBeDefined;
         });`,
        [uninvokedMatcher],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('uninvoked-matcher');
      expect(result[0]?.message).toContain('.toBeDefined');
    });

    it('detects dangling modifier expect(x).not', () => {
      const result = findings(
        `it('has dangling not', () => {
           expect(value).not;
         });`,
        [uninvokedMatcher],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('uninvoked-matcher');
      expect(result[0]?.message).toContain('.not');
    });

    it('allows properly invoked matchers', () => {
      expect(
        findings(
          `it('properly asserts', () => {
             expect(user).toBeDefined();
             expect(flag).toBeTruthy();
             expect(result).not.toBeNull();
           });`,
          [uninvokedMatcher],
        ),
      ).toEqual([]);
    });

    it('ignores unrelated property access', () => {
      expect(
        findings(
          `it('reads object property', () => {
             const val = state.toBeDefined;
             expect(val).toBe(true);
           });`,
          [uninvokedMatcher],
        ),
      ).toEqual([]);
    });

    it('does not confuse Chai assertions with uninvoked Jest matchers', () => {
      expect(
        findings(
          `it('uses Chai property assertions', () => {
             expect(status).to.be.true;
             expect(item).to.exist;
           });`,
          [uninvokedMatcher],
        ),
      ).toEqual([]);
    });
  });

  describe('conditionalAssertion', () => {
    it('detects expect inside an if statement', () => {
      const result = findings(
        `it('conditionally verifies', () => {
           const items = getItems();
           if (items.length > 0) {
             expect(items[0]).toBe('first');
           }
         });`,
        [conditionalAssertion],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('conditional-assertion');
      expect(result[0]?.severity).toBe('P2');
      expect(result[0]?.message).toContain('an if statement');
      expect(result[0]?.hint).toContain('expect.hasAssertions()');
    });

    it('detects expect inside an else block', () => {
      const result = findings(
        `it('verifies in else branch', () => {
           if (status === 'loading') {
             doSomething();
           } else {
             expect(loaded).toBe(true);
           }
         });`,
        [conditionalAssertion],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('conditional-assertion');
      expect(result[0]?.message).toContain('an if statement');
    });

    it('detects expect inside a loop', () => {
      const result = findings(
        `it('verifies all elements in loop', () => {
           for (const item of items) {
             expect(item.valid).toBe(true);
           }
         });`,
        [conditionalAssertion],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('conditional-assertion');
      expect(result[0]?.message).toContain('a loop');
    });

    it('detects expect inside a while loop', () => {
      const result = findings(
        `it('verifies while conditions', () => {
           while (cursor.hasNext()) {
             expect(cursor.next()).toBeDefined();
           }
         });`,
        [conditionalAssertion],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('conditional-assertion');
      expect(result[0]?.message).toContain('a loop');
    });

    it('detects expect inside a switch statement', () => {
      const result = findings(
        `it('verifies via switch', () => {
           switch (type) {
             case 'admin':
               expect(role).toBe('admin');
               break;
           }
         });`,
        [conditionalAssertion],
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.rule).toBe('conditional-assertion');
      expect(result[0]?.message).toContain('a switch statement');
    });

    it('detects expect inside ternary conditional expression', () => {
      const result = findings(
        `it('verifies via ternary', () => {
           isReady ? expect(val).toBe(1) : expect(val).toBe(0);
         });`,
        [conditionalAssertion],
      );
      expect(result).toHaveLength(2);
      expect(result[0]?.rule).toBe('conditional-assertion');
      expect(result[0]?.message).toContain('a conditional expression');
    });

    it('accepts conditional assertion when expect.hasAssertions() is declared', () => {
      expect(
        findings(
          `it('guarded conditional assertion', () => {
             expect.hasAssertions();
             if (items.length > 0) {
               expect(items[0]).toBe('ready');
             }
           });`,
          [conditionalAssertion],
        ),
      ).toEqual([]);
    });

    it('accepts conditional assertion when expect.assertions(N) is declared', () => {
      expect(
        findings(
          `it('planned conditional assertion count', () => {
             expect.assertions(1);
             if (condition) {
               expect(value).toBe(true);
             }
           });`,
          [conditionalAssertion],
        ),
      ).toEqual([]);
    });

    it('accepts unconditional top-level assertions', () => {
      expect(
        findings(
          `it('verifies directly', () => {
             const user = getUser();
             expect(user.name).toBe('Eduardo');
           });`,
          [conditionalAssertion],
        ),
      ).toEqual([]);
    });
  });
});





