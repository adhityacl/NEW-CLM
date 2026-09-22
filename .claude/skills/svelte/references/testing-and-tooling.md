# Testing & Tooling — Svelte

## Linting & formatting

```bash
npm install --save-dev eslint eslint-plugin-svelte prettier prettier-plugin-svelte
```
`eslint.config.js`:
```js
import svelte from "eslint-plugin-svelte";

export default [
  ...svelte.configs["flat/recommended"],
  {
    rules: {
      // project-specific overrides
    },
  },
];
```
`eslint-plugin-svelte`'s recommended config includes accessibility-related rules on top of Svelte-specific correctness rules (unused reactive declarations, invalid directive usage) — keep it enabled and treat violations as build-breaking in CI, same as any other lint gate.

```bash
npx eslint .
npx prettier --check .
```

## `svelte-check` — type checking + compiler a11y warnings

```bash
npm install --save-dev svelte-check typescript
npx svelte-check --tsconfig ./tsconfig.json
```
This is the CI-runnable form of the warnings you'd otherwise only see in the `vite dev` terminal — including every `a11y_*` compiler warning (see `references/accessibility.md`). Run it as its own required CI step; a passing `eslint` run does not imply `svelte-check` also passed, they check different things.

## Unit & component testing

```bash
npm install --save-dev vitest @testing-library/svelte @testing-library/jest-dom jsdom
```
Test components for behavior and accessibility, not implementation detail — query by role/label the way a screen reader or keyboard user would:
```ts
// SignupForm.test.ts
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import SignupForm from "./SignupForm.svelte";

test("shows a validation error for an invalid email", async () => {
  render(SignupForm);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/email/i), "not-an-email");
  await user.click(screen.getByRole("button", { name: /sign up/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
});
```
`vite.config.ts` needs the `svelte` plugin and `environment: "jsdom"` (or the `browser` test runner) configured for `@testing-library/svelte` to render components correctly — see the Testing Library Svelte docs for the exact Vitest setup for the Svelte version in use.

## End-to-end testing

```bash
npm install --save-dev @playwright/test @axe-core/playwright
npx playwright install
```
```ts
// e2e/checkout.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("user can complete checkout", async ({ page }) => {
  await page.goto("/cart");
  await page.getByRole("button", { name: /checkout/i }).click();
  await expect(page.getByRole("heading", { name: /order confirmed/i })).toBeVisible();
});

test("checkout page has no automatic accessibility violations", async ({ page }) => {
  await page.goto("/checkout");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```
Run `@axe-core/playwright` against at least every critical-path e2e test so accessibility regressions are caught the same way functional ones are.

## Performance testing — against a real production build

SvelteKit's dev server (`vite dev`) skips production bundling/minification — **always** measure performance against a built, previewed (or adapter-deployed) app, never the dev server.

```bash
npm run build   # vite build (via SvelteKit's `svelte-kit sync && vite build`)
npm run preview # vite preview
```

```js
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run build && npm run preview",
      url: ["http://localhost:4173/", "http://localhost:4173/dashboard"],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
      },
    },
  },
};
```

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx eslint .
      - run: npx svelte-check --tsconfig ./tsconfig.json
      - run: npx vitest run
      - run: npx playwright install --with-deps && npx playwright test
      - run: npx lhci autorun
```

## web-vitals in production

Wire real-user monitoring in the root layout, sending each metric to your analytics endpoint:
```svelte
<!-- +layout.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { onCLS, onINP, onLCP } from "web-vitals";

  onMount(() => {
    const report = (metric: { name: string; value: number }) =>
      navigator.sendBeacon("/api/analytics", JSON.stringify(metric));
    onCLS(report);
    onINP(report);
    onLCP(report);
  });
</script>
```
