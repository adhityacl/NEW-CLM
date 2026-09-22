# Component & Code Standards — Vue.js

## Folder structure

```
src/
  main.ts                     # app entry: createApp, plugins, mount
  App.vue

  components/
    ui/                        # shared, feature-agnostic components (BaseButton, Modal, Input…)
    <feature>/                 # components used by a single feature/view only

  composables/                 # shared composables (useX.ts) — cross-feature reusable logic
  views/                       # or pages/ — one component per route, wired up in router/
  router/
    index.ts                   # route definitions, lazy component: () => import(...)
  stores/                      # Pinia stores — one file per domain (useCartStore, useAuthStore)
  lib/ (or utils/)             # shared utilities, formatting, validation, API clients
  types/                       # shared TypeScript types
  assets/                      # static assets processed by Vite
```

- **Component files**: `PascalCase.vue` (`ProductCard.vue`, `BaseButton.vue`), matching the component name Vue DevTools and stack traces show.
- **Composable files**: `useX.ts` in `camelCase`, one file per composable (`useDebouncedSearch.ts`, `useProductFilters.ts`).
- **Views/pages**: `PascalCase.vue`, typically suffixed `View`/`Page` for clarity against `components/` (`DashboardView.vue`).
- **Everything else** (`lib/`, `utils/`, `stores/` internals): `camelCase.ts` per the general `core-standards` rule.
- Colocate a view's own subcomponents/composables beside it when not reused elsewhere; promote to `components/ui/`/`composables/` the moment a second feature needs them (DRY — see `core-standards/references/code-quality-style.md`).

## Composables: the Vue equivalent of a hook

A composable is a function starting with `use` that encapsulates one reactive concern and can be called from any `<script setup>` block. Same discipline as a well-designed React hook: **one concern per composable**, not a grab-bag of unrelated state and logic.

**Bad — one composable doing three unrelated things:**
```ts
// useDashboard.ts
export function useDashboard() {
  const user = ref(null);
  const notifications = ref([]);
  const theme = ref("light");
  // fetches user, polls notifications, and manages theme — three concerns, one file
  return { user, notifications, theme, /* ...a dozen more things */ };
}
```

**Good — split by concern, composed together where needed:**
```ts
// useUser.ts
export function useUser() {
  const user = ref<User | null>(null);
  async function fetchUser() { user.value = await api.getCurrentUser(); }
  return { user, fetchUser };
}

// useNotifications.ts
export function useNotifications() {
  const notifications = shallowRef<Notification[]>([]);
  // polling logic here, scoped to this one concern
  return { notifications };
}
```
```vue
<script setup lang="ts">
import { useUser } from "@/composables/useUser";
import { useNotifications } from "@/composables/useNotifications";

const { user, fetchUser } = useUser();
const { notifications } = useNotifications();
</script>
```

## Typing props and emits

`defineProps<T>()` and `defineEmits<T>()` with a generic type argument are compiler-supported, fully type-checked, and self-documenting — always prefer them over the runtime-only object syntax (`defineProps({ product: Object })`), which offers no real type safety.

**Bad — runtime-only props, `any` slipping in:**
```vue
<script setup>
const props = defineProps({
  product: Object, // no shape, effectively `any`
  onSelect: Function,
});
</script>
```

**Good — fully typed, no `any`:**
```vue
<script setup lang="ts">
interface Product {
  id: string;
  name: string;
  price: number;
}

const props = defineProps<{ product: Product; selected?: boolean }>();
const emit = defineEmits<{
  select: [id: string];
  remove: [id: string];
}>();
</script>

<template>
  <button type="button" :aria-pressed="selected" @click="emit('select', product.id)">
    {{ product.name }}
  </button>
</template>
```
- Use `withDefaults(defineProps<T>(), {...})` for default values instead of runtime default objects.
- Never mutate a prop directly (`props.product.name = "x"`) — props flow one-way down; emit an event and let the parent own the update, or use a local `ref`/`computed` copy if the child genuinely needs local editable state derived from a prop.

## Pinia for shared state

Reach for a Pinia store the moment state needs to cross 3+ component levels (the same prop-drilling threshold as `core-standards`) or needs to survive outside a single component tree (auth session, cart, feature flags, theme).

```ts
// stores/cart.ts
import { defineStore } from "pinia";

export const useCartStore = defineStore("cart", () => {
  const items = shallowRef<CartItem[]>([]);
  const total = computed(() => items.value.reduce((sum, i) => sum + i.price * i.qty, 0));

  function addItem(item: CartItem) {
    items.value = [...items.value, item];
  }

  return { items, total, addItem };
});
```
- One store per domain (`useCartStore`, `useAuthStore`), not one giant store for the whole app.
- Prefer the setup-style store (as above, using `ref`/`computed`/functions) over the Options-style `defineStore({ state, getters, actions })` — it composes naturally with the rest of the Composition API codebase and lets a store use composables internally.
- Don't reach for Pinia for state that's genuinely local to one component/view — that's premature centralization and makes the store harder to reason about.

## Anti-patterns specific to Vue

- **Overusing `reactive` when `ref` is clearer.** `reactive` loses reactivity on destructuring (`const { count } = reactive({ count: 0 })` breaks the reactive link) and doesn't work for primitives — default to `ref` for anything that might be reassigned or destructured, and reserve `reactive` for a genuinely cohesive object you'll only ever mutate in place.
- **Mutating props directly** instead of emitting an event — breaks one-way data flow and makes state changes untraceable to their source.
- **Deeply nested `v-if`/`v-else-if`/`v-else` chains** where a `computed` returning a variant/state, or an extracted subcomponent per branch, would be clearer:

  **Bad:**
  ```vue
  <template>
    <div v-if="status === 'loading'">...</div>
    <div v-else-if="status === 'error' && retryCount > 3">...</div>
    <div v-else-if="status === 'error'">...</div>
    <div v-else-if="status === 'empty'">...</div>
    <div v-else>...</div>
  </template>
  ```
  **Good:**
  ```vue
  <script setup lang="ts">
  const viewState = computed(() => {
    if (status.value === "loading") return "loading";
    if (status.value === "error") return retryCount.value > 3 ? "error-final" : "error-retry";
    if (status.value === "empty") return "empty";
    return "content";
  });
  </script>
  <template>
    <LoadingState v-if="viewState === 'loading'" />
    <ErrorState v-else-if="viewState.startsWith('error')" :final="viewState === 'error-final'" />
    <EmptyState v-else-if="viewState === 'empty'" />
    <ContentView v-else />
  </template>
  ```
- **Watching a value just to derive another value** — use `computed` (see `references/performance.md`).
- Importing an entire utility/UI library at the top of a component when only one function/piece is used — prefer named/tree-shakeable imports so Vite's build can eliminate the unused code.
