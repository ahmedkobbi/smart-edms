# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.ts >> Accessibility (WCAG 2.2 AA) >> login page has no critical violations
- Location: tests/e2e/accessibility.spec.ts:21:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 95

- Array []
+ Array [
+   Object {
+     "description": "Ensure buttons have discernible text",
+     "help": "Buttons must have discernible text",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/button-name?application=playwright",
+     "id": "button-name",
+     "impact": "critical",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": null,
+             "id": "button-has-visible-text",
+             "impact": "critical",
+             "message": "Element does not have inner text that is visible to screen readers",
+             "relatedNodes": Array [],
+           },
+           Object {
+             "data": null,
+             "id": "aria-label",
+             "impact": "critical",
+             "message": "aria-label attribute does not exist or is empty",
+             "relatedNodes": Array [],
+           },
+           Object {
+             "data": null,
+             "id": "aria-labelledby",
+             "impact": "critical",
+             "message": "aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty",
+             "relatedNodes": Array [],
+           },
+           Object {
+             "data": Object {
+               "messageKey": "noAttr",
+             },
+             "id": "non-empty-title",
+             "impact": "critical",
+             "message": "Element has no title attribute",
+             "relatedNodes": Array [],
+           },
+           Object {
+             "data": null,
+             "id": "implicit-label",
+             "impact": "critical",
+             "message": "Element does not have an implicit (wrapped) <label>",
+             "relatedNodes": Array [],
+           },
+           Object {
+             "data": null,
+             "id": "explicit-label",
+             "impact": "critical",
+             "message": "Element does not have an explicit <label>",
+             "relatedNodes": Array [],
+           },
+           Object {
+             "data": null,
+             "id": "presentational-role",
+             "impact": "critical",
+             "message": "Element's default semantics were not overridden with role=\"none\" or role=\"presentation\"",
+             "relatedNodes": Array [],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element does not have inner text that is visible to screen readers
+   aria-label attribute does not exist or is empty
+   aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty
+   Element has no title attribute
+   Element does not have an implicit (wrapped) <label>
+   Element does not have an explicit <label>
+   Element's default semantics were not overridden with role=\"none\" or role=\"presentation\"",
+         "html": "<button type=\"button\" class=\"absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors\">",
+         "impact": "critical",
+         "none": Array [],
+         "target": Array [
+           ".end-3",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.name-role-value",
+       "wcag2a",
+       "wcag412",
+       "section508",
+       "section508.22.a",
+       "TTv5",
+       "TT6.a",
+       "EN-301-549",
+       "EN-9.4.1.2",
+       "ACT",
+       "RGAAv4",
+       "RGAA-11.9.1",
+     ],
+   },
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - heading "Smart EDMS" [level=1] [ref=e10]
      - paragraph [ref=e11]: common.tagline
    - generic [ref=e12]:
      - generic [ref=e13]:
        - heading "auth.signIn" [level=2] [ref=e14]
        - paragraph [ref=e15]: auth.welcomeBack
      - generic [ref=e16]:
        - generic [ref=e17]:
          - generic [ref=e18]: auth.email
          - textbox "auth.email" [ref=e23]:
            - /placeholder: you@company.com
        - generic [ref=e24]:
          - generic [ref=e25]: auth.password
          - generic [ref=e26]:
            - textbox "auth.password" [ref=e30]:
              - /placeholder: ••••••••••
            - button [ref=e31]
        - button "auth.signIn" [ref=e36]
        - link "auth.forgotPassword" [ref=e38] [cursor=pointer]:
          - /url: /forgot-password
        - generic [ref=e39]: or
        - button "auth.signInWithPasskey" [ref=e45]
    - paragraph [ref=e46]: common.tagline
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e52] [cursor=pointer]
  - alert [ref=e56]
```

# Test source

```ts
  1  | /**
  2  |  * Smart EDMS — Accessibility tests (axe-core + Playwright)
  3  |  *
  4  |  * Runs axe-core accessibility audits against key pages in both LTR (English)
  5  |  * and RTL (Arabic) modes. Verifies WCAG 2.2 AA compliance for:
  6  |  *   - Login page
  7  |  *   - Dashboard (authenticated)
  8  |  *   - Document library
  9  |  *   - Settings page
  10 |  *   - Admin console
  11 |  *
  12 |  * Run: npx playwright test tests/e2e/accessibility.spec.ts
  13 |  */
  14 | 
  15 | import { test, expect } from '@playwright/test';
  16 | import AxeBuilder from '@axe-core/playwright';
  17 | 
  18 | const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  19 | 
  20 | test.describe('Accessibility (WCAG 2.2 AA)', () => {
  21 |   test('login page has no critical violations', async ({ page }) => {
  22 |     await page.goto(`${BASE_URL}/login`);
  23 |     const accessibilityScanResults = await new AxeBuilder({ page })
  24 |       .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
  25 |       .analyze();
> 26 |     expect(accessibilityScanResults.violations.filter(v => v.impact === 'critical')).toEqual([]);
     |                                                                                      ^ Error: expect(received).toEqual(expected) // deep equality
  27 |   });
  28 | 
  29 |   test('login page (Arabic RTL) has no critical violations', async ({ page }) => {
  30 |     await page.goto(`${BASE_URL}/ar/login`);
  31 |     const accessibilityScanResults = await new AxeBuilder({ page })
  32 |       .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
  33 |       .analyze();
  34 |     expect(accessibilityScanResults.violations.filter(v => v.impact === 'critical')).toEqual([]);
  35 |   });
  36 | 
  37 |   test('dashboard has no critical violations', async ({ page }) => {
  38 |     // This test requires authentication — skip if not logged in
  39 |     test.skip();
  40 |     await page.goto(`${BASE_URL}/dashboard`);
  41 |     const accessibilityScanResults = await new AxeBuilder({ page })
  42 |       .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
  43 |       .analyze();
  44 |     expect(accessibilityScanResults.violations.filter(v => v.impact === 'critical')).toEqual([]);
  45 |   });
  46 | 
  47 |   test('document library has no critical violations', async ({ page }) => {
  48 |     test.skip();
  49 |     await page.goto(`${BASE_URL}/documents`);
  50 |     const accessibilityScanResults = await new AxeBuilder({ page })
  51 |       .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
  52 |       .analyze();
  53 |     expect(accessibilityScanResults.violations.filter(v => v.impact === 'critical')).toEqual([]);
  54 |   });
  55 | 
  56 |   test('settings page has no critical violations', async ({ page }) => {
  57 |     test.skip();
  58 |     await page.goto(`${BASE_URL}/settings`);
  59 |     const accessibilityScanResults = await new AxeBuilder({ page })
  60 |       .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
  61 |       .analyze();
  62 |     expect(accessibilityScanResults.violations.filter(v => v.impact === 'critical')).toEqual([]);
  63 |   });
  64 | });
  65 | 
```