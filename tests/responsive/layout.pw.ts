import { expect, type Page, test } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

async function doubleText(page: Page) {
  await page.locator('body').evaluate((body) => {
    const text = [...body.querySelectorAll<HTMLElement>('[dir="auto"]')].map(
      (element) => {
        const { fontSize, lineHeight } = getComputedStyle(element);
        return { element, fontSize, lineHeight };
      }
    );
    for (const { element, fontSize, lineHeight } of text) {
      element.style.fontSize = `${parseFloat(fontSize) * 2}px`;
      if (lineHeight !== 'normal')
        element.style.lineHeight = `${parseFloat(lineHeight) * 2}px`;
    }
  });
}

async function expectContentToFit(page: Page, width: number) {
  const overflow = await page.locator('body').evaluate((body) => {
    return [
      ...body.querySelectorAll<HTMLElement>(
        '[role="button"],[role="radio"],[role="checkbox"],input,textarea,[role="img"]'
      ),
    ]
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        const editable = element.matches('input,textarea');
        return (
          bounds.width > 0 &&
          (bounds.left < -1 ||
            bounds.right > innerWidth + 1 ||
            (!editable && element.scrollWidth > element.clientWidth + 1))
        );
      })
      .map(
        (element) =>
          `${element.getAttribute('role')}: ${element.textContent?.slice(0, 60)}`
      );
  });
  expect(overflow, `Overflow at ${width}px`).toEqual([]);
}

for (const width of [240, 280, 320, 390, 430, 744, 1024, 1366]) {
  test(`controls fit at ${width}px and dense QR remains decodable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/');
    const qr = page.getByRole('img').last();
    await expect(qr).toBeVisible();
    await expectContentToFit(page, width);
    const image = PNG.sync.read(await qr.screenshot());
    const code = jsQR(
      new Uint8ClampedArray(image.data),
      image.width,
      image.height
    );
    expect(code?.data).toBe(`https://example.com/${'a'.repeat(900)}`);
  });
}

test('fold/unfold, split view and keyboard-sized viewport preserve the draft and save action', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/');
  const draft = page.getByRole('textbox', { name: 'Persistent draft' });
  await draft.fill('Keep this draft across display transitions');
  for (const size of [
    { width: 1024, height: 744 },
    { width: 280, height: 650 },
    { width: 390, height: 300 },
    { width: 850, height: 390 },
    { width: 390, height: 850 },
  ]) {
    await page.setViewportSize(size);
    await expect(draft).toHaveValue(
      'Keep this draft across display transitions'
    );
    const footer = page.getByRole('button', {
      name: 'Save and continue / 保存して続ける',
    });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
    await expectContentToFit(page, size.width);
  }
  await page
    .getByRole('button', { name: 'Save and continue / 保存して続ける' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Saved', exact: true })
  ).toBeVisible();
});

test('horizontal safe-area insets protect controls', async ({ page }) => {
  await page.setViewportSize({ width: 744, height: 650 });
  await page.goto('/?inset=52');
  const footer = page.getByRole('button', {
    name: 'Save and continue / 保存して続ける',
  });
  await expect(footer).toBeVisible();
  const bounds = await footer.boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(52);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(744 - 52);
});

test('production card editor preserves input, focus and save across resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 650 });
  await page.goto('/?mode=editor');
  const name = page.getByRole('textbox', { name: '名前', exact: true });
  await name.fill('Sample Resize');
  await name.focus();
  for (const size of [
    { width: 1024, height: 744 },
    { width: 280, height: 320 },
    { width: 390, height: 850 },
  ]) {
    await page.setViewportSize(size);
    await expect(name).toHaveValue('Sample Resize');
    await expect(name).toBeFocused();
    await expectContentToFit(page, size.width);
  }
  const save = page.getByRole('button', { name: '保存', exact: true });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await expect(page.getByText('Sample Resize', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '編集する', exact: true })
  ).toBeAttached();
});

test('production learning navigation wraps and changes tabs at split-view width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 280, height: 650 });
  await page.goto('/?mode=library');
  const add = page
    .getByRole('button', { name: 'Add lessons', exact: true })
    .first();
  await add.scrollIntoViewIfNeeded();
  await add.click();
  await expect(
    page.getByRole('button', { name: 'Start with saved lessons', exact: true })
  ).toBeAttached();
  await expectContentToFit(page, 280);
  const review = page.getByRole('button', { name: 'Review', exact: true });
  await review.scrollIntoViewIfNeeded();
  await review.click();
  await expect(
    page.getByText('復習対象はありません。 / Nothing to review.')
  ).toBeAttached();
});

test('large text and short height keep lesson actions reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 380 });
  await page.goto('/?mode=lesson');
  await expect(
    page.getByRole('button', { name: '教材一覧へ / Back to lessons' })
  ).toBeAttached();
  // Browser rendering at 200% text is separate evidence from native Dynamic Type.
  await doubleText(page);
  await expectContentToFit(page, 320);
  const back = page.getByRole('button', {
    name: '教材一覧へ / Back to lessons',
  });
  await back.scrollIntoViewIfNeeded();
  await expect(back).toBeInViewport();
});

test('shared selectors grow with text instead of clipping their labels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 280, height: 650 });
  await page.goto('/?mode=selectors');
  await expect(page.getByRole('radio').first()).toBeAttached();
  await doubleText(page);
  await expectContentToFit(page, 280);
  const clipped = await page
    .getByRole('radio')
    .evaluateAll(
      (elements) =>
        elements.filter(
          (element) => element.scrollHeight > element.clientHeight + 1
        ).length
    );
  expect(clipped).toBe(0);
});

test('camera controls remain reachable with large text in a short window', async ({
  page,
}) => {
  for (const size of [
    { width: 320, height: 240 },
    { width: 744, height: 320 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/?mode=camera');
    await doubleText(page);
    const preview = await page
      .getByTestId('camera-preview-space')
      .boundingBox();
    expect(preview?.height).toBeGreaterThanOrEqual(size.height * 0.25);
    const cancel = page.getByRole('button', {
      name: 'Stop scanning',
      exact: true,
    });
    await cancel.scrollIntoViewIfNeeded();
    await expect(cancel).toBeInViewport();
    await expectContentToFit(page, size.width);
    await cancel.click();
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  }
});

test('QR stays inside a narrow split-view column', async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 650 });
  await page.goto('/');
  const qr = page.getByRole('img').last();
  await expect(qr).toBeVisible();
  const bounds = await qr.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(280);
  const fits = await page
    .getByTestId('qr-container')
    .evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(fits).toBe(true);
});

test('footer follows the readable column on a tablet', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.goto('/');
  const footer = page.getByRole('button', {
    name: 'Save and continue / 保存して続ける',
  });
  await expect(footer).toBeVisible();
  const bounds = await footer.boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(680);
});
