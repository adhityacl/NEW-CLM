# Testing & Tooling — React

## Linting & formatting

```bash
npm install --save-dev eslint eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y prettier eslint-config-prettier
```
```js
// eslint.config.js
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  {
    plugins: { react, "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules, // includes exhaustive-deps
      ...jsxA11y.configs.recommended.rules,
    },
  },
];
```
`eslint-plugin-react-hooks`'s `exhaustive-deps` rule is not optional — a suppressed dependency warning is very often a real stale-closure bug, not a false positive. `eslint-plugin-jsx-a11y` is the accessibility gate; keep it enabled and build-breaking in CI, same as every other stack in this collection.

```bash
npx eslint . && npx prettier --check .
```

## Unit & component testing

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```
Query by role/label the way a screen reader or keyboard user would — never by test-id or implementation detail (class names, internal state) as the first choice:

```tsx
// SignupForm.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignupForm } from "./SignupForm";

test("shows a validation error for an invalid email", async () => {
  render(<SignupForm onSubmit={vi.fn()} />);

  await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
  await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
});

test("calls onSubmit with the entered email when valid", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<SignupForm onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText(/email/i), "user@example.com");
  await userEvent.click(screen.getByRole("button", { name: /sign up/i }));

  expect(onSubmit).toHaveBeenCalledWith("user@example.com");
});
```
`getByTestId` is a last resort for elements with no accessible role/label/text — reaching for it first is a signal the markup itself may need better semantics.

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
Run `@axe-core/playwright` against at least every critical-path flow so accessibility regressions are caught the same way functional ones are.

## Performance testing — against a real production build

Vite's dev server serves unminified, unbundled modules over native ESM — fast for local iteration, not representative of what ships. **Always** measure performance against a production build.

```bash
npm run build
npm run preview   # vite preview — serves the dist/ build locally
```
(For CRA: `npm run build && npx serve -s build`.)

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
      - run: npx vitest run
      - run: npx playwright install --with-deps && npx playwright test
      - run: npx lhci autorun
```

## web-vitals in production

There's no framework hook wiring this up automatically — install and call the `web-vitals` package yourself, once, near the app's entry point:

```bash
npm install web-vitals
```
```ts
// src/reportWebVitals.ts
import { onCLS, onINP, onLCP } from "web-vitals";

export function reportWebVitals() {
  onCLS((metric) => navigator.sendBeacon("/api/analytics", JSON.stringify(metric)));
  onINP((metric) => navigator.sendBeacon("/api/analytics", JSON.stringify(metric)));
  onLCP((metric) => navigator.sendBeacon("/api/analytics", JSON.stringify(metric)));
}
```
```tsx
// src/main.tsx
import { reportWebVitals } from "./reportWebVitals";
reportWebVitals();
```
