import { test, expect } from '@playwright/test';

test('deployment diagnostic', async ({ page }) => {
  const consoles: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: { url: string; failureText?: string }[] = [];

  page.on('console', msg => {
    consoles.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });
  page.on('requestfailed', req => {
    failedRequests.push({ url: req.url(), failureText: req.failure()?.errorText });
  });

  const url = 'https://thodha.github.io/sudoku/';
  console.log('navigating to', url);
  const resp = await page.goto(url, { timeout: 30000 });
  console.log('goto status', resp?.status());

  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch (e) {
    console.log('networkidle timeout');
  }

  // dump some info
  const html = await page.content();
  console.log('html length', html.length);

  const hasBoard = await page.evaluate(() => !!document.querySelector('.sudoku-board'));
  console.log('has .sudoku-board?', hasBoard);

  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log('body head:', bodyText.replace(/\n/g, '\\n'));

  console.log('console messages:', consoles.slice(0, 50));
  console.log('page errors:', pageErrors.slice(0, 50));
  console.log('failed requests:', failedRequests.slice(0, 50));

  // Expose for debugging
  expect(resp).not.toBeNull();
});
