# Silegal — Pengelola Kontrak & Insertion Order

<img width="1918" height="680" alt="image" src="https://raw.githubusercontent.com/adhityacl/NEW-CLM/refs/heads/main/preview.png" />

A multi-tenant Contract Lifecycle Management (CLM) application: contract, partner, Insertion Order (IO), and Due Diligence management with role-based access control (RBAC) and AI-assisted document workflows.

## Features

- **Contract, Partner & IO Management** — full CRUD with multi-tenant (organization) and multi-department scoping.
- **WYSIWYG Contract Creator** — [TipTap](https://tiptap.dev/)-based editor with fillable-slot fields, a saved-template library, a document preview, and DOCX export.
- **RBAC** — 5-role permission engine (Superuser / Admin / Manager / Editor / Viewer) with tenant + department scope enforcement (`server/rbac.ts`), plus a System Admin / Organization Admin console.
- **AI-assisted workflows** — Google Gemini (`@google/genai`) for document parsing (contracts/partners/IOs), Due Diligence note generation, redline analysis, and a Google Search–grounded dashboard news ticker.
- **Google Workspace integration** — Drive folder provisioning and Sheets sync via `googleapis`, with Google Sign-In (Firebase Auth client SDK, scoped to Drive/Sheets) layered alongside the app's own session system.
- **Notifications & activity log** — notice-period tracking and an audit trail of user actions.

## Tech Stack

**Frontend**
- [React 19](https://react.dev/) + TypeScript, built with [Vite 6](https://vite.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`)
- Component primitives from [Radix UI](https://www.radix-ui.com/) (`radix-ui`), styled shadcn/ui-style (`class-variance-authority`, `tailwind-merge`) — see `src/components/ui/`
- [TipTap](https://tiptap.dev/) rich-text editor (Contract Creator)
- [Recharts](https://recharts.org/) (dashboard charts), [Lucide](https://lucide.dev/) (icons)
- [react-day-picker](https://daypicker.dev/) + [date-fns](https://date-fns.org/) (date pickers), [react-markdown](https://github.com/remarkjs/react-markdown)
- [TanStack Query](https://tanstack.com/query)

**Backend**
- [Express](https://expressjs.com/) + TypeScript, run directly with [tsx](https://tsx.is/) in development; Vite is mounted in middleware mode inside the same Express process (one server, one port — see `server.ts`)
- [Better Auth](https://www.better-auth.com/) (`better-auth`, `@better-auth/cli`, `@better-auth/infra`) for authentication, sessions, and organizations/teams, backed by SQLite (`better-sqlite3`, `auth.db`)
- A custom RBAC engine (`server/rbac.ts`) layered on top of Better Auth's roles, enforcing tenant + department scope
- [Google Gen AI SDK](https://github.com/googleapis/js-genai) (`@google/genai`) for Gemini calls, including Google Search–grounded generation
- [googleapis](https://github.com/googleapis/google-api-nodejs-client) for Drive/Sheets integration
- `docx`, `pdf-lib`, `pdf-parse`, `multer` for document generation, parsing, and uploads
- `nodemailer` for outbound email (invitations, notifications)

**Data storage**
- SQLite (`auth.db`) — users, sessions, organizations, teams/departments (Better Auth's own tables)
- A JSON file store (`data_store.json`) — contracts, partners, insertion orders, spendings, evaluations, notifications, activity logs, saved templates, and app settings

**Testing**
- Node's built-in test runner (`node:test`) for the RBAC permission-matrix unit tests (`tests/rbac.test.ts`)
- [Playwright](https://playwright.dev/) for browser/e2e tests (`tests/e2e/`)

## Prerequisites

- Node.js v20.19 or higher (v22 LTS recommended — see `.nvmrc`). Older versions crash at startup: the PDF parser needs `process.getBuiltinModule`.
- `npm`

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd NEW-CLM
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment variables

Copy `.env.example` to `.env` and fill in the values you need:

```env
# Gemini (AI-assisted parsing, DD notes, redline analysis, news ticker)
GEMINI_API_KEY=

# Better Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=

# Google OAuth & service account (Drive/Sheets integration, Google Sign-In)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_SERVICE_ACCOUNT_KEY=
GOOGLE_PROJECT_ID=
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_APPLICATION_CREDENTIALS=
```

Most of these can also be set later from the in-app Settings screens; `GEMINI_API_KEY` and the Better Auth variables are the minimum needed to sign in and use AI features.

### 4. Run the development server

```bash
npm run dev
```

This starts a single Express server (with Vite mounted in middleware mode for the frontend) on **http://localhost:3000**.

On first start the server creates `auth.db` (including the Better Auth tables — no `auth:migrate` step needed) and `data_store.json`, and seeds a superuser account:


Change this password right after your first sign-in. For local use, set `BETTER_AUTH_URL=http://localhost:3000`.

## Testing

```bash
npm run test:rbac   # RBAC permission-matrix unit tests (server/rbac.ts)
npm run test:e2e     # Playwright browser tests — run `npx playwright install` once first
```

## Build for Production

```bash
npm run build
```

This builds the frontend with Vite and bundles `server.ts` with esbuild into `dist/server.cjs`.

To start the production build:

```bash
npm start
```

## License

MIT
