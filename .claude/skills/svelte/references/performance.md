# Performance — Svelte

Svelte and SvelteKit start you ahead on Core Web Vitals compared to virtual-DOM frameworks, but that head start is not a substitute for doing the work below.

## The inherent advantage — and why it isn't a free pass

Svelte compiles components into imperative DOM-update instructions at build time instead of shipping a runtime virtual-DOM diffing engine. In practice that means **less baseline JavaScript shipped to the browser** for the same UI than a comparable React/Vue app, which helps every metric that's sensitive to parse/execute time (TTI, INP) by default. This is a real, structural advantage — but it doesn't prevent a route from shipping a 400KB chart library, an unoptimized image, or an `$effect` that thrashes on every keystroke. Every technique below still applies; Svelte just gives you a lower floor to build on top of.

## LCP

- **`@sveltejs/enhanced-img`** (`<enhanced:img>`) for any locally-imported image: it generates responsive `srcset`, serves modern formats (AVIF/WebP) with fallback, and sets intrinsic `width`/`height` automatically so the browser can reserve space before the file downloads.
```bash
npm install --save-dev @sveltejs/enhanced-img
```
```svelte
<enhanced:img src="./hero.jpg" alt="Product dashboard overview" />
```
For remote/CMS-served images without a build-time file, use a CDN that supports on-the-fly resizing and `srcset` generation, and always set explicit `width`/`height` by hand.
- **Prerender static routes.** A prerendered page is served as static HTML with effectively zero TTFB cost beyond the CDN edge — the single biggest LCP lever available in SvelteKit for content that doesn't need per-request personalization:
```ts
// +page.ts
export const prerender = true;
```
- **`data-sveltekit-preload-data`** on links (`hover` is the default in SvelteKit for links in the viewport) fetches the destination route's data before the user clicks, so the next page's LCP content is often already in memory by the time of navigation:
```svelte
<a href="/product/42" data-sveltekit-preload-data="hover">View product</a>
```

## CLS

- `<enhanced:img>` sets intrinsic dimensions automatically — never bypass it with a raw `<img>` that omits `width`/`height`.
- For any content injected client-side after mount (async widgets, embeds, banners), reserve the space with a sized container before it arrives, same as the `core-standards` rule.
- Loading UI (a skeleton shown while a `+page.ts` load function or an `{#await}` block resolves) should approximate the final content's dimensions so the swap-in doesn't shift the layout:
```svelte
{#await loadComments()}
  <div class="comments-skeleton" style="min-height: 240px" aria-hidden="true"></div>
{:then comments}
  <CommentList {comments} />
{/await}
```

## INP — `$effect` discipline

Svelte 5's `$effect` reruns whenever any reactive value it reads changes. An `$effect` that reads more state than it needs, or that triggers further state writes, is a direct source of wasted re-computation and can degrade INP the same way an unmemoized re-render tree does in other frameworks.

- **Prefer `$derived` over `$effect` for anything that's just computing a value.** `$effect` is for side effects (DOM measurement, subscriptions, logging, syncing to an external system) — not for keeping one piece of state in sync with another, which is exactly what `$derived` exists for.

**Bad — `$effect` used to compute a value, reruns and writes state on every dependency change:**
```svelte
<script>
  let query = $state("");
  let results = $state([]);

  $effect(() => {
    results = allItems.filter((i) => i.name.includes(query));
  });
</script>
```

**Good — `$derived` computes the value directly, no redundant state or effect:**
```svelte
<script>
  let query = $state("");
  let results = $derived(allItems.filter((i) => i.name.includes(query)));
</script>
```
- Scope `$effect` dependencies tightly — reading unrelated state inside an effect body causes it to rerun for changes it doesn't actually care about. Destructure only what's needed, or read values through `$derived` first.
- Debounce high-frequency `$effect` triggers (search-as-you-type, resize/scroll-driven state) the same way you'd debounce an event handler.
- Code-split heavy, non-critical components with a dynamic `import()`, deferring their JS until actually needed:
```svelte
<script>
  let ChartPanel = $state<typeof import("./ChartPanel.svelte").default | null>(null);
  async function loadChart() {
    ChartPanel = (await import("./ChartPanel.svelte")).default;
  }
</script>
<button onclick={loadChart}>Show chart</button>
{#if ChartPanel}
  <ChartPanel />
{/if}
```

## Routing, rendering, and adapters

- **Automatic per-route code-splitting.** SvelteKit only ships the JS a given route needs by default — no manual route-based `React.lazy` equivalent required, but it's still defeated if a shared `+layout.svelte` imports something heavy that every route then pays for. Keep layout-level imports lean.
- **Choose the rendering mode deliberately per route**, set in `+page.ts`/`+page.server.ts`:
  - `export const prerender = true` — static content, best TTFB/LCP, served from the edge.
  - default SSR — per-request personalized/dynamic content; still fast TTFB if the server/data layer is fast, but slower than prerendered.
  - `export const csr = false` — for content-only pages with zero interactivity, skips hydration JS entirely.
- **Pick the right adapter** (`@sveltejs/adapter-static`, `adapter-node`, `adapter-vercel`, etc.) for the deployment target — a static adapter for a fully prerenderable site removes server compute from the request path entirely, which is the largest possible TTFB win.

## Measuring

- Run https://pagespeed.web.dev/ and `vite build && vite preview` (never `vite dev`, which skips production optimizations and is unrepresentative) before judging performance.
- Inspect the built output's chunk sizes; a route's JS growing unexpectedly after adding a dependency is the same signal as Next.js's First Load JS table.
- `vite-bundle-visualizer` or `rollup-plugin-visualizer` to inspect what's actually in a bundle when a route looks heavier than expected:
```bash
npm install --save-dev rollup-plugin-visualizer
```
