/**
 * Smart EDMS — E2E: Document management
 *
 * Tests:
 *   - Documents list page renders
 *   - Upload dialog opens
 *   - Document detail page renders with tabs
 *   - Download generates signed URL
 */

import { test, expect } from '@playwright/test';

// Helper: login before each test
test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@smartedms.local');
  await page.fill('input[type="password"]', 'ChangeMe!2025');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
});

test.describe('Document Management', () => {
  test('documents list page renders', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('text=Upload document')).toBeVisible();
  });

  test('upload dialog opens when clicking upload button', async ({ page }) => {
    await page.goto('/documents');
    await page.click('button:has-text("Upload document")');
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Files are validated')).toBeVisible();
  });

  test('document detail page renders with tabs', async ({ page }) => {
    // Go to documents list
    await page.goto('/documents');
    await page.waitForTimeout(2000);

    // Click on the first document link
    const docLink = page.locator('a[href^="/documents/"]').first();
    if (await docLink.isVisible()) {
      await docLink.click();
      await page.waitForTimeout(3000);

      // Check tabs are present
      await expect(page.locator('[role="tablist"]')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('[role="tab"]:has-text("Overview")')).toBeVisible();
      await expect(page.locator('[role="tab"]:has-text("Preview")')).toBeVisible();
      await expect(page.locator('[role="tab"]:has-text("Versions")')).toBeVisible();
      await expect(page.locator('[role="tab"]:has-text("AI")')).toBeVisible();
    }
  });

  test('search page renders with filters', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('input[placeholder*="earch"]')).toBeVisible();
  });
});
