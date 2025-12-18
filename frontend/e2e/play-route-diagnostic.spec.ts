import { test, expect } from '@playwright/test';

test('play route diagnostic', async ({ page }) => {
  const consoles: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: { url: string; failureText?: string }[] = [];

  page.on('console', msg => consoles.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), failureText: req.failure()?.errorText }));

  const url = 'https://thodha.github.io/sudoku/play';
  console.log('navigating to', url);
  const resp = await page.goto(url, { timeout: 60000 });
  console.log('goto status', resp?.status());

  try { await page.waitForLoadState('networkidle', { timeout: 60000 }); } catch (e) { console.log('networkidle timeout'); }

  // Wait an extra bit for app hydration
  await page.waitForTimeout(2000);

  const html = await page.content();
  console.log('html length', html.length);
  const hasEasyText = await page.evaluate(() => !!document.querySelector('body') && document.body.innerText.includes('Easy'));
  console.log('has Easy text?', hasEasyText);

  console.log('console messages:', consoles.slice(0, 50));
  console.log('page errors:', pageErrors.slice(0, 50));
  console.log('failed requests:', failedRequests.slice(0, 50));

  expect(resp).not.toBeNull();
});
