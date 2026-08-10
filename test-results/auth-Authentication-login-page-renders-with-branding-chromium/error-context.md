# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication >> login page renders with branding
- Location: tests/e2e/auth.spec.ts:15:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /sign in/i })
Expected: visible
Error: strict mode violation: getByRole('button', { name: /sign in/i }) resolved to 2 elements:
    1) <button type="submit" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground…>…</button> aka getByRole('button', { name: 'Sign in', exact: true })
    2) <button type="button" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-background …>…</button> aka getByRole('button', { name: 'Sign in with passkey' })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: /sign in/i })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - heading "Smart EDMS" [level=1] [ref=e10]
      - paragraph [ref=e11]: Secure Document Governance Platform
    - generic [ref=e12]:
      - generic [ref=e13]:
        - heading "Sign in" [level=2] [ref=e14]
        - paragraph [ref=e15]: Welcome to Smart EDMS
      - generic [ref=e16]:
        - generic [ref=e17]:
          - generic [ref=e18]: Email
          - textbox "Email" [ref=e23]:
            - /placeholder: you@company.com
        - generic [ref=e24]:
          - generic [ref=e25]: Password
          - generic [ref=e26]:
            - textbox "Password" [ref=e30]:
              - /placeholder: ••••••••••
            - button [ref=e31]
        - button "Sign in" [ref=e36]
        - link "Forgot password?" [ref=e38] [cursor=pointer]:
          - /url: /forgot-password
        - generic [ref=e39]: or
        - button "Sign in with passkey" [ref=e45]
    - paragraph [ref=e46]: Secure Document Governance Platform
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e52] [cursor=pointer]
  - alert [ref=e56]
```

# Test source

```ts
  1  | /**
  2  |  * Smart EDMS — E2E: Authentication flow
  3  |  *
  4  |  * Tests:
  5  |  *   - Login page renders with premium glassmorphism
  6  |  *   - Login with valid credentials
  7  |  *   - Login with invalid credentials (error shown)
  8  |  *   - Dashboard renders after login
  9  |  *   - Logout works
  10 |  */
  11 | 
  12 | import { test, expect } from '@playwright/test';
  13 | 
  14 | test.describe('Authentication', () => {
  15 |   test('login page renders with branding', async ({ page }) => {
  16 |     await page.goto('/login');
  17 |     await expect(page.locator('h1')).toContainText('Smart EDMS');
  18 |     await expect(page.locator('input[type="email"]')).toBeVisible();
  19 |     await expect(page.locator('input[type="password"]')).toBeVisible();
> 20 |     await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
     |                                                                  ^ Error: expect(locator).toBeVisible() failed
  21 |   });
  22 | 
  23 |   test('login with valid credentials redirects to dashboard', async ({ page }) => {
  24 |     await page.goto('/login');
  25 |     await page.fill('input[type="email"]', 'admin@smartedms.local');
  26 |     await page.fill('input[type="password"]', 'ChangeMe!2025');
  27 |     await page.click('button[type="submit"]');
  28 |     await page.waitForURL('**/dashboard', { timeout: 10_000 });
  29 |     await expect(page.locator('h1')).toBeVisible();
  30 |   });
  31 | 
  32 |   test('login with invalid credentials shows error', async ({ page }) => {
  33 |     await page.goto('/login');
  34 |     await page.fill('input[type="email"]', 'admin@smartedms.local');
  35 |     await page.fill('input[type="password"]', 'WrongPassword123!');
  36 |     await page.click('button[type="submit"]');
  37 |     await page.waitForTimeout(2000);
  38 |     // Should stay on login page
  39 |     expect(page.url()).toContain('/login');
  40 |   });
  41 | 
  42 |   test('dashboard shows stat cards after login', async ({ page }) => {
  43 |     // Login first
  44 |     await page.goto('/login');
  45 |     await page.fill('input[type="email"]', 'admin@smartedms.local');
  46 |     await page.fill('input[type="password"]', 'ChangeMe!2025');
  47 |     await page.click('button[type="submit"]');
  48 |     await page.waitForURL('**/dashboard', { timeout: 10_000 });
  49 | 
  50 |     // Check stat cards render
  51 |     await expect(page.locator('text=Total documents')).toBeVisible({ timeout: 5_000 });
  52 |     await expect(page.locator('text=My documents')).toBeVisible();
  53 |     await expect(page.locator('text=Pending approvals')).toBeVisible();
  54 |     await expect(page.locator('text=Active legal holds')).toBeVisible();
  55 |   });
  56 | 
  57 |   test('navigation sidebar renders all sections', async ({ page }) => {
  58 |     await page.goto('/login');
  59 |     await page.fill('input[type="email"]', 'admin@smartedms.local');
  60 |     await page.fill('input[type="password"]', 'ChangeMe!2025');
  61 |     await page.click('button[type="submit"]');
  62 |     await page.waitForURL('**/dashboard', { timeout: 10_000 });
  63 | 
  64 |     // Check sidebar sections
  65 |     await expect(page.locator('aside')).toBeVisible();
  66 |     await expect(page.locator('aside').locator('text=Dashboard')).toBeVisible();
  67 |     await expect(page.locator('aside').locator('text=Documents')).toBeVisible();
  68 |     await expect(page.locator('aside').locator('text=Audit Log')).toBeVisible();
  69 |     await expect(page.locator('aside').locator('text=Users')).toBeVisible();
  70 |   });
  71 | });
  72 | 
```