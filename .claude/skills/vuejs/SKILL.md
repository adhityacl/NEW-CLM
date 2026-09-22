---
name: vuejs
description: Frontend engineering standards for Vue.js 3 (Composition API, Vite-based SPA) projects — <script setup> component structure, composable design, WCAG 2.1 AA accessibility, and Core Web Vitals performance (LCP, CLS, INP) per https://pagespeed.web.dev/. Use this skill whenever setting up contributor rules for a Vue.js project, writing or reviewing components/composables/Pinia stores, deciding between ref and reactive, auditing a Vue app's PageSpeed/Lighthouse score, or generating a CLAUDE.md/.cursor/AGENTS.md rules file for a Vue codebase. For Nuxt projects, use the separate `nuxt` skill instead.
---

# Vue.js Frontend Standards

For Vue 3 projects using the **Composition API** with `<script setup>` SFCs, built on Vite (a client-rendered SPA — not Nuxt, which has its own skill for meta-framework concerns like SSR and file-based routing). Extends the framework-agnostic rules in the `core-standards` skill with Vue-specific APIs, conventions, and tooling.

## When to use this skill

- Setting up or reviewing contributor rules for a new or existing Vue 3 project.
- Writing or reviewing `<script setup>` components, composables, Pinia stores, or Vue Router routes.
- Deciding `ref` vs. `reactive` vs. `shallowRef`, or reviewing a PR with unnecessary deep reactivity.
- Investigating a Vue SPA's PageSpeed Insights / Lighthouse score.
- Generating a `CLAUDE.md`/`.cursor/rules`/`AGENTS.md` for a Vue codebase.

## Quick reference

| Concern | Rule |
|---|---|
| Component syntax | `<script setup lang="ts">` for every new SFC — no Options API in new code |
| Reactivity | `ref` for primitives/replaceable values, `reactive` only for a cohesive object you'll never reassign whole; `computed` instead of a manually-synced `ref` + `watch` |
| Large/inert data | `shallowRef`/`shallowReactive` for big structures (lists from an API, chart datasets) that don't need deep reactivity |
| Props/emits | `defineProps<T>()` / `defineEmits<T>()` with a generic type — never runtime-only prop declarations, never `any` |
| Code-splitting | `defineAsyncComponent` + `<Suspense>` for heavy components; lazy `component: () => import(...)` for every route |
| Shared state | Pinia store, not prop drilling 3+ levels deep |
| Images | Manual `width`/`height`, `loading="lazy"` below the fold — Vue has no built-in image component |
| File naming | Components: `PascalCase.vue`; composables: `useX.ts` camelCase; views/pages: `PascalCase.vue` or match router convention |
| Testing | Vitest + `@testing-library/vue` for units, Playwright + `@axe-core/playwright` for e2e, Lighthouse CI against `vite build && vite preview` |

## Reference files

| File | Covers |
|---|---|
| `references/accessibility.md` | Template refs for focus management, `:aria-*`/`:class` bindings, accessible Button/Modal/Form/Nav patterns, `eslint-plugin-vuejs-accessibility`, `v-html` risks |
| `references/performance.md` | `defineAsyncComponent`, `<Suspense>`, `v-memo`, `shallowRef`/`shallowReactive`, `computed`, route-based code splitting, manual image handling, Vite bundle analysis, Vue DevTools |
| `references/component-and-code-standards.md` | Folder structure, component/composable naming, `defineProps`/`defineEmits` typing, Pinia conventions, anti-patterns |
| `references/testing-and-tooling.md` | ESLint (`eslint-plugin-vue` + `eslint-plugin-vuejs-accessibility`), Vitest + Testing Library, Playwright, Lighthouse CI against a production build |

The full framework-agnostic baseline lives in the companion `core-standards` skill — install both together; this skill layers Vue-specific APIs and conventions on top.

## Generating the project rule file

`assets/RULES.md` is self-contained and ready to drop into `CLAUDE.md`, `.cursor/rules/vuejs-frontend-standards.mdc`, or `AGENTS.md` — or run `npx frontend-standard-skills add vuejs`.

## Good vs. bad, at a glance

**Bad — deep `reactive` on API data, no typed props, bare `<img>`, manual DOM manipulation for focus:**
```vue
<script>
export default {
  props: ["product"],
  data() {
    return { state: reactive({ open: false }) };
  },
  methods: {
    openModal() {
      this.state.open = true;
      document.getElementById("modal").focus();
    },
  },
};
</script>
<template>
  <img :src="product.image" />
  <button @click="openModal">Open</button>
</template>
```

**Good — `<script setup>`, typed props, `shallowRef` for inert data, template ref for focus, sized image:**
```vue
<script setup lang="ts">
import { ref, shallowRef } from "vue";

const props = defineProps<{ product: { id: string; name: string; image: string; imageAlt: string } }>();
const emit = defineEmits<{ addToCart: [id: string] }>();

const isOpen = ref(false);
const relatedProducts = shallowRef<Product[]>([]); // large, read-only list — no deep reactivity needed
const modalRef = ref<HTMLElement | null>(null);

function openModal() {
  isOpen.value = true;
  modalRef.value?.focus();
}
</script>

<template>
  <article>
    <img :src="product.image" :alt="product.imageAlt" width="800" height="600" loading="lazy" />
    <h2>{{ product.name }}</h2>
    <button type="button" @click="openModal">Open details</button>
    <div v-if="isOpen" ref="modalRef" role="dialog" aria-modal="true" tabindex="-1">
      <!-- modal content -->
    </div>
  </article>
</template>
```

## Library reference

![Vue.js](https://img.shields.io/badge/Vue.js-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![WCAG 2.1 AA](https://img.shields.io/badge/WCAG-2.1%20AA-2E7D32?style=for-the-badge)

- Docs: [vuejs.org](https://vuejs.org)
- Guide: [vuejs.org/guide/introduction.html](https://vuejs.org/guide/introduction.html)
- Source: [github.com/vuejs/core](https://github.com/vuejs/core)
