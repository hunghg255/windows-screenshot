// Run from the repository root with the landing page running on port 5174.
const { chromium, expect } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5174');
    await expect(page.getByRole('combobox', { name: 'Ngôn ngữ' })).toHaveValue('vi');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.locator('h1')).toContainText('Chụp nhanh.');
    const image = await page.locator('.app-screenshot').getAttribute('src');
    for (const language of ['en', 'vi']) {
      await page.getByRole('combobox').selectOption(language);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.locator('h1')).toContainText(language === 'en' ? 'Capture fast.' : 'Chụp nhanh.');
      await expect(page).toHaveTitle(language === 'en' ? 'Screenshot — Capture fast. Say it clearly.' : 'Screenshot — Chụp nhanh. Nói rõ.');
      await expect(page.locator('.app-screenshot')).toHaveAttribute('src', image);
      await expect(page.locator('.download-note')).toContainText(language === 'en' ? 'Free' : 'Miễn phí');
      await expect(page.locator('.app-gallery figcaption')).toContainText(language === 'en' ? 'Annotate' : 'Ghi chú');
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByRole('combobox')).toBeVisible();
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Overflow at ${width}px in ${language}`);
      }
    }
    await page.getByRole('combobox').selectOption('en');
    await page.screenshot({ path: 'test-results/landing-english.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 900 });
    await page.screenshot({ path: 'test-results/landing-english-mobile.png', fullPage: true });
    await page.reload();
    await expect(page.getByRole('combobox')).toHaveValue('vi');
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    expect(errors).toEqual([]);
    console.log('PASS: Vietnamese default, EN/VI switching, metadata, original images, mobile/desktop, reload.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
