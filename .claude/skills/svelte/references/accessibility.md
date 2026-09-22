# Accessibility — Svelte

Applies the WCAG 2.1 AA rules from `core-standards` on top of the one advantage Svelte has that other frameworks don't: **the compiler itself checks accessibility at build time.**

## The compiler's `a11y_*` warnings are not optional

Svelte's compiler statically analyzes template markup and emits warnings like `a11y_missing_attribute` (missing `alt`), `a11y_click_events_have_key_events` (a `onclick` on a non-interactive element with no keyboard handler), `a11y_no_noninteractive_element_interactions`, `a11y_label_has_associated_control`, `a11y_aria_props`, and more. Treat every one of these as **build-breaking**, not advisory noise:

- Never suppress with `<!-- svelte-ignore a11y_click_events_have_key_events -->` to make a warning disappear — fix the underlying markup (use a `<button>`, add the missing attribute) unless there's a specific, documented reason the warning is a false positive for that exact case.
- Run `svelte-check` in CI (see `references/testing-and-tooling.md`) so these warnings fail the build the same way a TypeScript error would — a warning that only shows up in a developer's terminal during `vite dev` gets ignored in practice.

**Bad — suppresses the warning instead of fixing it:**
```svelte
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="card" onclick={() => selectItem(item.id)}>
  {item.name}
</div>
```

**Good — real interactive element, warning has nothing to flag:**
```svelte
<button class="card" onclick={() => selectItem(item.id)}>
  {item.name}
</button>
```

## Accessible Button

```svelte
<script lang="ts">
  interface Props {
    label: string;
    loading?: boolean;
    variant?: "primary" | "danger";
    onclick?: () => void;
  }
  let { label, loading = false, variant = "primary", onclick }: Props = $props();
</script>

<button
  class="btn btn-{variant}"
  disabled={loading}
  aria-busy={loading}
  onclick={onclick}
>
  {#if loading}
    <span class="spinner" aria-hidden="true"></span>
  {/if}
  {label}
</button>
```
Icon-only buttons still need `aria-label` — the compiler's `a11y_consider_explicit_label` warning will flag an icon-only `<button>` with no accessible name.

## Accessible Modal — use `bind:this` for focus, but prefer a maintained primitive

Focus trapping is easy to get subtly wrong by hand (tab order edge cases, `inert` background content, restoring focus correctly on every close path). Prefer a well-maintained headless component library — **Melt UI** or **Bits UI** — for dialogs, comboboxes, and other complex widgets, the same way `core-standards` recommends Radix/React Aria for React. Reach for a hand-rolled modal only for the simplest cases, and even then implement the full pattern:

```svelte
<script lang="ts">
  interface Props {
    open: boolean;
    titleId: string;
    onclose: () => void;
    children: import("svelte").Snippet;
  }
  let { open, titleId, onclose, children }: Props = $props();
  let dialogEl: HTMLDivElement | undefined = $state();
  let triggerEl: HTMLElement | null = null;

  $effect(() => {
    if (open) {
      triggerEl = document.activeElement as HTMLElement;
      dialogEl?.focus();
    } else {
      triggerEl?.focus();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

{#if open}
  <div
    bind:this={dialogEl}
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    onkeydown={handleKeydown}
  >
    {@render children()}
  </div>
{/if}
```
`bind:this` gives a direct element reference for imperative focus management — the Svelte equivalent of a React `ref` — used here to move focus into the dialog on open and restore it to the trigger on close. This still omits a real focus trap (`Tab` cycling within the dialog); that's exactly the part worth getting from Melt UI/Bits UI rather than hand-rolling.

## Forms

- Real `<label for>` bound to the input's `id`; error text linked with `aria-describedby` and `aria-invalid`:
```svelte
<script lang="ts">
  let email = $state("");
  let error = $derived(email && !email.includes("@") ? "Enter a valid email address" : "");
</script>

<label for="email">Email</label>
<input
  id="email"
  type="email"
  bind:value={email}
  aria-invalid={!!error}
  aria-describedby={error ? "email-error" : undefined}
/>
{#if error}
  <p id="email-error" role="alert">{error}</p>
{/if}
```
- Validate on the server too (in the corresponding `+page.server.ts` `actions`) — never trust `bind:value` client-only validation.

## Navigation

- Mark the active link with `aria-current="page"` by comparing against SvelteKit's `page.url.pathname` (from `$app/state` in SvelteKit 2+, or `$app/stores`'s `$page` on older versions) — never with color/weight alone.
- Move focus to the page's main heading or `<main>` on client-side navigation for screen-reader/keyboard users, since SvelteKit's client-side router doesn't trigger a full page load:
```svelte
<script lang="ts">
  import { page } from "$app/state";
  let mainEl: HTMLElement | undefined = $state();
  $effect(() => {
    page.url.pathname; // re-run when the route changes
    mainEl?.focus();
  });
</script>
<main bind:this={mainEl} tabindex="-1">
  {@render children()}
</main>
```

## `svelte-check` in CI

`svelte-check` type-checks `.svelte` files and surfaces every compiler warning, including all `a11y_*` ones, outside of the dev server:
```bash
npx svelte-check --tsconfig ./tsconfig.json
```
Wire it into CI as a required, build-breaking step (see `references/testing-and-tooling.md`) — it's the mechanism that actually enforces "no new a11y warnings" instead of relying on developers noticing terminal output locally.
