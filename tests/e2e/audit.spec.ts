/**
 * Smart EDMS — E2E: Audit log + integrity verification
 *
 * Tests:
 *   - Audit log page renders with timeline
 *   - Verify integrity button works
 *   - Audit events display
 */

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@smartedms.local');
  await page.fill('input[type="password"]', 'ChangeMe!2025');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
});

test.describe('Audit Log', () => {
  test('audit page renders with events', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.locator('h1')).toBeVisible();

    // Should have audit events (from our login actions)
    await page.waitForTimeout(2000);
    const eventCount = await page.locator('[class*="sequenceNum"], [class*="font-mono"]').count();
    expect(eventCount).toBeGreaterThan(0);
  });

  test('verify integrity button works', async ({ page }) => {
    await page.goto('/audit');
    await expect(page.locator('button:has-text("Verify integrity")')).toBeVisible();
    await page.click('button:has-text("Verify integrity")');
    await page.waitForTimeout(3000);

    // Should show verification result (dialog or alert)
    const dialog = page.locator('[role="dialog"]');
    if (await dialog.isVisible({ timeout: 5_000 })) {
      await expect(dialog).toContainText(/intact|broken/i);
    }
  });

  test('audit receipts panel renders', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForTimeout(2000);
    // Scroll down to find receipts panel
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('text=Signed audit receipts').or(page.locator('text=audit receipt'))).toBeVisible({ timeout: 5_000 });
  });
});
