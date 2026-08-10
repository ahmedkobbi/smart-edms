# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication >> dashboard shows stat cards after login
- Location: tests/e2e/auth.spec.ts:42:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=My documents')
Expected: visible
Error: strict mode violation: locator('text=My documents') resolved to 2 elements:
    1) <button data-slot="button" class="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-background shadow-xs hover:bg-accent hover…>…</button> aka getByRole('button', { name: 'My documents' })
    2) <p class="text-xs font-medium text-muted-foreground">My documents</p> aka getByRole('paragraph').filter({ hasText: 'My documents' })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=My documents')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - link "Skip to main content" [ref=e3] [cursor=pointer]:
      - /url: "#main-content"
    - complementary [ref=e4]:
      - link "Smart EDMS" [ref=e6] [cursor=pointer]:
        - /url: /dashboard
      - navigation [ref=e13]:
        - generic [ref=e14]:
          - paragraph [ref=e15]: Workspace
          - generic [ref=e16]:
            - link "Dashboard" [ref=e17] [cursor=pointer]:
              - /url: /dashboard
            - link "Documents" [ref=e24] [cursor=pointer]:
              - /url: /documents
            - link "Folders" [ref=e29] [cursor=pointer]:
              - /url: /folders
            - link "Search" [ref=e33] [cursor=pointer]:
              - /url: /search
            - link "Workflows" [ref=e38] [cursor=pointer]:
              - /url: /workflows
        - generic [ref=e44]:
          - paragraph [ref=e45]: Governance
          - generic [ref=e46]:
            - link "Audit Log" [ref=e47] [cursor=pointer]:
              - /url: /audit
            - link "Legal Holds" [ref=e52] [cursor=pointer]:
              - /url: /admin/legal-holds
            - link "Retention" [ref=e58] [cursor=pointer]:
              - /url: /admin/retention
            - link "Dispositions" [ref=e63] [cursor=pointer]:
              - /url: /admin/dispositions
        - generic [ref=e69]:
          - paragraph [ref=e70]: Administration
          - generic [ref=e71]:
            - link "Security Posture" [ref=e72] [cursor=pointer]:
              - /url: /admin/security
            - link "Anomalies" [ref=e76] [cursor=pointer]:
              - /url: /admin/anomalies
            - link "Notification Routing" [ref=e80] [cursor=pointer]:
              - /url: /admin/notification-routing
            - link "Background Jobs" [ref=e85] [cursor=pointer]:
              - /url: /admin/jobs
            - link "Break-glass" [ref=e89] [cursor=pointer]:
              - /url: /admin/break-glass
            - link "Dual Control" [ref=e93] [cursor=pointer]:
              - /url: /admin/dual-control
            - link "Users" [ref=e98] [cursor=pointer]:
              - /url: /admin/users
            - link "Invitations" [ref=e105] [cursor=pointer]:
              - /url: /admin/invitations
            - link "Groups" [ref=e110] [cursor=pointer]:
              - /url: /admin/groups
            - link "Roles" [ref=e117] [cursor=pointer]:
              - /url: /admin/roles
            - link "Recertification" [ref=e122] [cursor=pointer]:
              - /url: /admin/recertification
            - link "Developer" [ref=e129] [cursor=pointer]:
              - /url: /admin/developer
            - link "Locales & Translations" [ref=e135] [cursor=pointer]:
              - /url: /admin/locales
            - link "Classifications" [ref=e140] [cursor=pointer]:
              - /url: /admin/classifications
            - link "Policies" [ref=e145] [cursor=pointer]:
              - /url: /admin/policies
            - link "Metadata Schemas" [ref=e150] [cursor=pointer]:
              - /url: /admin/metadata-schemas
            - link "Vocabularies" [ref=e156] [cursor=pointer]:
              - /url: /admin/vocabularies
            - link "API Keys" [ref=e160] [cursor=pointer]:
              - /url: /admin/api-keys
            - link "Service Accounts" [ref=e165] [cursor=pointer]:
              - /url: /admin/service-accounts
            - link "Webhooks" [ref=e170] [cursor=pointer]:
              - /url: /admin/webhooks
            - link "SSO Providers" [ref=e176] [cursor=pointer]:
              - /url: /admin/sso-providers
            - link "Devices" [ref=e181] [cursor=pointer]:
              - /url: /admin/devices
            - link "Tenants" [ref=e185] [cursor=pointer]:
              - /url: /admin/tenants
            - link "Tenant Settings" [ref=e191] [cursor=pointer]:
              - /url: /admin/tenant
            - link "Billing" [ref=e196] [cursor=pointer]:
              - /url: /admin/billing
        - generic [ref=e200]:
          - paragraph [ref=e201]: Account
          - generic [ref=e202]:
            - link "Settings" [ref=e203] [cursor=pointer]:
              - /url: /settings
            - link "Language & Locale" [ref=e208] [cursor=pointer]:
              - /url: /settings/locale
            - link "Sessions" [ref=e213] [cursor=pointer]:
              - /url: /settings/sessions
      - link "Security & privacy" [ref=e218] [cursor=pointer]:
        - /url: /settings
    - generic [ref=e222]:
      - banner [ref=e223]:
        - generic [ref=e224]:
          - button "Search… K" [ref=e226]:
            - generic [ref=e230]: Search…
            - generic [ref=e231]: K
          - generic [ref=e234]:
            - button "Change language" [ref=e235]
            - button "Switch to dark mode" [ref=e236]
            - button "Notifications" [ref=e237]
            - button "SM" [ref=e238]
      - generic [ref=e241]:
        - heading "Command Palette" [level=2] [ref=e242]
        - paragraph [ref=e243]: Search for a command to run...
      - main [ref=e244]:
        - generic [ref=e246]:
          - generic [ref=e247]:
            - generic [ref=e248]:
              - heading "Dashboard" [level=1] [ref=e249]
              - paragraph [ref=e250]: Document governance overview for your tenant
            - generic [ref=e251]:
              - link [ref=e252] [cursor=pointer]:
                - /url: /documents
                - button "My documents" [ref=e253]
              - link [ref=e254] [cursor=pointer]:
                - /url: /documents?action=upload
                - button "Upload" [ref=e255]
          - generic [ref=e256]:
            - generic [ref=e258]:
              - paragraph [ref=e261]: Total documents
              - text: "0"
            - generic [ref=e267]:
              - paragraph [ref=e270]: My documents
              - text: "0"
            - generic [ref=e277]:
              - paragraph [ref=e280]: Pending approvals
              - link "0" [ref=e286] [cursor=pointer]:
                - /url: /workflows?assignedToMe=true
            - generic [ref=e288]:
              - paragraph [ref=e291]: Active legal holds
              - link "0" [ref=e297] [cursor=pointer]:
                - /url: /admin/legal-holds
          - generic [ref=e298]:
            - generic [ref=e300]:
              - generic [ref=e301]:
                - generic [ref=e302]:
                  - generic [ref=e303]: Recent documents
                  - generic [ref=e304]: Documents recently updated in your tenant
                - link [ref=e305] [cursor=pointer]:
                  - /url: /documents
                  - button "View all" [ref=e306]
              - paragraph [ref=e308]:
                - text: No documents yet.
                - link "Upload your first document" [ref=e309] [cursor=pointer]:
                  - /url: /documents?action=upload
                - text: .
            - generic [ref=e310]:
              - generic [ref=e311]:
                - generic [ref=e312]: By classification
                - paragraph [ref=e318]: No data
              - generic [ref=e319]:
                - generic [ref=e320]: By state
                - paragraph [ref=e325]: No data
          - generic [ref=e326]:
            - generic [ref=e328]:
              - generic [ref=e329]:
                - generic [ref=e330]: My favorites
                - generic [ref=e333]: Documents you've starred
              - paragraph [ref=e335]: No favorites yet. Click the star icon on a document to add it.
            - generic [ref=e337]:
              - generic [ref=e338]:
                - generic [ref=e339]: Recently viewed
                - generic [ref=e344]: Your last 5 accessed documents
              - paragraph [ref=e346]: No recent views.
          - generic [ref=e348]:
            - generic [ref=e349]:
              - generic [ref=e350]: Recent activity
              - generic [ref=e353]: Latest tamper-evident audit events
            - generic [ref=e355]:
              - generic [ref=e357]:
                - generic [ref=e359]: auth.login
                - generic [ref=e360]:
                  - generic [ref=e361]: admin@smartedms.local
                  - text: admin@smartedms.local
                - generic [ref=e362]: less than a minute ago
              - generic [ref=e364]:
                - generic [ref=e366]: audit.verify
                - generic [ref=e367]: admin@smartedms.local
                - generic [ref=e369]: 4 minutes ago
              - generic [ref=e371]:
                - generic [ref=e373]: audit.verify.result
                - generic [ref=e374]: admin@smartedms.local
                - generic [ref=e376]: 4 minutes ago
              - generic [ref=e378]:
                - generic [ref=e380]: auth.login
                - generic [ref=e381]:
                  - generic [ref=e382]: admin@smartedms.local
                  - text: admin@smartedms.local
                - generic [ref=e383]: 11 minutes ago
              - generic [ref=e385]:
                - generic [ref=e387]: audit.verify
                - generic [ref=e388]: admin@smartedms.local
                - generic [ref=e390]: 12 minutes ago
              - generic [ref=e392]:
                - generic [ref=e394]: audit.verify.result
                - generic [ref=e395]: admin@smartedms.local
                - generic [ref=e397]: 12 minutes ago
              - generic [ref=e399]:
                - generic [ref=e401]: auth.login
                - generic [ref=e402]:
                  - generic [ref=e403]: admin@smartedms.local
                  - text: admin@smartedms.local
                - generic [ref=e404]: 13 minutes ago
              - generic [ref=e406]:
                - generic [ref=e408]: audit.verify
                - generic [ref=e409]: admin@smartedms.local
                - generic [ref=e411]: 13 minutes ago
              - generic [ref=e413]:
                - generic [ref=e415]: audit.verify.result
                - generic [ref=e416]: admin@smartedms.local
                - generic [ref=e418]: 13 minutes ago
              - generic [ref=e420]:
                - generic [ref=e422]: audit.verify
                - generic [ref=e423]: admin@smartedms.local
                - generic [ref=e425]: 44 minutes ago
  - region "Notifications (F8)":
    - list [ref=e427]:
      - listitem [ref=e428]:
        - generic [ref=e429]:
          - generic [ref=e430]: Signed in
          - generic [ref=e431]: Welcome to Smart EDMS
        - button [ref=e432]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e442] [cursor=pointer]
  - alert [ref=e446]
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
  20 |     await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
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
> 52 |     await expect(page.locator('text=My documents')).toBeVisible();
     |                                                     ^ Error: expect(locator).toBeVisible() failed
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