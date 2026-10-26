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
async function answerFromEvidence(page: Page) {
  await page.getByRole('button', { name: /^I-CLOUD ·/ }).click();
  const cloud = JSON.parse(
    await page.getByTestId('practice-evidence').innerText()
  ) as { events: { operation: string; session: string }[] };
  const action = cloud.events.find(
    (e) => e.operation === 'EnableExternalExport'
  );
  if (!action) throw new Error('Missing displayed action');
  await page.getByRole('button', { name: /^I-IDP ·/ }).click();
  const idp = JSON.parse(
    await page.getByTestId('practice-evidence').innerText()
  ) as { events: { session: string; account: string }[] };
  const login = idp.events.find((e) => e.session === action.session);
  if (!login) throw new Error('Missing displayed login');
  await page
    .getByRole('textbox', { name: 'Answer', exact: true })
    .fill(login.account);
  await page.getByRole('button', { name: 'I-IDP', exact: true }).click();
  await page.getByRole('button', { name: 'I-CLOUD', exact: true }).click();
}
test('the original evidence-based answer survives navigation, SQLite connection restart and page restart', async ({
  page,
  request,
}) => {
  const id = 'recovery';
  await open(page, id);
  await answerFromEvidence(page);
  await page
    .getByRole('button', { name: 'Submit answer and evidence', exact: true })
    .click();
  await expect(page.getByTestId('practice-score')).toHaveText(
    'Score: 20 / 400'
  );
  await expect(
    page.getByRole('button', {
      name: 'Submit answer and evidence',
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
      name: 'Submit answer and evidence',
      exact: true,
    })
  ).toBeDisabled();
});
test('a failed SQLite commit publishes no score and retry uses the original operation', async ({
  page,
  request,
}) => {
  const id = 'failure';
  await open(page, id);
  await answerFromEvidence(page);
  await request.post(`/api/${id}/fail`);
  await page
    .getByRole('button', { name: 'Submit answer and evidence', exact: true })
    .click();
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
  const answer = page.getByRole('textbox', { name: 'Answer', exact: true });
  await answer.fill('draft retained');
  await answer.focus();
  await page.setViewportSize({ width: 320, height: 480 });
  await expect(answer).toHaveValue('draft retained');
  await expect(answer).toBeFocused();
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
  await page
    .getByRole('button', { name: 'Next free hint', exact: true })
    .click();
  await expect(page.getByTestId('practice-score')).toHaveText('Score: 0 / 400');
});
test('the screen respects the existing512-character/four-evidence admission instead of trapping invalid operations', async ({
  page,
}) => {
  await open(page, 'admission');
  const answer = page.getByRole('textbox', { name: 'Answer', exact: true });
  await answer.fill('x'.repeat(513));
  await expect(answer).toHaveValue('x'.repeat(512));
  await page
    .getByRole('button', { name: 'Submit answer and evidence', exact: true })
    .click();
  await expect(page.getByTestId('practice-result')).toContainText(
    'Not correct yet'
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '10', exact: true }).click();
  for (const id of ['E-INVENTORY', 'E-APPROVAL', 'E-HISTORY', 'E-PLAN'])
    await page.getByRole('button', { name: id, exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'E-OBSERVATION', exact: true })
  ).toBeDisabled();
  await page.getByRole('button', { name: '✓ E-PLAN', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'E-OBSERVATION', exact: true })
  ).toBeEnabled();
});
