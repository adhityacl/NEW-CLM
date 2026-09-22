---
name: svelte
description: Frontend engineering standards for Svelte 5 (runes) and SvelteKit projects — $state/$derived/$props reactivity, file-based routing and load functions, WCAG 2.1 AA accessibility (including Svelte's built-in compiler a11y warnings), and Core Web Vitals performance (LCP, CLS, INP) per https://pagespeed.web.dev/. Use this skill whenever setting up contributor rules for a Svelte or SvelteKit project, writing or reviewing `.svelte` components, deciding between `$state`/`$derived`/stores, auditing a SvelteKit app's PageSpeed/Lighthouse score, or generating a CLAUDE.md/.cursor/AGENTS.md rules file for a Svelte codebase.
---

# Svelte Frontend Standards

For **Svelte 5** (runes API: `$state`, `$derived`, `$effect`, `$props`) and **SvelteKit** for routing, SSR, and data loading. Extends the framework-agnostic rules in the `core-standards` skill with Svelte-specific APIs, conventions, and tooling. If a project is still on Svelte 4 (`export let` / `$:` reactive statements / stores-first), note that explicitly in the rules file, since prop and reactivity syntax differ from what's described here.

## When to use this skill

- Setting up or reviewing contributor rules for a new or existing Svelte/SvelteKit project.
- Writing or reviewing `.svelte` components, deciding between local `$state` and a shared store.
- Writing or auditing `src/routes/` pages, layouts, load functions, or error boundaries.
- Investigating a SvelteKit app's PageSpeed Insights / Lighthouse score.
- Generating a `CLAUDE.md`/`.cursor/rules`/`AGENTS.md` for a Svelte codebase.

## Quick reference

| Concern | Rule |
|---|---|
| Reactivity | `$state` for local reactive state, `$derived` for computed values (never a manually-synced `$state` + `$effect` pair), `$props()` for typed component props |
| Compiler a11y warnings | Every `a11y_*` compiler warning is build-breaking — fix it, never suppress with `<!-- svelte-ignore -->` without a documented reason |
| Images | `@sveltejs/enhanced-img` (`<enhanced:img>`) for local images — automatic `srcset`, modern formats, and CLS-safe intrinsic dimensions |
| Routing | File-based: `+page.svelte`, `+layout.svelte`, `+page.ts`/`+page.server.ts` load functions, `+error.svelte` per route segment |
| Rendering | Prerender static routes (`export const prerender = true`); reserve SSR/CSR-only for genuinely dynamic, per-request content |
| Navigation | `data-sveltekit-preload-data` on links for instant navigations |
| File naming | Component files: `PascalCase.svelte`; routes: SvelteKit's fixed `+page.svelte`/`+layout.svelte` file names; everything else: `camelCase.ts` |
| Testing | Vitest + `@testing-library/svelte` for units, Playwright + `@axe-core/playwright` for e2e, Lighthouse CI against a real `vite build && vite preview` |

## Reference files

| File | Covers |
|---|---|
| `references/accessibility.md` | Svelte compiler a11y warnings, accessible custom Button/Modal/Form/Nav components with runes, `svelte-check` in CI |
| `references/performance.md` | Compile-away reactivity, `<enhanced:img>`, per-route code-splitting, prerender/SSR/adapter choices, `data-sveltekit-preload-data`, `$effect` discipline |
| `references/component-and-code-standards.md` | SvelteKit folder structure, `$lib` alias, runes conventions, snippets vs. slots, TypeScript props, anti-patterns |
| `references/testing-and-tooling.md` | ESLint (`eslint-plugin-svelte`), Prettier, `svelte-check`, Vitest + Testing Library, Playwright, Lighthouse CI against a production build |

The full framework-agnostic baseline lives in the companion `core-standards` skill — install both together; this skill layers Svelte-specific APIs and conventions on top.

## Generating the project rule file

`assets/RULES.md` is self-contained and ready to drop into `CLAUDE.md`, `.cursor/rules/svelte-frontend-standards.mdc`, or `AGENTS.md` — or run `npx frontend-standard-skills add svelte`.

## Good vs. bad, at a glance

**Bad — manually-synced state instead of `$derived`, unlabeled icon button, no compiler warning fixed:**
```svelte
<script>
  let items = $state([]);
  let total = $state(0);

  $effect(() => {
    total = items.reduce((sum, i) => sum + i.price, 0);
  });
</script>

<button onclick={() => items = []}>
  <TrashIcon />
</button>
```

**Good — `$derived` for computed state, real accessible name, no redundant effect:**
```svelte
<script lang="ts">
  interface Item { id: string; price: number }
  let items = $state<Item[]>([]);
  let total = $derived(items.reduce((sum, i) => sum + i.price, 0));
</script>

<button onclick={() => (items = [])} aria-label="Clear all items">
  <TrashIcon aria-hidden="true" />
</button>
<p>Total: {total}</p>
```
`total` never drifts out of sync with `items` because it's computed, not manually maintained — and the compiler has nothing to warn about because the button has an accessible name.

## Library reference

![Svelte](https://img.shields.io/badge/Svelte-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)
![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

- Docs: [svelte.dev/docs](https://svelte.dev/docs)
- SvelteKit docs: [svelte.dev/docs/kit](https://svelte.dev/docs/kit)
- Source: [github.com/sveltejs/svelte](https://github.com/sveltejs/svelte)
