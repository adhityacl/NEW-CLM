# Performance — React

Plain React has no meta-framework doing image optimization, code-splitting, or SSR for you — every lever below is something the app configures and applies itself, not a framework default.

## LCP

- **Code-split routes and heavy components** with `React.lazy` + `<Suspense>` so the LCP path isn't blocked downloading JS for parts of the app the user isn't looking at yet:
```tsx
import { lazy, Suspense } from "react";

const Dashboard = lazy(() => import("./routes/Dashboard"));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
```
- **Manually optimize the LCP image** — there's no `next/image` doing this automatically:
  - Serve correctly sized images (a `srcset`/`sizes` pair or pre-resized variants), not a single oversized source scaled down in CSS.
  - Preload it explicitly if it's known at initial render: `<link rel="preload" as="image" href="/hero.avif" fetchpriority="high">` in `index.html`.
  - Never apply `loading="lazy"` to it — that's for below-the-fold images only.
```tsx
<img
  src="/hero-1200.avif"
  srcSet="/hero-600.avif 600w, /hero-1200.avif 1200w, /hero-2000.avif 2000w"
  sizes="(max-width: 640px) 100vw, 1200px"
  fetchPriority="high"
  width={1200}
  height={675}
  alt="…"
/>
```
- **Fonts**: self-host web fonts (don't rely on a render-blocking `<link>` to a third-party font host without `preconnect`), and set `font-display: swap` in the `@font-face` rule.
- **TTFB**: for a client-rendered SPA, TTFB is mostly your CDN/hosting setup, not React itself — serve `index.html` and static assets from a CDN with caching headers, and keep the initial JS bundle small (see bundle analysis below) since nothing paints until it downloads and executes.

## CLS

- Every `<img>` and `<video>` gets explicit `width`/`height` (or CSS `aspect-ratio`) — with no framework enforcing this, it's easy to forget, and forgetting it is the single most common source of CLS in a plain React app.
- Reserve space for content that mounts asynchronously (a lazy-loaded component behind `<Suspense>`, a banner fetched after mount) with a sized skeleton/placeholder matching the eventual content's dimensions — don't let a `<Suspense fallback={null}>` collapse to zero height and then jump when the real content mounts.
- Web fonts: `font-display: swap` plus matching fallback font metrics (or `size-adjust`) to minimize the visible reflow on swap.

## INP — re-render discipline

INP problems in React are almost always re-render problems: too much work running synchronously in response to an interaction, either because state is scoped too high or because memoization isn't actually preventing the re-render it looks like it should.

### `useMemo` / `useCallback` / `React.memo` — when they help and when they're noise

- **They help** when: the wrapped computation is measurably expensive (a large array transform, not `a + b`), or the memoized value/callback is passed as a prop to a `React.memo`-wrapped child that you've confirmed re-renders unnecessarily without it.
- **They're noise** when applied reflexively to every function/value in a component "for performance" — each one has its own (small but nonzero) comparison and memory cost, and wrapping something that wasn't expensive or wasn't defeating memoization just adds a layer of indirection for no measured benefit. Don't reach for `useMemo`/`useCallback` before you've profiled and identified an actual re-render problem.
- **The dependency array is not optional.** A stale closure from a wrong/missing dependency causes real bugs, not just theoretical ones — `eslint-plugin-react-hooks`'s `exhaustive-deps` rule catches most of these; don't silence it.

**Bad — new object/array/function literal on every render defeats `React.memo` on the child:**
```tsx
function Parent({ items }: { items: Item[] }) {
  return (
    <MemoizedList
      items={items}
      options={{ sortBy: "name" }}      // new object identity every render
      onSelect={(id) => select(id)}     // new function identity every render
    />
  );
}
```

**Good — stable references so `React.memo` on `MemoizedList` actually prevents re-renders:**
```tsx
const SORT_OPTIONS = { sortBy: "name" }; // module-level constant, stable forever

function Parent({ items }: { items: Item[] }) {
  const handleSelect = useCallback((id: string) => select(id), []);
  return <MemoizedList items={items} options={SORT_OPTIONS} onSelect={handleSelect} />;
}
```

### List virtualization

Rendering hundreds/thousands of DOM nodes for a long list is a direct INP and memory cost — only the visible rows need to exist in the DOM.

```bash
npm install react-window
# or: npm install @tanstack/react-virtual
```
```tsx
import { FixedSizeList } from "react-window";

function ResultsList({ items }: { items: Item[] }) {
  return (
    <FixedSizeList height={600} width="100%" itemCount={items.length} itemSize={56}>
      {({ index, style }) => (
        <div style={style}>{items[index].name}</div>
      )}
    </FixedSizeList>
  );
}
```
Reach for this once a list can realistically grow past a few hundred rows (search results, activity feeds, data tables) — not for a nav with 8 items.

### Other INP levers

- Debounce/throttle high-frequency handlers (search-as-you-type, scroll, resize) — see `core-standards/references/performance-core-web-vitals.md` for the general pattern.
- Scope state as locally as possible; a `useState` in `App` that only one deeply nested component reads forces every component between them to re-render on every update. Lift only as far as the nearest common consumer actually requires.
- Defer non-urgent work (analytics calls, secondary UI updates) with `queueMicrotask`/`setTimeout(fn, 0)` or React's `useTransition` so it doesn't block the interaction's initial visual feedback.

## Measuring

- **React DevTools Profiler** — record an interaction, look at which components re-rendered and why ("Why did this render?" flame graph). This is the primary tool for diagnosing INP/re-render problems; don't guess at memoization fixes without profiling first.
- **Bundle analysis** (Vite):
```bash
npm install --save-dev rollup-plugin-visualizer
```
```js
// vite.config.ts
import { visualizer } from "rollup-plugin-visualizer";

export default {
  plugins: [visualizer({ open: true, gzipSize: true })],
};
```
```bash
npm run build   # generates stats.html
```
For CRA (or any webpack-based setup), use `source-map-explorer` or `webpack-bundle-analyzer` instead.
- Always measure against a real production build (`vite build && vite preview`, or `serve -s build` for CRA) — the dev server skips minification and tree-shaking and isn't representative. See `references/testing-and-tooling.md` for wiring this into Lighthouse CI.
