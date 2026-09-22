# Svelte — Frontend Standards Skill

![Svelte](https://img.shields.io/badge/Svelte-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)
![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![WCAG 2.1 AA](https://img.shields.io/badge/WCAG-2.1%20AA-2E7D32?style=for-the-badge)

Enforceable accessibility, performance, and code-quality standards for Svelte 5 (runes) and SvelteKit projects — compiler-enforced `a11y_*` warnings, `$state`/`$derived`/`$props` reactivity discipline, `<enhanced:img>`/prerender optimization, and Core Web Vitals thresholds.

- **Docs:** [svelte.dev/docs](https://svelte.dev/docs) · [SvelteKit docs](https://svelte.dev/docs/kit)
- **Source:** [github.com/sveltejs/svelte](https://github.com/sveltejs/svelte)

## What's inside

```
svelte/
├── SKILL.md                              # entry point Claude/Cursor reads
├── references/
│   ├── accessibility.md                  # compiler a11y warnings, accessible Button/Modal/Form/Nav with runes
│   ├── performance.md                    # enhanced-img, prerender/SSR, preload-data, $effect discipline
│   ├── component-and-code-standards.md   # SvelteKit structure, $lib alias, runes conventions, typing
│   └── testing-and-tooling.md            # ESLint, svelte-check, Testing Library, Playwright, Lighthouse CI
└── assets/
    └── RULES.md                          # the enforceable rule file installed into your project
```

## Install

```bash
npx frontend-standard-skills add svelte
# or
pnpm dlx frontend-standard-skills add svelte
yarn dlx frontend-standard-skills add svelte
```

This writes:
- `.claude/skills/svelte/` — the full skill, usable in Claude Code / claude.ai
- `.cursor/rules/svelte-frontend-standards.mdc` — Cursor rule
- A section in `CLAUDE.md` and `AGENTS.md`

Or install as a Claude Code plugin:
```
/plugin marketplace add abayomijohn273/frontend_standard_skills
/plugin install svelte
```

## Example usage

> "Review this new `src/routes/dashboard/+page.svelte` — should this state be `$derived` instead of an `$effect`, and does the image handling meet our Core Web Vitals standards?"

> "Set up an accessible modal component in `$lib/components/ui/Modal.svelte` following our standards, using `bind:this` for focus management."

See the [root README](../../README.md) for every install method and the full list of stacks.
