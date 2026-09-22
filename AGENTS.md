<!-- frontend-standard-skills:react START — do not edit between these markers, regenerate with `npx frontend-standard-skills add react` -->

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

<!-- frontend-standard-skills:react END -->

<!-- frontend-standard-skills:vuejs START — do not edit between these markers, regenerate with `npx frontend-standard-skills add vuejs` -->

# Frontend Contributor Rules — Vue.js

Applies to every change under `src/components`, `src/composables`, `src/views`, `src/stores`, `src/router`, and related directories in this Vue 3 (Composition API, Vite SPA) project. Self-contained — includes the framework-agnostic baseline plus Vue-specific practice.

## 1. Component model

- **`<script setup lang="ts">` for every new SFC.** No Options API, no runtime-only `defineProps`/`defineEmits` in new code.
- `ref` for primitives and anything that may be reassigned or destructured; `reactive` only for a cohesive object you'll never reassign whole. `shallowRef`/`shallowReactive` for large data (API result sets, chart data) that doesn't need deep reactivity.
- `computed` instead of a manually-synced `ref` + `watch` for any derived value.
- Never mutate a prop directly — emit an event and let the parent own the update.
- Route-level components are lazy: `{ path: "/x", component: () => import("../views/XView.vue") }` — never a static top-level import for a route.

## 2. Accessibility (WCAG 2.1 AA)

