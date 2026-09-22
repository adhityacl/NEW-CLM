# Component & Code Standards — Svelte

## SvelteKit folder structure

```
src/
  routes/
    +layout.svelte             # root layout: shared shell, nav, global providers
    +layout.ts                  # root layout load function (runs for every route)
    +page.svelte                # route: /
    +error.svelte                # route-level error boundary
    (marketing)/                 # route group — organizes without affecting the URL
      about/
        +page.svelte
    dashboard/
      +layout.svelte             # nested layout for everything under /dashboard
      +page.svelte
      +page.ts                    # client+server load function
      settings/
        +page.svelte
        +page.server.ts           # server-only load function / form actions
      [projectId]/                # dynamic segment
        +page.svelte
        +page.ts
    api/
      users/
        +server.ts                 # API route (GET/POST/etc. handlers)

lib/                              # aliased as $lib — src/lib/
  components/
    ui/                            # shared, feature-agnostic components (Button, Modal, Input…)
    <feature>/                      # components used by a single feature/route only
  utils/                           # shared utilities, formatting, validation
  types.ts                        # shared TypeScript types
```

- **Route files** use SvelteKit's fixed, framework-mandated names (`+page.svelte`, `+layout.svelte`, `+page.ts`, `+page.server.ts`, `+error.svelte`, `+server.ts`) — these are not stylistic choices, the router recognizes them by exact name.
- **Route segment folders** use `kebab-case` to match the URL they produce (`routes/user-settings/+page.svelte` → `/user-settings`).
- **Component files** use `PascalCase.svelte` (`ProductCard.svelte`), matching the component name.
- **Everything else** (`lib/utils/`, non-component `.ts` files) uses `camelCase.ts` per the general `core-standards` rule (`formatCurrency.ts`, `useDebounce.ts` if you're wrapping a reusable stateful helper).
- `$lib` is SvelteKit's built-in alias for `src/lib` — import shared code as `import { Button } from "$lib/components/ui/Button.svelte"`, never a relative `../../../lib/...` path.
- Colocate a route's own subcomponents/styles beside its `+page.svelte` when not reused elsewhere; promote to `lib/components/ui/` the moment a second route needs them (DRY — see `core-standards/references/code-quality-style.md`).

## Runes conventions (Svelte 5)

- **`$state` for local reactive state.** Replaces Svelte 4's implicit `let` reactivity — a `let` declaration without `$state` is no longer reactive in a `.svelte` file's `<script>` under runes mode.
```svelte
<script lang="ts">
  let count = $state(0);
</script>
<button onclick={() => count++}>{count}</button>
```
- **`$derived` for computed values — never a manually-synced `$state` kept in sync via `$effect`.** If a value can be computed from other reactive state, compute it; don't store and update it separately.
```svelte
<script lang="ts">
  let items = $state<{ price: number }[]>([]);
  let total = $derived(items.reduce((sum, i) => sum + i.price, 0));
  // NOT: let total = $state(0); $effect(() => { total = items.reduce(...) });
</script>
```
- **`$props()` for typed component props**, with an explicit `interface`/`type` — this replaces Svelte 4's `export let`:
```svelte
<script lang="ts">
  interface Props {
    title: string;
    count?: number;
    onSelect?: (id: string) => void;
  }
  let { title, count = 0, onSelect }: Props = $props();
</script>
```
- **Snippets instead of slots** for passing renderable content into a component — Svelte 5's replacement for named/default slots:
```svelte
<!-- Card.svelte -->
<script lang="ts">
  interface Props { header: import("svelte").Snippet; children: import("svelte").Snippet }
  let { header, children }: Props = $props();
</script>
<div class="card">
  <div class="card-header">{@render header()}</div>
  <div class="card-body">{@render children()}</div>
</div>

<!-- usage -->
<Card>
  {#snippet header()}<h2>Order Summary</h2>{/snippet}
  <p>Contents go here.</p>
</Card>
```
- **`$effect`** is for side effects only (DOM measurement/mutation outside Svelte's control, subscriptions, analytics, syncing to `localStorage`/an external store) — not for computing derived values. See `references/performance.md` for the INP cost of misusing it.

## TypeScript typing

- `strict: true` in `tsconfig.json`. No `any`.
- Every component's `Props` interface is explicit and exported when other files need to reference it:
```svelte
<script lang="ts">
  export interface ButtonProps {
    label: string;
    variant?: "primary" | "danger";
  }
  let { label, variant = "primary" }: ButtonProps = $props();
</script>
```
- Load function return types are inferred from `PageLoad`/`PageServerLoad` generated types — use them (`import type { PageLoad } from "./$types"`) rather than hand-writing duplicate types for load data.
- Form action inputs are validated (e.g. with Zod) inside `+page.server.ts` — never trust `FormData` shape implicitly, the same rule as any other framework's server boundary.

## Anti-patterns specific to Svelte

- **Overusing global stores (`writable`/`$lib/stores`) for state that's only ever read/written by one component tree.** A store is for genuinely shared, cross-component state — local UI state (an open/closed toggle, a form field's draft value) belongs in local `$state`, not a global store that every component now implicitly depends on.
- **Deeply nested `{#if}`/`{:else if}` chains** instead of extracting a component per branch — past two or three branches, extract each into its own named component so the parent template stays readable and each branch is independently testable.
```svelte
<!-- Bad -->
{#if status === "loading"}
  ...
{:else if status === "error"}
  ...
{:else if status === "empty"}
  ...
{:else if status === "partial"}
  ...
{:else}
  ...
{/if}

<!-- Good -->
{#if status === "loading"}<LoadingState />
{:else if status === "error"}<ErrorState {error} />
{:else if status === "empty"}<EmptyState />
{:else}<ResultsList {results} />
{/if}
```
- **Fetching in `onMount`/an `$effect` when a `+page.ts`/`+page.server.ts` load function could fetch the same data before the component renders** — causes a client-visible waterfall and a worse LCP than data resolved during SSR/load.
- **Mutating `$state` objects/arrays in place without reassignment** in contexts where Svelte's fine-grained reactivity depends on the assignment being observed — prefer `items = [...items, newItem]` over `items.push(newItem)` unless you've confirmed the mutation is tracked (Svelte 5's proxies handle many in-place mutations, but explicit reassignment is the safer default to reason about).
