import { expect, type Page, test } from '@playwright/test';

async function open(page: Page, id: string) {
  await page.goto(`/?id=${id}`);
  await page
    .getByRole('button', {
      name: 'Open on-device TenkaCloud practice',
      exact: true,
    })
    .click();
  await expect(page.getByTestId('practice-score')).toHaveText('Score: 0 / 400');
}
async function conclude(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 850) {
    const tab = page.getByRole('button', {
      name: 'Conclusion and evidence',
      exact: true,
    });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
  await expect(page.getByTestId('practice-answer-panel')).toBeVisible();
}
async function answerFromEvidence(page: Page) {
  await page
    .getByTestId('practice-files')
    .getByRole('button', { name: /^I-CLOUD ·/ })
    .click();
  const cloud = JSON.parse(
    await page.getByTestId('practice-evidence').innerText()
  ) as { events: { operation: string; session: string }[] };
  const action = cloud.events.find(
    (e) => e.operation === 'EnableExternalExport'
  );
  if (!action) throw new Error('Missing displayed action');
  await page
    .getByTestId('practice-files')
    .getByRole('button', { name: /^I-IDP ·/ })
    .click();
  const idp = JSON.parse(
    await page.getByTestId('practice-evidence').innerText()
  ) as { events: { session: string; account: string }[] };
  const login = idp.events.find((e) => e.session === action.session);
  if (!login) throw new Error('Missing displayed login');
  await conclude(page);
  await page.getByRole('button', { name: login.account, exact: true }).click();
  await page
    .getByTestId('practice-citations')
    .getByRole('button', { name: /^I-IDP ·/ })
    .click();
  await page
    .getByTestId('practice-citations')
    .getByRole('button', { name: /^I-CLOUD ·/ })
    .click();
  return login.account;
}
test('the original evidence-based answer survives navigation, SQLite connection restart and page restart', async ({
  page,
  request,
}) => {
  const id = 'recovery';
  await open(page, id);
  await answerFromEvidence(page);
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByTestId('practice-score')).toHaveText(
    'Score: 20 / 400'
  );
  await expect(
    page.getByRole('button', {
      name: 'Check answer',
      exact: true,
    })
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Back to learning', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Back to Passport', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Open learning', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Open on-device TenkaCloud practice',
      exact: true,
    })
    .click();
  await expect(page.getByTestId('practice-score')).toHaveText(
    'Score: 20 / 400'
  );
  await request.post(`/api/${id}/restart`);
  await page.reload();
  await page
    .getByRole('button', {
      name: 'Open on-device TenkaCloud practice',
      exact: true,
    })
    .click();
  await expect(page.getByTestId('practice-score')).toHaveText(
    'Score: 20 / 400'
  );
  await expect(
    page.getByRole('button', {
      name: 'Check answer',
      exact: true,
    })
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Choose a question', exact: true })
    .click();
  const solvedCurrent = page.getByRole('button', { name: /^Question 1 ·/ });
  await expect(solvedCurrent).toHaveAttribute('aria-selected', 'true');
  await expect(solvedCurrent).toContainText('Selected');
  await expect(solvedCurrent).toContainText('Solved');
});
test('a failed SQLite commit publishes no score and retry uses the original operation', async ({
  page,
  request,
}) => {
  const id = 'failure';
  await open(page, id);
  await answerFromEvidence(page);
  await request.post(`/api/${id}/fail`);
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('practice-score')).toHaveText('Score: 0 / 400');
  await page
    .getByRole('button', { name: 'Retry same operation', exact: true })
    .click();
  await expect(page.getByTestId('practice-score')).toHaveText(
    'Score: 20 / 400'
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('narrow/Duo-sized changes keep the answer and controls usable without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 744, height: 900 });
  await open(page, 'resize');
  await conclude(page);
  const account = page
    .getByRole('button', { name: /@aster.example$/, exact: false })
    .first();
  const name = await account.getAttribute('aria-label');
  if (!name) throw new Error('Missing public candidate');
  await account.click();
  await page.setViewportSize({ width: 320, height: 480 });
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await page
    .getByRole('button', { name: 'Choose a question', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Back to question', exact: true })
    .click();
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await page.locator('body').evaluate((body) => {
    for (const element of body.querySelectorAll<HTMLElement>('[dir="auto"]')) {
      element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * 2}px`;
    }
  });
  const outside = await page.locator('body').evaluate((body) =>
    [...body.querySelectorAll<HTMLElement>('[role="button"],input,textarea')]
      .filter((element) => {
        const r = element.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
      })
      .map((e) => e.textContent)
  );
  expect(outside).toEqual([]);
  await page.getByRole('button', { name: 'Next hint', exact: true }).click();
  await expect(page.getByTestId('practice-score')).toHaveText('Score: 0 / 400');
});
test('tap forms retain the four-evidence admission without requiring a text keyboard', async ({
  page,
}) => {
  await open(page, 'admission');
  const correct = await answerFromEvidence(page);
  const displayed = await page
    .getByRole('button', { name: /@aster\.example$/ })
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label'))
    );
  const distractor = displayed.find((name) => name && name !== correct);
  if (!distractor) throw new Error('Missing displayed distractor');
  await page.getByRole('button', { name: distractor, exact: true }).click();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByTestId('practice-result')).toContainText(
    'Not correct yet'
  );
  await expect(page.getByTestId('practice-score')).toHaveText('Score: 0 / 400');
  await expect(
    page.getByRole('button', { name: 'Next question', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Read explanation', exact: true })
  ).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Choose a question', exact: true })
    .click();
  await page.getByRole('button', { name: /^Question 10 ·/ }).click();
  await expect(page.getByTestId('practice-question-title')).toContainText(
    'Question 10 / 15'
  );
  await conclude(page);
  const citations = page.getByTestId('practice-citations');
  for (const id of ['E-INVENTORY', 'E-APPROVAL', 'E-HISTORY', 'E-PLAN'])
    await citations
      .getByRole('button', { name: new RegExp(`^${id} ·`) })
      .click();
  await expect(
    citations.getByRole('button', { name: /^E-OBSERVATION ·/ })
  ).toBeDisabled();
  await citations.getByRole('button', { name: /^E-PLAN ·/ }).click();
  await expect(
    citations.getByRole('button', { name: /^E-OBSERVATION ·/ })
  ).toBeEnabled();
  await expect(
    page.getByRole('textbox', { name: 'Answer', exact: true })
  ).toHaveCount(0);
});

test('question rows select their own global index, show current state, and never replay another question result', async ({
  page,
}) => {
  await open(page, 'question-mapping');
  for (const number of [2, 3, 4, 15, 1]) {
    await page
      .getByRole('button', { name: 'Choose a question', exact: true })
      .click();
    await page
      .getByRole('button', { name: new RegExp(`^Question ${number} ·`) })
      .click();
    await expect(page.getByTestId('practice-question-title')).toContainText(
      `Question ${number} / 15`
    );
    await page
      .getByRole('button', { name: 'Choose a question', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: new RegExp(`^Question ${number} ·`) })
    ).toHaveAttribute('aria-selected', 'true');
    await page
      .getByRole('button', { name: 'Back to question', exact: true })
      .click();
  }
  await answerFromEvidence(page);
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.getByTestId('practice-result')).toContainText('Correct');
  await expect(page.getByTestId('practice-question-title')).toContainText(
    'Question 1 / 15'
  );
  await page
    .getByRole('button', { name: 'Read explanation', exact: true })
    .click();
  await expect(page.getByText(/The common session links two/)).toBeVisible();
  await page
    .getByRole('button', { name: 'Next question', exact: true })
    .click();
  await expect(page.getByTestId('practice-question-title')).toContainText(
    'Question 2 / 15'
  );
  await expect(page.getByTestId('practice-result')).toHaveCount(0);
});

test('case navigation matches the source grouping and selected is distinct from solved', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'case-groups');
  await expect(page.getByRole('button', { name: /^Case 1 ·/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await page.getByRole('button', { name: /^Case 2 ·/ }).click();
  await expect(page.getByTestId('practice-question-title')).toContainText(
    'Question 4 / 15'
  );
  await page
    .getByRole('button', { name: 'Choose a question', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: /^Case [1-4] ·/ })
  ).toHaveCount(4);
  const current = page.getByRole('button', { name: /^Question 4 ·/ });
  await expect(current).toHaveAttribute('aria-selected', 'true');
  await expect(current).toContainText('Selected');
  await expect(current).not.toContainText('Solved');
  await page.getByRole('button', { name: /^Question 3 ·/ }).click();
  await expect(page.getByRole('button', { name: /^Case 1 ·/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByTestId('practice-question-title')).toContainText(
    'Question 3 / 15'
  );
});

test('phone record/conclusion panes and Duo resize preserve the same tap draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'pane-draft');
  await expect(page.getByTestId('practice-evidence')).toContainText(
    'synthetic'
  );
  await expect(page.getByTestId('practice-answer-panel')).toHaveCount(0);
  await conclude(page);
  const account = page
    .getByRole('button', { name: /@aster\.example$/ })
    .first();
  const name = await account.getAttribute('aria-label');
  if (!name) throw new Error('Missing displayed account');
  await account.click();
  await page
    .getByTestId('practice-citations')
    .getByRole('button', { name: /^I-IDP ·/ })
    .click();
  await page
    .getByRole('button', { name: 'Read the records', exact: true })
    .click();
  await expect(page.getByTestId('practice-answer-panel')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Continue to conclusion', exact: true })
    .click();
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await page.setViewportSize({ width: 951, height: 669 });
  await expect(page.getByTestId('practice-files')).toBeVisible();
  await expect(page.getByTestId('practice-answer-panel')).toBeVisible();
  const panels = await page
    .locator(
      '[data-testid="practice-record-scroll"], [data-testid="practice-answer-panel"]'
    )
    .evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width };
      })
    );
  expect(panels[0]?.right).toBeLessThan(panels[1]?.left ?? 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(
    page
      .getByTestId('practice-citations')
      .getByRole('button', { name: /^I-IDP ·/ })
  ).toHaveAttribute('aria-selected', 'true');
});