- Real semantic HTML inside templates (`<button>`, `<nav>`, `<main>`, real `<label for>` + `<input>`) — no `<div @click>`.
- Every `<img>` has descriptive, context-specific `alt`, or `alt=""` if decorative, plus explicit `width`/`height`.
- Move focus via template refs (`ref="..."`, `await nextTick()` before touching a freshly `v-if`'d ref) on dialog open/close and route change; restore focus to the trigger on close.
- Bind `:aria-*`/`:class` reactively to the same state driving the visual change — never toggle ARIA attributes imperatively via `document.querySelector`.
- Custom modals implement `role="dialog"` + `aria-modal` + focus trap + `Escape`-to-close + focus restore — prefer a maintained headless primitive (Radix Vue, Headless UI for Vue) over hand-rolling.
- `v-html` only for sanitized (e.g. `DOMPurify`) content; never for interactive markup (buttons/links) — render real components instead.
- Keep `eslint-plugin-vuejs-accessibility` enabled and build-breaking in CI.
- Color contrast ≥ 4.5:1 body / ≥ 3:1 large text; never convey state by color alone; respect `prefers-reduced-motion`; text sizing in `rem`/`em`.

## 3. Core Web Vitals (target: LCP < 2.5s · CLS < 0.1 · INP < 200ms, per https://pagespeed.web.dev/)

- No built-in image component — every `<img>` gets explicit `width`/`height`, modern format, correct sizing, and `loading="lazy"` unless it's the LCP image (never lazy-load the LCP image; use `fetchpriority="high"` and preload if known at build time).
- `defineAsyncComponent` + `<Suspense>` for heavy, non-critical components (editors, charts, large modals) so their JS isn't in the initial bundle.
- `v-memo` for expensive `v-for` list items, only after Vue DevTools profiling shows a real re-render cost — not by default.
- Scope `ref`/`reactive` state as locally as possible; debounce high-frequency handlers; avoid deep reactivity on large, rarely-mutated data via `shallowRef`/`shallowReactive`.
- Measure against `vite build && vite preview`, never `vite dev`. Use `rollup-plugin-visualizer` when a dependency looks heavy; use Vue DevTools to confirm a re-render fix actually helped.

## 4. Component & file conventions

- Folder structure: `src/components/ui` (shared), `src/components/<feature>` (feature-scoped), `src/composables`, `src/views` (routed components), `src/stores` (Pinia), `src/router`.
- Component files: `PascalCase.vue`. Composables: `useX.ts` camelCase, one concern per composable. Everything else: `camelCase.ts`.
- `defineProps<T>()`/`defineEmits<T>()` with a generic type — no runtime-only prop declarations, no `any`. `withDefaults` for default prop values.
- Pinia (setup-style store) for state crossing 3+ component levels or living outside one component tree — one store per domain, not a single monolith store.
- DRY: markup/logic/values repeated 3+ times get extracted to a shared component, composable, or design token — not copy-pasted.
- Avoid deeply nested `v-if`/`v-else-if` chains — use a `computed` view-state or extracted subcomponents instead.

## 5. UX consistency

- Every view with async data implements loading, empty, and error states — loading skeletons approximate the loaded layout's dimensions (no CLS on swap-in).
- Mobile-first CSS, ≥ 44×44px touch targets, immediate (~100ms) feedback on every interactive action.

## 6. Tooling & CI (build-breaking gates)

- `eslint-plugin-vue` + `eslint-plugin-vuejs-accessibility` + Prettier on every commit/CI run.
- Vitest + `@testing-library/vue` for units/components (query by role/label, not implementation detail); Playwright (+ `@axe-core/playwright`) for e2e and accessibility on critical paths.
- Lighthouse CI against a real `vite build && vite preview`, with LCP/CLS/performance-score budgets as `error`-level assertions.
- `web-vitals` (`onLCP`/`onCLS`/`onINP`) wired to analytics for real-user field data.
- `README.md` updated in the same PR whenever setup, env vars, scripts, or folder conventions change.

## 7. Before opening a PR

- [ ] Every new component uses `<script setup lang="ts">`; no `any` in props/emits.
- [ ] Keyboard-only walkthrough of the changed flow; zero new `vuejs-accessibility`/axe violations.
- [ ] New images have explicit dimensions and descriptive `alt`; LCP image is never lazy-loaded.
- [ ] Loading/empty/error states cover new async UI.
- [ ] No hardcoded design value duplicating an existing token; no logic duplicated 3+ times.
- [ ] Vite bundle checked for unexpected growth if a new dependency was added; PageSpeed checked if images/fonts/data-fetching changed.
- [ ] README updated if setup/config/scripts changed.

<!-- frontend-standard-skills:vuejs END -->

<!-- frontend-standard-skills:svelte START — do not edit between these markers, regenerate with `npx frontend-standard-skills add svelte` -->

# Frontend Contributor Rules — Svelte

Applies to every change under `src/routes/`, `src/lib/`, and related directories in this Svelte 5 / SvelteKit project. Self-contained — includes the framework-agnostic baseline plus Svelte-specific practice.

## 1. Reactivity model (Svelte 5 runes)

- **`$state`** for local reactive state; **`$derived`** for any value computed from other reactive state — never a manually-synced `$state` kept in sync via `$effect`. If it can be computed, compute it.
- **`$props()`** with an explicit `interface`/`type` for every component's props — the Svelte 5 replacement for `export let`. Destructure defaults inline (`let { variant = "primary" }: Props = $props();`), don't reassign props after destructuring.
- **Snippets** (`{#snippet}` / `{@render}`) for passing renderable content into a component — the Svelte 5 replacement for slots. Name snippets for what they render (`header`, `row`), not generically (`slot1`).
- **`$effect`** is for side effects only (DOM measurement, subscriptions, syncing to `localStorage`/an external store) — never for computing a value another piece of state could derive. Keep the values an effect reads as narrow as possible so it doesn't rerun for unrelated changes.
- Prefer reassignment (`items = [...items, next]`) over relying on in-place array/object mutation to trigger updates — it's the safer default to reason about even where Svelte 5's proxies would track the mutation.
- Use `$bindable()` only for props that genuinely need two-way binding (a form control wrapper) — default props to one-way (parent → child) and pass an explicit callback prop for child → parent communication otherwise, so data flow stays easy to trace.
- If the project is still on Svelte 4 (`export let`, `$:` reactive statements, stores-first), note that explicitly here — prop/reactivity syntax and idioms differ from the runes conventions above and this section shouldn't be applied as-is.
- Fetch data in `+page.ts`/`+page.server.ts` load functions, close to where it's used — avoid client-side `onMount`/`$effect` fetch waterfalls for data known at request time. Be deliberate about what runs on the server (`+page.server.ts`) vs. universally (`+page.ts`); secrets and privileged data access only ever belong in the server-only file.

## 2. Accessibility (WCAG 2.1 AA)

- Real semantic HTML in templates (`<button>`, `<nav>`, `<main>`, real `<label for>` + `<input>`) — no `<div onclick>`.
- **Every Svelte compiler `a11y_*` warning is build-breaking.** Never suppress with `<!-- svelte-ignore -->` without a specific, documented reason — fix the underlying markup.
- `svelte-check` runs in CI and fails the build on new warnings, type errors, or a11y issues.
- Icon-only buttons have `aria-label`; decorative icons/images have `aria-hidden="true"`/`alt=""`.
- Move focus to `<main>`/the page heading on client-side route changes (SvelteKit's router doesn't reload the page). Mark the active nav link with `aria-current="page"`.
- Custom modals implement `role="dialog"` + `aria-modal` + focus management (`bind:this` for programmatic focus) + `Escape`-to-close + focus restore — prefer a maintained headless primitive (Melt UI, Bits UI) over hand-rolling a focus trap.
- Form fields have real associated `<label>`s; errors use `aria-invalid`/`aria-describedby`/`role="alert"`, validated server-side in `+page.server.ts` actions too — never trust client-only validation.
- Color contrast ≥ 4.5:1 body / ≥ 3:1 large text; never convey state by color alone; respect `prefers-reduced-motion`; text sizing in `rem`/`em`.
- Dynamic content updates (toasts, filtered result counts, save confirmations) are announced via `aria-live="polite"` (or `role="alert"` for urgent/error cases) — a silent DOM update is invisible to a screen-reader user.
- Every route sets a specific, descriptive `<title>` via `<svelte:head>` (or a shared layout helper) — screen-reader users rely on the title to confirm a navigation succeeded. Set `lang` on the root `<html>` (in `src/app.html`).
- `loading`/pending states for slow data (`{#await}` blocks, streamed promises from a load function) get an `aria-live="polite"` region or accessible name — an unannounced spinner is invisible to a screen-reader user, same as a silent error boundary.
- Custom widgets (dropdowns, comboboxes, tabs) follow the keyboard interaction pattern from the [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) for that widget type — don't invent a bespoke keyboard scheme.

## 3. Core Web Vitals (target: LCP < 2.5s · CLS < 0.1 · INP < 200ms · Lighthouse Performance ≥ 90 mobile, per https://pagespeed.web.dev/)

- `<enhanced:img>` (`@sveltejs/enhanced-img`) for locally-imported images — automatic `srcset`, modern formats, and CLS-safe intrinsic dimensions. Explicit `width`/`height` always for any image not using it.
- `export const prerender = true` for static routes — the biggest available TTFB/LCP win. Reserve full SSR for genuinely per-request/dynamic content; use `csr = false` for zero-interactivity pages.
- `data-sveltekit-preload-data` on links for near-instant navigations.
- Prefer `$derived` over `$effect` to avoid redundant re-computation; scope `$effect` dependencies tightly; debounce high-frequency triggers (search-as-you-type, scroll/resize-driven state).
- Code-split heavy, non-critical components with dynamic `import()`.
- Measure against `vite build && vite preview` (or the deployed adapter output), never `vite dev`. Watch bundle size per route; use `rollup-plugin-visualizer` when a dependency looks heavy.
- Pick the deployment adapter deliberately (`adapter-static` for fully prerenderable sites, `adapter-node`/`adapter-vercel` for SSR) — a static adapter removes server compute from the request path entirely for content that doesn't need it.
- Reserve space for any dynamically loaded, non-image content (ads, embeds, banners injected client-side) with a sized container, same as the image rule above.
- Third-party scripts load `async`/`defer` (or are injected only after the interaction that needs them) and are audited periodically — they're a leading contributor to poor LCP/INP in production apps.
- Svelte's compile-away reactivity ships less baseline JS than virtual-DOM frameworks by default — real, but not a substitute for the above; a heavy dependency or a thrashing `$effect` still costs the user regardless of the framework underneath it.

## 4. Component & file conventions

- SvelteKit structure: `src/routes/<segment>/+page.svelte`, `+layout.svelte`, `+page.ts`/`+page.server.ts`, `+error.svelte`, `+server.ts` — these are fixed framework file names, not stylistic choices.
- Route segment folders: `kebab-case`. Component files: `PascalCase.svelte`. Everything else (`lib/utils/`, non-component `.ts`): `camelCase.ts`.
- Shared code imported via the `$lib` alias (`$lib/components/ui/...`), never long relative paths.
- Shared, feature-agnostic components live in `lib/components/ui/`; feature-only components live beside the feature/route. Shared components never import feature-specific code.
- `strict: true` TypeScript, no `any`; explicit `Props` interfaces, exported when other files need to reference them; load-function types imported from generated `./$types` rather than hand-duplicated.
- Form action inputs validated (e.g. Zod) inside `+page.server.ts`, never trusted implicitly from raw `FormData`.
- DRY: markup/logic/values repeated 3+ times get extracted to a shared component, utility, or design token — not copy-pasted.
- A component file over roughly 200-300 lines (excluding styles/types), or one doing more than one cohesive thing, is a signal to split it into named, clearly-scoped pieces.
- Organize `lib/` by feature/domain once the project grows past a handful of components — avoid a flat `lib/components/` directory with dozens of ungrouped files.

## 5. Anti-patterns to flag in review

- Global stores (`writable` in `$lib/stores`) used for state that's only read/written by one component tree — that belongs in local `$state`. A store is for genuinely shared, cross-component state.
- Deeply nested `{#if}`/`{:else if}` chains (more than two or three branches) instead of a component extracted per branch.
- `onMount`/`$effect` fetching data a `+page.ts`/`+page.server.ts` load function could fetch instead (causes a client-visible waterfall and worse LCP than data resolved during SSR/load).
- Suppressing an `a11y_*` compiler warning with `<!-- svelte-ignore -->` instead of fixing the markup, without a specific documented reason.
- Marking an entire component/route as needing heavy client-side interactivity when only a small leaf actually needs it — keep interactive surface area (and its associated hydration cost) as small as possible.
- Hand-rolling a modal/dialog/combobox focus trap when a maintained headless primitive (Melt UI, Bits UI) is available and would be more robust.

## 6. UX consistency

- Loading UI (skeletons, `{#await}` pending branches) approximates the loaded content's dimensions — no CLS on swap-in. Every async view has loading, empty, and error states; "nothing happens" is never acceptable.
- The same action looks and behaves the same way everywhere (primary/destructive button semantics, confirmation patterns) — enforced via the shared `lib/components/ui/` layer, not re-implemented per feature.
- Mobile-first CSS, ≥ 44×44px touch targets, immediate (~100ms) feedback on every interactive action.
- Use a shared spacing/type scale via design tokens (CSS custom properties or a theme module) — no arbitrary one-off pixel values in component styles.
- Empty states are explicit and actionable (e.g. "No results — try a different filter"), not a blank container that looks broken.

## 7. Tooling & CI (build-breaking gates)

- `eslint` (with `eslint-plugin-svelte`'s recommended config) and Prettier on every commit/CI run.
- `svelte-check` as its own required CI step (type errors + compiler a11y warnings) — passing ESLint does not imply this passed.
- Vitest + `@testing-library/svelte` for units/components (query by role/label, not implementation detail); Playwright (+ `@axe-core/playwright`) for e2e and accessibility on critical paths.
- Lighthouse CI against a real `vite build && vite preview`, with LCP/CLS/performance-score budgets as `error`-level assertions.
- `web-vitals` wired in the root `+layout.svelte` to analytics for real-user field data.
- `README.md` updated in the same PR whenever setup, env vars, scripts, or folder conventions change.

## 8. Before opening a PR

- [ ] No new `a11y_*` compiler warnings; `svelte-check` passes clean.
- [ ] Keyboard-only walkthrough of the changed flow; zero new axe violations.
- [ ] New images use `<enhanced:img>` or have explicit dimensions and descriptive `alt`.
- [ ] Any new `$effect` is a genuine side effect, not a value that should be `$derived`.
- [ ] Loading/empty/error states cover new async UI.
- [ ] No hardcoded design value duplicating an existing token; no logic duplicated 3+ times.
- [ ] Bundle size checked for unexpected growth; PageSpeed checked if images/routing/data-fetching changed.
- [ ] No new global store introduced for state that's actually local to one component tree.
- [ ] Every new/changed route has a specific `<title>` and, if async, an accessible loading state.
- [ ] Form action inputs are validated server-side, not just via `bind:value` client checks.
- [ ] README updated if setup/config/scripts changed.

## 9. Escalation

If a rule above conflicts with a specific, documented project constraint (e.g. a legacy Svelte 4 subsystem, a third-party embed that can't meet a CLS budget), note the exception and its reasoning directly in the PR description rather than silently deviating — the goal is a deliberate, reviewable trade-off, not an unnoticed regression.

<!-- frontend-standard-skills:svelte END -->
