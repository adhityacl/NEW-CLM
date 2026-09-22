# Vue.js — Frontend Standards Skill

![Vue.js](https://img.shields.io/badge/Vue.js-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![WCAG 2.1 AA](https://img.shields.io/badge/WCAG-2.1%20AA-2E7D32?style=for-the-badge)

Enforceable accessibility, performance, and code-quality standards for Vue 3 Composition API / Vite SPA projects — `<script setup>` component discipline, composable design, Pinia conventions, and Core Web Vitals thresholds. For Nuxt projects, see the separate `nuxt` skill.

- **Docs:** [vuejs.org](https://vuejs.org) · [Guide](https://vuejs.org/guide/introduction.html)
- **Source:** [github.com/vuejs/core](https://github.com/vuejs/core)

## What's inside

```
vuejs/
├── SKILL.md                              # entry point Claude/Cursor reads
├── references/
│   ├── accessibility.md                  # template refs for focus, :aria-* bindings, accessible Modal/Form/Nav, v-html risks
│   ├── performance.md                    # defineAsyncComponent, v-memo, shallowRef, route code-splitting, Vite bundle analysis
│   ├── component-and-code-standards.md   # folder structure, composables, defineProps/defineEmits typing, Pinia conventions
│   └── testing-and-tooling.md            # ESLint, Testing Library, Playwright, Lighthouse CI on a real build
└── assets/
    └── RULES.md                          # the enforceable rule file installed into your project
```

## Install

```bash
npx frontend-standard-skills add vuejs
# or
pnpm dlx frontend-standard-skills add vuejs
yarn dlx frontend-standard-skills add vuejs
```

This writes:
- `.claude/skills/vuejs/` — the full skill, usable in Claude Code / claude.ai
- `.cursor/rules/vuejs-frontend-standards.mdc` — Cursor rule
- A section in `CLAUDE.md` and `AGENTS.md`

Or install as a Claude Code plugin:
```
/plugin marketplace add abayomijohn273/frontend_standard_skills
/plugin install vuejs
```

## Example usage

> "Review this new `ProductGallery.vue` — is the reactivity granularity right, and does the image handling meet our Core Web Vitals standards?"

> "Set up a Pinia store for the shopping cart following our standards, with loading/empty/error states in the view that consumes it."

See the [root README](../../README.md) for every install method and the full list of stacks.
