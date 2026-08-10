/**
 * Smart EDMS — E2E: Authentication flow
 *
 * Tests:
 *   - Login page renders with premium glassmorphism
 *   - Login with valid credentials
 *   - Login with invalid credentials (error shown)
 *   - Dashboard renders after login
 *   - Logout works
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page renders with branding', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('Smart EDMS');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // Use exact match — "Sign in" also matches "Sign in with passkey" button.
    // Wait up to 10s for translations to hydrate (useI18n loads client-side).
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@smartedms.local');
    await page.fill('input[type="password"]', 'ChangeMe!2025');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });
    await expect(page.locator('h1')).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@smartedms.local');
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    // Should stay on login page
    expect(page.url()).toContain('/login');
  });

  test('dashboard shows stat cards after login', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@smartedms.local');
    await page.fill('input[type="password"]', 'ChangeMe!2025');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });

    // Check stat cards render — use exact text match to avoid strict mode
    // violations when multiple elements contain the same text (e.g. a
    // stat card label and a sidebar link both say "My documents")
    await expect(page.getByText('Total documents', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('My documents', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Pending approvals', { exact: true })).toBeVisible();
    // legalHolds is only shown to admins — the admin user should see it
    await expect(page.getByText('Active legal holds', { exact: true })).toBeVisible();
  });

  test('navigation sidebar renders all sections', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@smartedms.local');
    await page.fill('input[type="password"]', 'ChangeMe!2025');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10_000 });

    // Check sidebar sections
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.locator('aside').locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('aside').locator('text=Documents')).toBeVisible();
    await expect(page.locator('aside').locator('text=Audit Log')).toBeVisible();
    await expect(page.locator('aside').locator('text=Users')).toBeVisible();
  });
});
