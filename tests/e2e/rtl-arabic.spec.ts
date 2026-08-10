/**
 * Smart EDMS — E2E: RTL + Arabic locale
 *
 * Tests:
 *   - Language switcher is visible
 *   - Switching to Arabic sets dir="rtl" on <html>
 *   - Arabic font (Cairo) is applied
 *   - Sidebar navigation renders in RTL
 *   - Switching back to English restores LTR
 */

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@smartedms.local');
  await page.fill('input[type="password"]', 'ChangeMe!2025');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
});

test.describe('RTL + Arabic Locale', () => {
  test('language switcher is visible in top bar', async ({ page }) => {
    await page.goto('/dashboard');
    // The globe icon button
    const langButton = page.locator('button[title="Change language"]');
    await expect(langButton).toBeVisible();
  });

  test('switching to Arabic sets RTL direction', async ({ page }) => {
    await page.goto('/dashboard');

    // Set locale via localStorage (simulating language switcher)
    await page.evaluate(() => {
      localStorage.setItem('smart-edms-locale', 'ar');
    });

    // Reload to apply
    await page.reload();
    await page.waitForTimeout(3000);

    // Check dir attribute
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');

    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('ar');
  });

  test('Arabic font is applied in RTL mode', async ({ page }) => {
    await page.goto('/dashboard');
    await page.evaluate(() => {
      localStorage.setItem('smart-edms-locale', 'ar');
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // Check that body font-family includes Arabic font
    const fontFamily = await page.evaluate(() => {
      return window.getComputedStyle(document.body).fontFamily;
    });
    expect(fontFamily.toLowerCase()).toContain('cairo');
  });

  test('sidebar renders correctly in RTL', async ({ page }) => {
    await page.goto('/dashboard');
    await page.evaluate(() => {
      localStorage.setItem('smart-edms-locale', 'ar');
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // Sidebar should still be visible
    await expect(page.locator('aside')).toBeVisible();

    // Navigation items should be visible
    const navItems = page.locator('aside nav a');
    const count = await navItems.count();
    expect(count).toBeGreaterThan(5);
  });

  test('switching back to English restores LTR', async ({ page }) => {
    await page.goto('/dashboard');

    // Set to Arabic first
    await page.evaluate(() => {
      localStorage.setItem('smart-edms-locale', 'ar');
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // Switch back to English
    await page.evaluate(() => {
      localStorage.setItem('smart-edms-locale', 'en');
    });
    await page.reload();
    await page.waitForTimeout(2000);

    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('ltr');
  });

  test('dark mode toggle works', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Find theme toggle button (sun or moon icon)
    const themeButton = page.locator('button[title*="mode"]').or(page.locator('button[title*="theme"]'));
    if (await themeButton.isVisible({ timeout: 3000 })) {
      const htmlClassBefore = await page.locator('html').getAttribute('class');
      await themeButton.click();
      await page.waitForTimeout(500);
      const htmlClassAfter = await page.locator('html').getAttribute('class');
      expect(htmlClassAfter).not.toBe(htmlClassBefore);
    }
  });

  test('command palette opens with Cmd+K', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Press Cmd+K (or Ctrl+K on Windows/Linux)
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(1000);

    // Command dialog should be visible
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 3000 });
  });

  test('mobile navigation drawer works', async ({ page, isMobile }) => {
    // Skip on desktop
    test.skip(!isMobile, 'Mobile-only test');

    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Find hamburger menu button
    const menuButton = page.locator('button:has(svg.lucide-menu)');
    if (await menuButton.isVisible({ timeout: 3000 })) {
      await menuButton.click();
      await page.waitForTimeout(500);

      // Drawer should open
      const drawer = page.locator('[role="dialog"]');
      await expect(drawer).toBeVisible({ timeout: 3000 });
    }
  });
});
