# Performance — Vue.js

Vue 3's reactivity system and Vite's build pipeline give you real levers for LCP, CLS, and INP — most of them are about being deliberate with reactivity granularity and bundle splitting, since (unlike Next.js) there's no framework-level image/font component doing it for you.

## LCP

- **No built-in image component** — Vue ships no `next/image` equivalent, so image optimization is manual discipline:
  - Serve correctly-sized, modern-format (WebP/AVIF) images from a CDN or an image-optimization service (Cloudinary, imgix, or a Vite plugin like `vite-imagetools`).
  - Set explicit `width`/`height` on every `<img>` (also a CLS fix — see below).
  - Never `loading="lazy"` the LCP image — that's for below-the-fold images only. If the hero image is known at build time, add `<link rel="preload" as="image" href="...">` in `index.html` or via `vite-plugin-html`.
  ```vue
  <template>
    <img :src="hero" alt="…" width="1600" height="900" fetchpriority="high" />
  </template>
  ```
- **Route-based code splitting** keeps the initial bundle — and therefore Time to Interactive — small, which matters for LCP on slower connections since a bloated main bundle delays hydration of everything, including above-the-fold interactive elements:
  ```ts
  // router/index.ts
  import { createRouter, createWebHistory } from "vue-router";

  const routes = [
    { path: "/", component: () => import("../views/HomeView.vue") },
    { path: "/dashboard", component: () => import("../views/DashboardView.vue") },
  ];
  ```
  Every route except the landing route should be a lazy `() => import(...)`, not a static top-level import.
- **This is an SPA — there's no server-rendered HTML to paint immediately.** If LCP on the initial load is a real problem (not just an internal tool), that's a signal to reach for the `nuxt` skill (SSR/SSG) rather than fighting the SPA shell's blank-page-until-hydrated model.

## CLS

- Explicit `width`/`height` (or `aspect-ratio` in CSS) on every `<img>`, `<video>`, and iframe embed — Vue does nothing to enforce this the way `next/image` does, so it's a manual discipline, not a framework guarantee.
- Reserve space for async-loaded content with a sized skeleton/placeholder while a `<Suspense>` boundary or a composable's `isLoading` state resolves — don't let the layout jump when data arrives.
- Loading skeletons should approximate the real content's dimensions, not just show a spinner in a shrunk container that then expands.

## INP

- **`defineAsyncComponent` + `<Suspense>`** for heavy, non-critical components (rich text editors, charting libraries, large modals) — keeps their JS out of the initial bundle and off the main thread until actually needed:
  ```vue
  <script setup lang="ts">
  import { defineAsyncComponent } from "vue";
  const ChartPanel = defineAsyncComponent(() => import("./ChartPanel.vue"));
  </script>

  <template>
    <Suspense>
      <template #default><ChartPanel :data="chartData" /></template>
      <template #fallback><ChartSkeleton /></template>
    </Suspense>
  </template>
  ```
- **`v-memo`** to skip re-rendering expensive list items when their dependencies haven't changed — most valuable in large `v-for` lists where each item does non-trivial work to render:
  ```vue
  <template>
    <div v-for="item in items" :key="item.id" v-memo="[item.id, item.selected]">
      <!-- only re-renders when item.id or item.selected changes -->
      <ExpensiveRow :item="item" />
    </div>
  </template>
  ```
  Don't reach for `v-memo` by default — it adds complexity and is only worth it when profiling (Vue DevTools) shows a specific list is actually re-rendering wastefully.
- **`shallowRef`/`shallowReactive`** for large data structures that don't need deep, nested reactivity — a full `ref`/`reactive` on a large API response makes Vue instrument every nested property, which costs real CPU time on updates you'll never observe at that depth:
  ```ts
  import { shallowRef } from "vue";
  // Deep reactivity on a 5,000-row table dataset is wasted work if rows
  // are only ever replaced wholesale, never mutated field-by-field.
  const tableRows = shallowRef<Row[]>([]);
  async function loadRows() {
    tableRows.value = await fetchRows(); // triggers update; nested fields aren't tracked, which is fine here
  }
  ```
- **`computed` over a manually-synced `ref` + `watch`.** A `watch` that just recalculates and assigns a derived value is strictly worse than `computed` — it's more code, runs eagerly rather than lazily, and is a common source of stale-state bugs when a dependency is missed.

  **Bad:**
  ```ts
  const fullName = ref("");
  watch([firstName, lastName], () => {
    fullName.value = `${firstName.value} ${lastName.value}`;
  });
  ```
  **Good:**
  ```ts
  const fullName = computed(() => `${firstName.value} ${lastName.value}`);
  ```
- Scope `ref`/`reactive` state as locally as possible (inside the composable/component that owns it) — state lifted into a shared store that only one component actually needs causes wider re-render/re-computation trees than necessary.
- Debounce high-frequency handlers (search-as-you-type, scroll, resize) — same principle as `core-standards`, no Vue-specific API needed beyond a small `useDebounceFn` composable or a library like VueUse's `refDebounced`.

## Measuring

- Build and preview a real production bundle before judging performance — `vite dev` skips minification and production optimizations:
  ```bash
  vite build && vite preview
  ```
- **Vite bundle analysis** — `rollup-plugin-visualizer` renders an interactive treemap of what's actually in the output bundle, the same role `@next/bundle-analyzer` plays for Next.js:
  ```bash
  npm install --save-dev rollup-plugin-visualizer
  ```
  ```ts
  // vite.config.ts
  import { visualizer } from "rollup-plugin-visualizer";

  export default {
    plugins: [visualizer({ open: true, gzipSize: true })],
  };
  ```
- **Vue DevTools** (browser extension) — the primary tool for diagnosing *why* a component re-rendered: the Components tab highlights re-renders and shows which reactive dependency triggered them, which is where you confirm a `v-memo`/`shallowRef` change actually helped before shipping it.
- Run https://pagespeed.web.dev/ against a deployed preview build, not `localhost` with the dev server.
