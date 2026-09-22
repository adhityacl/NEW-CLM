# Frontend Contributor Rules — React

Applies to every change under `src/components/`, `src/features/`, `src/hooks/`, `src/lib/`, and related directories in this React (Vite/CRA, non-Next.js) project. Self-contained — includes the framework-agnostic baseline plus React-specific practice.

## 1. Component model

- Function components + hooks only. No new class components.
- Code-split routes and heavy, non-critical components with `React.lazy` + `<Suspense>`.
- Reach for `useMemo`/`useCallback`/`React.memo` only for measured-expensive work or to stabilize props into a memoized child — not reflexively on every value/function. Never wrap something you haven't profiled as a problem.
- Never pass a new object/array/function literal as a prop to a `React.memo`-wrapped child — hoist it to module scope or wrap it in `useMemo`/`useCallback` first, or the memoization does nothing.
- Compute derived state during render; don't duplicate it into `useState` synced via `useEffect`.

## 2. Accessibility (WCAG 2.1 AA)

- Real semantic HTML inside JSX (`<button>`, `<nav>`, `<main>`, real `<label htmlFor>` + `<input>`) — no `<div onClick>`.
- Use `useId()` to generate stable, unique label/`aria-describedby` associations in reusable components — never a hardcoded `id` string.
- Every `<img>` has descriptive, context-specific `alt` text, or `alt=""` if decorative, plus explicit `width`/`height`.
- On client-side route change, move focus to the new view's heading/main landmark via a `ref`; mark the active nav link with `aria-current="page"`.
- Custom modals/comboboxes/dropdowns: prefer a maintained headless primitive (Radix UI, React Aria) over hand-rolling focus trapping. If hand-rolled, implement `role="dialog"` + `aria-modal` + focus trap + `Escape`-to-close + focus restore in full.
- Forms: validate on submit, surface errors via `aria-invalid`/`aria-describedby`/`role="alert"`, show a busy state (`aria-busy`) while pending.
- Keep `eslint-plugin-jsx-a11y` enabled and build-breaking in CI.
- Color contrast ≥ 4.5:1 body / ≥ 3:1 large text; never convey state by color alone; respect `prefers-reduced-motion`; text sizing in `rem`/`em`.

## 3. Core Web Vitals (target: LCP < 2.5s · CLS < 0.1 · INP < 200ms, per https://pagespeed.web.dev/)

- Every image has explicit `width`/`height` (or `aspect-ratio`), a correctly sized `srcset`/`sizes`, and `loading="lazy"` unless it's the LCP image — there's no framework image component doing this automatically.
- Preload the actual LCP image/font explicitly (`<link rel="preload">`); never lazy-load it.
- Virtualize any list that can grow past a few hundred rows (`react-window`/`@tanstack/react-virtual`).
- Debounce/throttle high-frequency handlers (search input, scroll, resize); scope state as locally as possible to limit re-render blast radius.
- Measure against a real production build (`vite build && vite preview`, never the dev server); check the Vite/Rollup bundle output (`rollup-plugin-visualizer`) when a dependency looks heavy.
- Use React DevTools Profiler to diagnose re-render/INP problems before reaching for a memoization fix.

## 4. Component & file conventions

- Folder structure: `src/components/ui/` (shared, feature-agnostic), `src/features/<feature>/` (feature-scoped), `src/hooks/`, `src/lib/`, `src/App.tsx`. Features import from shared layers, never the reverse.
- Component files: `PascalCase.tsx`, matching the exported component name — the one intentional exception to the general camelCase-file rule. Custom hooks and utilities: `camelCase.ts`.
- Custom hooks are prefixed `use`, cover exactly one concern, and return a small, predictable shape (tuple or plain object).
- `strict: true` TypeScript, no `any`; every component has an explicit, named prop interface; status-like state uses a discriminated union, not a pile of optional booleans.
- DRY: markup/logic/values repeated 3+ times get extracted to a shared component, hook, or design token — not copy-pasted.

## 5. State management

- Default to local `useState`/`useReducer`. Lift state only as far as the nearest common consumer requires.
- Context is for infrequently-changing, genuinely global state (theme, auth, locale) — never for high-frequency values (live input text) as the context value, since every consumer re-renders on every change.
- Reach for an external store (Zustand, Redux, Jotai) only when state is both widely shared *and* updates frequently enough that Context's re-render-everything model becomes a real, measured cost.
- Avoid prop drilling past two or three levels — use Context or a store instead once it's a pattern, not a one-off.

## 6. UX consistency

- Every async view (fetch, mutation) implements loading, empty, and error states — reflected as an explicit status, not inferred from combinations of booleans.
- Mobile-first CSS, ≥ 44×44px touch targets, immediate (~100ms) feedback on every interactive action.

## 7. Tooling & CI (build-breaking gates)

- ESLint (`eslint-plugin-react`, `eslint-plugin-react-hooks` with `exhaustive-deps`, `eslint-plugin-jsx-a11y`) and Prettier on every commit/CI run.
- Vitest + React Testing Library for units/components (query by role/label, not test-ids or implementation detail); Playwright + `@axe-core/playwright` for e2e and accessibility on critical paths.
- Lighthouse CI against a real `vite build && vite preview` (or CRA equivalent), with LCP/CLS/performance-score budgets as `error`-level assertions.
- `web-vitals` package wired to analytics at the app's entry point for real-user field data.
- `README.md` updated in the same PR whenever setup, env vars, scripts, or folder conventions change.

## 8. Before opening a PR

- [ ] Every new `useMemo`/`useCallback`/`React.memo` is justified by a profiled problem, not added reflexively.
- [ ] Keyboard-only walkthrough of the changed flow; zero new `jsx-a11y`/axe violations.
- [ ] New images have explicit dimensions, descriptive `alt`, and correct `loading`/`srcset` treatment.
- [ ] Loading/empty/error states cover new async UI, represented as an explicit status.
- [ ] No hardcoded design value duplicating an existing token; no logic duplicated 3+ times.
- [ ] Production build bundle size checked for unexpected growth; PageSpeed checked if images/fonts/data-fetching changed.
- [ ] README updated if setup/config/scripts changed.
