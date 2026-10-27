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
