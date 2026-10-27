import { expect, test } from '@playwright/test';

test('bundled original arithmetic saves only after confirmation, reports write failure, and survives page restart', async ({
  page,
}) => {
  await page.goto('/?id=crypto-persist&generation=1');
  await page
    .getByRole('button', {
      name: 'Add bundled crypto arithmetic practice',
      exact: true,
    })
    .click();
  await expect(page.getByText(/Confirm changes:/)).toBeVisible();
  await page
    .getByRole('button', { name: 'Fail synthetic learning save', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'この内容を保存 / Apply', exact: true })
    .click();
  await expect(
    page.getByText('Synthetic learning write failure', { exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'この内容を保存 / Apply', exact: true })
    .click();
  await expect(
    page.getByText('TenkaCloud · bundled arithmetic practice', { exact: true })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('TenkaCloud · bundled arithmetic practice', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: /Crypto: field/ }).click();
  await expect(page.getByText(/find \(90\+10\) mod 97/)).toBeVisible();
});

test('unavailable AI stays disabled while bundled practice remains usable; recheck enables bounded generation', async ({
  page,
}) => {
  await page.goto('/?id=ai-availability&generation=1');
  const generate = page.getByRole('button', {
    name: 'Create practice with Apple Intelligence',
    exact: true,
  });
  await expect(
    page.getByText('Apple Intelligence is not enabled.', { exact: true })
  ).toBeVisible();
  await expect(generate).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: 'Add bundled crypto arithmetic practice',
      exact: true,
    })
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Synthetic model available', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Check AI availability again', exact: true })
    .click();
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(page.getByText(/Confirm changes:/)).toBeVisible();
  await page
    .getByRole('button', { name: 'この内容を保存 / Apply', exact: true })
    .click();
  await expect(
    page.getByText('Apple Intelligence · template-checked practice', {
      exact: true,
    })
  ).toBeVisible();
});

test('malformed generated output never becomes saved content and retry can succeed', async ({
  page,
}) => {
  await page.goto('/?id=ai-malformed&generation=1');
  await page
    .getByRole('button', { name: 'Synthetic model malformed', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Check AI availability again', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Create practice with Apple Intelligence',
      exact: true,
    })
    .click();
  await expect(page.getByRole('alert')).toContainText('Generation failed');
  await expect(page.getByText(/Confirm changes:/)).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText('Apple Intelligence · template-checked practice', {
      exact: true,
    })
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Synthetic model available', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Check AI availability again', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Create practice with Apple Intelligence',
      exact: true,
    })
    .click();
  await expect(page.getByText(/Confirm changes:/)).toBeVisible();
});

test('navigation away discards a late model result instead of changing learning data', async ({
  page,
}) => {
  await page.goto('/?id=ai-late&generation=1');
  await page
    .getByRole('button', { name: 'Synthetic model delayed', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Check AI availability again', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Create practice with Apple Intelligence',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', { name: 'Generating on device…', exact: true })
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Back to Passport', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Finish synthetic generation', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Open learning', exact: true })
    .click();
  await expect(page.getByText(/Confirm changes:/)).toHaveCount(0);
  await expect(
    page.getByText('Apple Intelligence · template-checked practice', {
      exact: true,
    })
  ).toHaveCount(0);
});

test('generated practice has a visible preview, explicit saved Open action and no silent auto-advance', async ({
  page,
}) => {
  await page.goto('/?id=ai-open-flow&generation=1');
  await page
    .getByRole('button', { name: 'Synthetic model available', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Check AI availability again', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Create practice with Apple Intelligence',
      exact: true,
    })
    .click();
  const result = page.getByTestId('created-practice');
  await expect(result).toContainText('Practice created');
  await expect(result).toContainText('Finite-field addition:');
  await expect(
    page.getByRole('button', { name: /^Open this question:/ })
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'この内容を保存 / Apply', exact: true })
    .click();
  await expect(result).toContainText('Your practice is ready');
  await result.getByRole('button', { name: /^Open this question:/ }).click();
  await expect(page.getByText(/Finite-field addition:/)).toBeVisible();
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(
    page.getByText('✓ 選択問題の正解 / Correct choice', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '次へ / Next', exact: true })
  ).toBeEnabled();
  await expect(
    page.getByText('✓ この練習の回答を記録しました / Practice recorded', {
      exact: true,
    })
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: '解説を見る / Read explanation', exact: true })
    .click();
  await expect(
    page.getByText('(90+10) mod 97 = 3', { exact: true })
  ).toBeVisible();
});

test('explicit cancellation discards delayed output without a misleading generated preview', async ({
  page,
}) => {
  await page.goto('/?id=ai-explicit-cancel&generation=1');
  await page
    .getByRole('button', { name: 'Synthetic model delayed', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Check AI availability again', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Create practice with Apple Intelligence',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Cancel generation', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Generation cancelled');
  await expect(page.getByTestId('created-practice')).toHaveCount(0);
  await expect(page.getByText(/Confirm changes:/)).toHaveCount(0);
});

test('generation locks conflicting catalog writes until the draft is admitted', async ({
  page,
}) => {
  await page.goto('/?id=ai-write-collision&generation=1');
  await page.getByRole('button', { name: 'Saved data', exact: true }).click();
  await page
    .getByRole('button', { name: 'Synthetic model delayed', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Check AI availability again', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Create practice with Apple Intelligence',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: '取得元を登録・更新 / Fetch manifest',
      exact: true,
    })
  ).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: '学習 JSON から復元 / Restore backup',
      exact: true,
    })
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Cancel generation', exact: true })
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Finish synthetic generation', exact: true })
    .click();
  await expect(page.getByTestId('created-practice')).toContainText(
    'Practice created'
  );
  await page
    .getByRole('button', { name: 'この内容を保存 / Apply', exact: true })
    .click();
  await page.getByRole('button', { name: 'Saved data', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'この版の教材と履歴を削除 / Remove this catalog & history',
      exact: true,
    })
    .click();
  const open = page.getByRole('button', { name: /^Open this question:/ });
  await expect(open).toBeDisabled();
  await page
    .getByRole('button', { name: 'キャンセル / Cancel', exact: true })
    .click();
  await expect(open).toBeEnabled();
});
