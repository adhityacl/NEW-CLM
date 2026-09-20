# UI Refresh — shadcn design standard (handoff)

Branch: `feat/shadcn-ui-refresh` (from `main` @ `6be4b64`)

## 1. What changed

| Area | Change |
|------|--------|
| Design tokens | New `src/styles/shadcn-tokens.css` implementing the shadcn / shadcn-svelte token contract (`--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--ring`, `--radius`, `--sidebar-*`, `--chart-*`) for light **and** dark. Brand accent (LINE green `#06C755`) is mapped to `--primary`, so the identity is unchanged. |
| Loading | `src/main.tsx` imports the token layer after `index.css` (additive; `index.css` untouched). |
| Primitives | Added `input`, `label`, `alert`, `tabs`, `table`, `select`, `skeleton` under `src/components/ui/` following shadcn composition. All are token-driven (no hard-coded colors). |
| CLI config | Added `components.json` so the shadcn CLI can add/update components consistently. |
| Sign-in | `src/components/SignInForm.tsx` refactored onto `Button`/`Input`/`Label`/`Alert` + tokens; behaviour and auth calls unchanged. |
| Cleanup | See `REMOVAL-INVENTORY.md`. |

## 2. How to run

```bash
npm install
cp .env.example .env      # fill GEMINI_API_KEY, BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_*
npm run dev               # http://localhost:3000  (Vite mounted as Express middleware)
```

Type check / build:

```bash
npm run lint              # tsc --noEmit
npm run build             # vite build + esbuild server bundle
```

## 3. Enabling Tailwind utility aliases (optional, recommended)

The primitives use `bg-[var(--card)]`-style arbitrary values so they work with **zero** changes to `index.css`. If you also want the short shadcn utility names (`bg-background`, `text-muted-foreground`, …) for future CLI components, paste this into `src/index.css` (next to the existing `@theme` block):

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
  --radius-md: var(--radius-md);
  --radius-sm: var(--radius-sm);
}
```

## 4. Verification status (honest)

| Item | Status |
|------|--------|
| Source-level consistency (single token source, no one-off colors in touched files) | ✅ done |
| Build / `tsc` pass | ⚠️ **not run** — no local clone in this environment (private repo, no git credentials here). Run `npm run lint && npm run build` before merging. |
| Visual regression on the deployed preview | ⚠️ blocked — the Codespaces dev server serves its own working tree; pushing this branch does not hot-reload it. |
| Backend / API behaviour | ✅ untouched |

## 5. Rollback

- This branch is additive: revert the merge commit, or `git checkout main` — no data/DB changes were made.
- Runtime files committed on `main` that should be git-ignored and rotated: `credentials.json`, `cookies.txt`, `auth.db*`, `data_store.json`.

## 6. Recommended follow-ups

1. Migrate `Sidebar`, `Header`, and the table views (Contracts/IO/Partners) to the new primitives. Replace the remaining hard-coded `#06C755` / `slate-*` classes with tokens.
2. Fix the post-login `401`s on `/api/tenants`, `/api/branding`, `/api/user/my-role` (see QC report, defect **D1**).
3. Complete the EN translation dictionary (defect **D2**).
4. Remove the `index.css` “Focus Mode” positional selectors (removal item **B1**).
