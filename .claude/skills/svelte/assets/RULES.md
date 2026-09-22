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
