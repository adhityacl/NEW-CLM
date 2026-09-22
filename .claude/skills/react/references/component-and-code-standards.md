# Component & Code Standards — React

## Folder structure

```
src/
  main.tsx                   # entry point, ReactDOM.createRoot
  App.tsx                    # root component, top-level routing/providers

  components/
    ui/                       # shared, feature-agnostic components (Button, Modal, Input…)

  features/
    checkout/                 # one folder per feature/domain
      components/             # components used only within this feature
      hooks/                  # feature-specific hooks
      api/                    # feature-specific data-fetching
      types.ts
      utils.ts

  hooks/                       # shared, cross-feature custom hooks
  lib/                         # shared utilities, formatting, validation, API clients
  types/                       # shared TypeScript types
  styles/                      # global styles, design tokens
```

- Shared, feature-agnostic UI lives in `src/components/ui`; anything specific to one feature lives in `src/features/<feature>`. Dependency direction is one-way: features import from `components/ui`/`hooks`/`lib`, never the reverse.
- Colocate a feature's own tests beside its source; promote a component to `components/ui/` the moment a second feature needs it (DRY — see `core-standards/references/code-quality-style.md`).

## File naming — the PascalCase exception

`core-standards` sets `camelCase` as the general file-naming rule (`formatDate.ts`, `useDebounce.ts`). React components are the deliberate, documented exception:

- **Component files**: `PascalCase.tsx`, matching the exported component name exactly (`ProductCard.tsx` exports `ProductCard`). This makes a component importable/findable by name at a glance, and matches the convention the wider React ecosystem (and most linters/IDEs) already expects.
- **Custom hooks**: `camelCase.ts`, always starting with `use` (`useDebounce.ts`, `useLocalStorage.ts`) — hooks are functions, not components, so they follow the general file-naming rule, not the component exception.
- **Everything else** (`lib/`, `utils/`, `types/`, non-component helpers): `camelCase.ts`, per the general rule.

**Bad:**
```
src/components/ui/button.tsx        // component file not PascalCase
src/hooks/UseDebounce.ts            // hook file wrongly PascalCase
```

**Good:**
```
src/components/ui/Button.tsx
src/hooks/useDebounce.ts
```

## Custom hook conventions

- Always prefixed `use` — this is what lets React's linter (`eslint-plugin-react-hooks`) and other hooks correctly apply the Rules of Hooks to your function.
- **One concern per hook.** A hook named `useUser` that also manages a modal's open state is two hooks pretending to be one — split them.
- Return a small, stable shape — either a tuple (`[value, setValue]`, mirroring `useState`) for one or two closely related values, or a plain object for anything larger. Don't return a shifting set of keys depending on internal state; callers should be able to destructure predictably.

**Bad — hook doing two unrelated things, awkward return shape:**
```tsx
function useUserAndModal(userId: string) {
  const [user, setUser] = useState<User | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => { fetchUser(userId).then(setUser); }, [userId]);
  return modalOpen ? { user, modalOpen, setModalOpen } : { user };
}
```

**Good — split, predictable shape:**
```tsx
function useUser(userId: string) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    setStatus("loading");
    fetchUser(userId)
      .then((u) => { setUser(u); setStatus("idle"); })
      .catch(() => setStatus("error"));
  }, [userId]);

  return { user, status };
}

function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
}
```

## Typing

- `strict: true` in `tsconfig.json`. No `any` — use `unknown` and narrow, or a proper generic.
- Every component has an explicit, named prop interface — never inline, untyped destructuring for anything beyond one or two trivial props:
```tsx
interface ProductCardProps {
  product: Product;
  onAddToCart: (productId: string) => void;
  variant?: "default" | "compact";
}

function ProductCard({ product, onAddToCart, variant = "default" }: ProductCardProps) {
  /* ... */
}
```
- **Discriminated unions for status-like state**, instead of a pile of optional booleans that can represent impossible combinations:

**Bad — booleans can be simultaneously true, representing an invalid state:**
```tsx
interface FetchState {
  isLoading: boolean;
  isError: boolean;
  data?: Product;
  error?: string;
}
```

**Good — only one state is representable at a time:**
```tsx
type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: Product }
  | { status: "error"; error: string };

function ProductView({ state }: { state: FetchState }) {
  switch (state.status) {
    case "idle": return null;
    case "loading": return <Spinner />;
    case "error": return <ErrorMessage message={state.error} />;
    case "success": return <ProductCard product={state.data} onAddToCart={add} />;
  }
}
```

## State management: choosing the right layer

Reach for the least powerful tool that solves the problem — each step up this list adds indirection and re-render surface area, so justify moving up it.

1. **Local `useState`/`useReducer`** — default choice. If only one component (and its direct children via props) needs the state, keep it there.
2. **Lifted state** — when two sibling components need to share/coordinate state, lift it to their nearest common parent and pass down via props. Stop lifting the moment it's no longer needed higher — don't lift "just in case."
3. **Context** — for state that's genuinely global-ish but changes infrequently (theme, authenticated user, locale). Context re-renders every consumer on every value change, so avoid putting frequently-changing state (e.g. form input values, live search text) directly in a context value.
4. **External store (Zustand, Redux, Jotai)** — when state is both shared across distant parts of the tree *and* updates frequently, where Context's re-render-everything model becomes a real cost. Also reach for one when the update logic itself is complex enough to benefit from a reducer-style, testable-outside-React store.

**Bad — high-frequency search input state lifted into Context, re-rendering the entire app tree on every keystroke:**
```tsx
const SearchContext = createContext<{ query: string; setQuery: (q: string) => void }>(null!);
// every consumer of SearchContext re-renders on every keystroke
```

**Good — local state where it's actually used, lifted only as far as the consumers that need it:**
```tsx
function SearchBar({ onQueryChange }: { onQueryChange: (q: string) => void }) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => onQueryChange(query), 300); // debounced
    return () => clearTimeout(id);
  }, [query, onQueryChange]);
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

## Anti-patterns

- **Prop drilling** — passing a prop through three or more intermediate components that don't use it themselves, just to reach a deeply nested consumer. Use Context or an external store instead once it hits that depth.
- **Derived state duplicated in `useState` + `useEffect`** instead of computed during render. This is one of the most common React anti-patterns and a direct source of extra renders and stale-state bugs:

**Bad:**
```tsx
function Cart({ items }: { items: CartItem[] }) {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    setTotal(items.reduce((sum, i) => sum + i.price * i.qty, 0));
  }, [items]);
  return <p>Total: {total}</p>;
}
```

**Good — computed directly during render, no extra state, no extra render cycle:**
```tsx
function Cart({ items }: { items: CartItem[] }) {
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  return <p>Total: {total}</p>;
}
```
Reach for `useMemo` around the computation only if profiling shows it's actually expensive — see `references/performance.md`.
