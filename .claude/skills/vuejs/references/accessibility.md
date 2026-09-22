# Accessibility — Vue.js

Applies the WCAG 2.1 AA rules from `core-standards` inside Vue 3's `<script setup>` Composition API model.

## Focus management with template refs

Vue's declarative `ref="..."` attribute is the idiomatic way to move focus imperatively — reach for it instead of `document.getElementById`/`document.querySelector`, which bypass Vue's reactivity and break under conditional rendering (`v-if`) or SSR.

```vue
<script setup lang="ts">
import { ref, nextTick } from "vue";

const isOpen = ref(false);
const dialogRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);

async function openDialog() {
  isOpen.value = true;
  await nextTick(); // wait for the v-if'd element to actually exist in the DOM
  dialogRef.value?.focus();
}

function closeDialog() {
  isOpen.value = false;
  triggerRef.value?.focus(); // restore focus to the trigger
}
</script>

<template>
  <button ref="triggerRef" type="button" @click="openDialog">Open dialog</button>
  <div v-if="isOpen" ref="dialogRef" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">
    <h2 id="dialog-title">Dialog title</h2>
    <button type="button" @click="closeDialog">Close</button>
  </div>
</template>
```

`v-if` unmounts the element entirely (unlike `v-show`, which only toggles `display`), so the ref is `null` until the next tick after the condition flips — always `await nextTick()` before touching a freshly-`v-if`'d ref.

## Dynamic accessible state with `:aria-*` and `:class`

Bind ARIA attributes reactively rather than toggling them imperatively — it keeps the accessible state and the visual state driven from the same source of truth and impossible to desync.

**Bad — visual state and accessible state can drift apart:**
```vue
<script setup>
const expanded = ref(false);
function toggle() {
  expanded.value = !expanded.value;
  document.getElementById("panel").classList.toggle("open"); // separate, manual, easy to forget
}
</script>
```

**Good — one reactive source drives both:**
```vue
<script setup lang="ts">
import { ref } from "vue";
const expanded = ref(false);
</script>

<template>
  <button
    type="button"
    :aria-expanded="expanded"
    aria-controls="panel"
    @click="expanded = !expanded"
  >
    Filters
  </button>
  <div id="panel" :class="{ open: expanded }" v-show="expanded">
    <!-- filter controls -->
  </div>
</template>
```

Same pattern for `aria-current`, `aria-selected`, `aria-pressed`, `aria-invalid` — bind them to reactive state, never set them with raw DOM calls.

## Accessible custom components

Build (or better, adopt) shared primitives that bake accessibility in once, per the `core-standards` component rules.

**Button** — a thin wrapper that still renders a real `<button>`, forwards `aria-*` attrs, and shows `aria-busy` while pending:
```vue
<script setup lang="ts">
defineProps<{ loading?: boolean; disabled?: boolean }>();
</script>

<template>
  <button type="button" :disabled="disabled || loading" :aria-busy="loading">
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <slot />
  </button>
</template>
```

**Modal, Form, Nav** — implement the focus-trap, `role="dialog"`/`aria-modal`, label-association, and `aria-current` patterns from `core-standards/references/accessibility.md` using template refs as shown above. Hand-rolling a robust focus trap (correctly handling `Tab`/`Shift+Tab` wraparound, nested focusables, and edge cases like zero focusable children) is easy to get subtly wrong — prefer a maintained headless library:

- **[Radix Vue](https://www.radix-vue.com/)** — unstyled, accessible primitives (Dialog, Popover, Tabs, Accordion, Combobox) ported from Radix UI, with focus trapping, `aria-*` wiring, and keyboard patterns built in.
- **[Headless UI for Vue](https://headlessui.com/v1/vue)** — similar unstyled accessible primitives from the Tailwind team.

Wrap the primitive you choose in your own `components/ui/Modal.vue`, `components/ui/Combobox.vue`, etc. so the rest of the app imports your API, not the library's directly — this keeps a future library swap to one file.

## `v-html` and accessible dynamic content

- `v-html` injects raw HTML with no sanitization — an XSS vector if the source isn't fully trusted, and a common way to accidentally ship inaccessible markup (missing alt text, broken heading order, non-semantic elements) from a CMS or user input. Sanitize with a library like `DOMPurify` before binding, and audit the resulting markup for semantics, not just security.
- For dynamic content that changes without a navigation (search results count, save confirmation, validation summary), use an `aria-live` region bound to reactive state rather than `v-html`-injecting a toast:
```vue
<script setup lang="ts">
import { ref } from "vue";
const statusMessage = ref("");
</script>
<template>
  <div role="status" aria-live="polite" class="visually-hidden">{{ statusMessage }}</div>
</template>
```
- Never use `v-html` for content that should be interactive (buttons, links) — event listeners don't attach to HTML injected this way in any structured, Vue-reactive way; render real components/elements with `v-if`/`v-for` instead.

## Linting

```bash
npm install --save-dev eslint-plugin-vue eslint-plugin-vuejs-accessibility
```
```js
// eslint.config.js
import pluginVue from "eslint-plugin-vue";
import vueA11y from "eslint-plugin-vuejs-accessibility";

export default [
  ...pluginVue.configs["flat/recommended"],
  ...vueA11y.configs["flat/recommended"],
];
```
`eslint-plugin-vuejs-accessibility` catches missing `alt`, missing form labels, `v-html` without review, non-interactive elements with click handlers (`no-static-element-interactions`), and more — the Vue-template equivalent of `eslint-plugin-jsx-a11y`. Treat violations as build-breaking in CI, same as the rest of the lint suite.
