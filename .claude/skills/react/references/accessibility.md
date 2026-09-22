# Accessibility — React

Applies the WCAG 2.1 AA rules from `core-standards` inside plain React's component/hook model. There's no framework routing layer or Image component doing accessibility work for you here — every pattern below is something the app has to implement (or import) itself.

## Focus management with refs

React's declarative rendering doesn't move focus for you — anything that changes what's on screen without a full page navigation (opening a panel, submitting a form, client-side routing) needs an explicit `useRef` + `.focus()` call.

- On route change (with React Router or similar), move focus to the new view's heading or main landmark so keyboard/screen-reader users aren't stranded on a stale link:
```tsx
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

function RouteAnnouncer() {
  const { pathname } = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [pathname]);

  return <h1 ref={headingRef} tabIndex={-1} className="visually-hidden">
    Page updated
  </h1>;
}
```
- Mark the active nav link with `aria-current="page"` (compare against `useLocation().pathname`), never with color/weight alone.

## `useId()` for label/aria associations

Hardcoded `id` strings break the moment a component is rendered more than once on a page (two `<SearchForm>`s means two `id="query"` elements — invalid HTML and broken label association). React's `useId()` generates a stable, unique-per-instance id, so every reusable component can wire up its own labels/`aria-describedby` safely.

**Bad — hardcoded id breaks with more than one instance:**
```tsx
function TextField({ label }: { label: string }) {
  return (
    <>
      <label htmlFor="field">{label}</label>
      <input id="field" />
    </>
  );
}
```

**Good:**
```tsx
import { useId } from "react";

function TextField({ label, hint }: { label: string; hint?: string }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={hint ? hintId : undefined} />
      {hint && <span id={hintId} className="hint">{hint}</span>}
    </>
  );
}
```

## Accessible Button

```tsx
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean;
};

function Button({ isLoading, disabled, children, ...props }: ButtonProps) {
  return (
    <button {...props} disabled={disabled || isLoading} aria-busy={isLoading}>
      {isLoading && <Spinner aria-hidden="true" />}
      {children}
    </button>
  );
}
```
Icon-only usage still requires the consumer to pass `aria-label` — the shared component can't invent a meaningful name for an icon it doesn't control.

## Accessible Form

Validate on submit, associate errors, and move focus/announce on failure — don't rely on the browser's native validation UI alone, which is inconsistent across screen readers.

```tsx
import { useId, useState } from "react";

function SignupForm({ onSubmit }: { onSubmit: (email: string) => Promise<void> }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email") as string;
    if (!email.includes("@")) {
      setError("Enter a valid email address, e.g. name@example.com");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSubmit(email);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor={id}>Email</label>
      <input
        id={id}
        name="email"
        type="email"
        required
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <p id={`${id}-error`} role="alert">{error}</p>}
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Submitting…" : "Sign up"}
      </button>
    </form>
  );
}
```

## Modals and other complex widgets — don't hand-roll focus trapping

Focus trapping, `Escape`-to-close, background inertness, and restoring focus to the trigger are easy to get subtly wrong (an off-by-one in the tab-order calculation, a trap that doesn't account for dynamically added children). Prefer a maintained headless primitive over a hand-rolled `useEffect` + `keydown` listener:

- **[Radix UI](https://www.radix-ui.com/primitives)** (`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, etc.) — unstyled, accessible-by-default primitives for dialogs, popovers, comboboxes, tooltips.
- **[React Aria](https://react-spectrum.adobe.com/react-aria/)** (Adobe) — hook-based primitives (`useDialog`, `useButton`, `useCombobox`) for teams that want to own the markup fully.

```tsx
import * as Dialog from "@radix-ui/react-dialog";

function ConfirmDialog({ open, onOpenChange, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          <Dialog.Title>Delete this item?</Dialog.Title>
          <button onClick={onConfirm}>Delete</button>
          <Dialog.Close asChild>
            <button aria-label="Cancel">Cancel</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```
Radix handles focus trap, `role="dialog"`/`aria-modal`, `Escape`, and focus restore out of the box — that's the point of not hand-rolling it. A hand-rolled modal is acceptable only when the primitive genuinely can't fit the design; in that case still implement every requirement in `core-standards/references/accessibility.md` #7 (Modal / Dialog).

## Accessible Nav

```tsx
import { useState, useId } from "react";
import { NavLink } from "react-router-dom";

function MobileNav({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <nav aria-label="Primary">
      <button
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        Menu
      </button>
      <ul id={menuId} hidden={!open}>
        {links.map((link) => (
          <li key={link.href}>
            <NavLink to={link.href} aria-current={({ isActive }: any) => isActive ? "page" : undefined}>
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

## Linting

```bash
npm install --save-dev eslint-plugin-jsx-a11y
```
```js
// eslint.config.js
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  {
    plugins: { "jsx-a11y": jsxA11y },
    rules: { ...jsxA11y.configs.recommended.rules },
  },
];
```
Treat `jsx-a11y` violations as build-breaking in CI, and don't disable individual rules without a specific, documented reason — see `references/testing-and-tooling.md` for the full ESLint setup.
