# React — Frontend Standards Skill

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![WCAG 2.1 AA](https://img.shields.io/badge/WCAG-2.1%20AA-2E7D32?style=for-the-badge)

Enforceable accessibility, performance, and code-quality standards for plain React projects (Vite, Create React App, or any non-meta-framework setup) — hook discipline, manual image/code-splitting best practices, and Core Web Vitals thresholds.

- **Docs:** [react.dev](https://react.dev) · [API reference](https://react.dev/reference/react)
- **Source:** [github.com/facebook/react](https://github.com/facebook/react)

## What's inside

```
react/
├── SKILL.md                              # entry point Claude/Cursor reads
├── references/
│   ├── accessibility.md                  # focus with refs, useId(), accessible Button/Modal/Form/Nav, headless primitives
│   ├── performance.md                    # React.lazy/Suspense, memoization trade-offs, virtualization, manual image handling
│   ├── component-and-code-standards.md   # folder structure, file naming, hook conventions, typing, state management
│   └── testing-and-tooling.md            # ESLint, Testing Library, Playwright, Lighthouse CI on a real build
└── assets/
    └── RULES.md                          # the enforceable rule file installed into your project
```

## Install

```bash
npx frontend-standard-skills add react
# or
pnpm dlx frontend-standard-skills add react
yarn dlx frontend-standard-skills add react
```

This writes:
- `.claude/skills/react/` — the full skill, usable in Claude Code / claude.ai
- `.cursor/rules/react-frontend-standards.mdc` — Cursor rule
- A section in `CLAUDE.md` and `AGENTS.md`

Or install as a Claude Code plugin:
```
/plugin marketplace add abayomijohn273/frontend_standard_skills
/plugin install react
```

## Example usage

> "Review this new `ProductGallery` component — is the `useMemo`/`useCallback` usage actually helping, and does the image handling meet our Core Web Vitals standards?"

> "Build an accessible `ConfirmDialog` component using Radix UI, following our accessibility standards, with a Vitest + Testing Library test for it."

See the [root README](../../README.md) for every install method and the full list of stacks.
