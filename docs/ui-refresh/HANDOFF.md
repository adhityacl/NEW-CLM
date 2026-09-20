# Handoff — UI refresh (shadcn standard) + live QC

**Repo:** `adhityacl/NEW-CLM`
**Branch:** `feat/shadcn-ui-refresh` — **PR #2** → https://github.com/adhityacl/NEW-CLM/pull/2
**Base:** `main` @ `6be4b64`
**QC target:** https://automatic-umbrella-pw96gr5vjgp36j49-3000.app.github.dev/ (serves `main`)

> ✅ These are **two different codebases**: the QC describes the deployed preview (`main`), while the
> branch carries the UI changes. The branch was **not rendered anywhere** (see §4).

---

## 1. What was done

### A. UI refresh (branch `feat/shadcn-ui-refresh`)
| Area | Change |
|---|---|
| Token layer | New `src/styles/shadcn-tokens.css` — shadcn token contract, light + dark (`--background`, `--foreground`, `--card`, `--primary`, … `--border`, `--input`, `--ring`, `--sidebar-*`, `--chart-*`). Brand accent **#06C755** → `--primary`. Only `--radius` is introduced (+ a **non-colliding** `--shadcn-radius-*` scale) so Tailwind's global `--radius-sm/-md/-lg/-xl` namespace is never overridden. |
| Loading | `src/main.tsx` imports the token layer after `index.css` (additive; `index.css` untouched). |
| Primitives | Added `input`, `label`, `alert`, `tabs`, `table`, `select`, `skeleton` under `src/components/ui/` (token-driven, no hard-coded colors). |
| Button | `src/components/ui/button.tsx` migrated from hard-coded hex/slate/rose to tokens. Variant/size API unchanged, so all call sites keep working. |
| CLI config | `components.json` uses the **React** shadcn schema (`ui.shadcn.com`) — this is a React + Vite app, so the *shadcn-svelte design standard* is applied, not the Svelte runtime. |
| Sign-in | `src/components/SignInForm.tsx` refactored onto `Button/Input/Label/Alert` + tokens; behaviour unchanged. |
| Cleanup | `docs/ui-refresh/REMOVAL-INVENTORY.md`. |

### B. Live QC
Full report: `QC-Report-LMS.html` / `QC-Report-LMS.md` / `Laporan-QC-LMS.docx`.

---

## 2. How to run locally

```bash
git fetch origin && git checkout feat/shadcn-ui-refresh
npm install
cp .env.example .env      # GEMINI_API_KEY, BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_*
npm run dev               # http://localhost:3000
npm run lint              # tsc --noEmit
npm run build
```

---

## 3. Verification status (honest)

| Item | Status |
|---|---|
| Source consistency (single token source; no one-off colors in touched files) | ✅ done |
| **Build / `tsc` pass** | ⚠️ **NOT run** — no local clone (private repo, no git credentials in the agent env). Risk: `tsconfig.json` does not enable `strict`, but the changed files are simple; run `npm run lint && npm run build` before merge. |
| **Visual render of the branch** | ⚠️ **NOT produced.** The Codespaces dev server serves its own tree; pushing does not hot-reload it. The design reference (`UI-Refresh-Prototype.html`) is a static mock, not the branch output. |
| Live QC with the provided account | ✅ done (login, navigation, create→persist→retrieve→delete, 4xx capture) |
| Backend / API / DB behaviour | ✅ untouched |

---

## 4. How to revert

- Revert PR #2 / `git checkout main` — additive; no DB migration, no data change.
- Only behavioural edit is presentation in `SignInForm.tsx` / token classes in `button.tsx`.

---

## 5. Independent review (verdict summary)

An adversarial review of this bundle confirmed **D2**; confirmed **D1** as a 401 defect but corrected the count/timing; judged **D3** half-confirmed; flagged **D4/D7** as lacking log evidence (they rest on browser a11y/network snapshots, now cited); and raised three branch code risks that have since been fixed: the `--radius-*` namespace clash, the stale svelte-schema `components.json`, and the hard-coded `Button` colors.

---

## 6. Recommended follow-ups (priority)

1. **D1 (High)** — fix `401` on `/api/tenants`, `/api/branding`, `/api/user/my-role` (server-side).
2. Run `npm run lint && npm run build` on the branch; render it (Codespaces/`npm run dev`) and capture real after-screenshots.
3. Remove the `index.css` “Focus Mode” positional `display:none` selectors (removal item **B1**).
4. Complete the EN dictionary; pick one default locale (**D2**).
5. Migrate `Sidebar`, `Header`, Contracts/IO/Partners tables to the primitives.
6. Clean nav text; render one of table/card-list, not both (**D3 / D7**).
7. **Security:** stop committing `credentials.json`, `cookies.txt`, `auth.db*`, `data_store.json`; add to `.gitignore` and rotate.

---

## 7. Deliverables map

| File | Purpose |
|---|---|
| `UI-Refresh-Prototype.html` | Design reference — tokens, component gallery, before/after |
| `QC-Report-LMS.html` / `.md` | QC report + defect table + evidence |
| `Laporan-QC-LMS.docx` | QC report (Word) |
| `HANDOFF.md` | This document |
| `assets/*.png` | “Before” screenshots from the live preview |
