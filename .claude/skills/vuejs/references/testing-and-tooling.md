# Testing & Tooling — Vue.js

## Linting & formatting

```bash
npm install --save-dev eslint eslint-plugin-vue eslint-plugin-vuejs-accessibility prettier eslint-config-prettier
```
```js
// eslint.config.js
import pluginVue from "eslint-plugin-vue";
import vueA11y from "eslint-plugin-vuejs-accessibility";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  ...pluginVue.configs["flat/recommended"],
  ...vueA11y.configs["flat/recommended"],
  eslintConfigPrettier,
];
```
`eslint-plugin-vue` catches template correctness issues (unused components, `v-for` without `:key`, unresolved component references); `eslint-plugin-vuejs-accessibility` is the accessibility layer — keep both enabled and treat violations as build-breaking in CI, same as the rest of this collection's stacks.

```bash
npx eslint . --ext .vue,.ts,.js
npx prettier --check .
```

## Unit & component testing

```bash
npm install --save-dev vitest @testing-library/vue @testing-library/jest-dom jsdom
```
Test components for behavior and accessibility, not implementation detail — query by role/label the way a screen reader or keyboard user would, exactly like the React/Next.js equivalent:
```ts
// SignupForm.spec.ts
import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import SignupForm from "./SignupForm.vue";

test("shows a validation error for an invalid email", async () => {
  render(SignupForm);
  await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
  await userEvent.click(screen.getByRole("button", { name: /sign up/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
});
```
```ts
// vite.config.ts
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: { environment: "jsdom", globals: true },
});
```

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
Add the `@axe-core/playwright` check to at least the app's critical-path e2e tests so accessibility regressions are caught the same way functional ones are — see `core-standards` for the general pattern.

## Performance testing — against a real production build

Vite's dev server (`vite dev`) skips minification, tree-shaking, and other production optimizations — **always** measure performance against a built, previewed bundle, never the dev server.

```bash
vite build && vite preview
```

```js
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run build && npm run preview -- --port 4173",
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
      - run: npx eslint . --ext .vue,.ts,.js
      - run: npx vitest run
      - run: npx playwright install --with-deps && npx playwright test
      - run: npx lhci autorun
```

## web-vitals in production

Wire real-user monitoring via the `web-vitals` package, sending each metric to your analytics endpoint from `main.ts`:
```ts
// main.ts
import { onLCP, onCLS, onINP } from "web-vitals";

function sendToAnalytics(metric: { name: string; value: number }) {
  navigator.sendBeacon("/api/analytics", JSON.stringify(metric));
}

onLCP(sendToAnalytics);
onCLS(sendToAnalytics);
onINP(sendToAnalytics);
```
This is field data (real users, real devices, real networks) — track it alongside Lighthouse CI's lab data; the two catch different classes of regression.
