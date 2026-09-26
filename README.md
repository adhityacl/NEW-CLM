# Silegal — Contract & Insertion Order Management

Silegal is a multi-tenant Contract Lifecycle Management (CLM) application. It manages contracts, partners, Insertion Orders (IOs) and Due Diligence, with role-based access control (RBAC), a WYSIWYG contract creator with drafts and redlining, and AI-assisted document workflows.

- [Features](#features)
- [What's new](#whats-new)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Local development](#local-development)
- [Configuration reference](#configuration-reference)
- [Google integration](#google-integration)
- [Testing](#testing)
- [Deploying to a new server](#deploying-to-a-new-server)
- [Moving an existing installation to a new server](#moving-an-existing-installation-to-a-new-server)
- [Backups and updates](#backups-and-updates)
- [Troubleshooting](#troubleshooting)

## Features

**Contracts, partners and IOs**
- Full CRUD for contracts, partners, Insertion Orders, spendings and partner evaluations, scoped per organization (tenant) and department.
- Notice-period tracking, expiry/renewal status, notifications and an activity log.
- Bulk import, Due Diligence checklists driven by per-country policy packs, and a dashboard with charts.

**Contract Creator** (sidebar → *Create Contract*)
- **Document explorer**: the page opens on *My Documents*. You can search by name or metadata value, filter by status, type, creator, created date or a metadata field, sort by any column, and page through results 25/50/100 at a time. Each row has quick actions for open, rename, archive and delete.
- **Editor**: a [TipTap](https://tiptap.dev/) editor with fillable-slot fields, partner auto-fill, a template library, a preview and Word (`.doc`) export.
- **Drafts and versions**: documents autosave every 30 seconds. They also save on Ctrl/Cmd+S, when you go back to the explorer, when you navigate elsewhere in the app, and when you close the tab. The header shows *Draft vN · Last saved X ago by Y* and an unsaved-changes marker. The *History* tab lists every version, and you can view, compare (paragraph diff), restore, or name and label any of them.
- **Metadata**: the creator, last modifier and their timestamps are recorded automatically. Organization admins define custom fields (text, select, date, multi-select), which you fill in from the *Info* tab and can search and filter in the explorer.
- **Redlining**: select text, then add a comment or suggest a change. A suggested change shows the original text struck through and the proposed text underlined. You can reply in threads, accept, reject or resolve items one at a time or in bulk, and see a change summary and redline history. *Download with Redlines* exports a `.doc` file with the markup and a comments appendix.

**Access control**
- Five roles (Superuser, Admin, Manager, Editor, Viewer) with tenant and department scope enforcement (`server/rbac.ts`).
- System Admin and Organization Admin consoles for users, invitations, departments, sessions and the RBAC matrix.

**AI and integrations**
- Google Gemini (`@google/genai`) for contract, partner and IO parsing, Due Diligence notes, redline analysis and a search-grounded news ticker.
- Google Drive folder provisioning and Sheets sync. The Google credentials can be uploaded as JSON files in the app instead of being placed in `.env` (see [Google integration](#google-integration)).
- SMTP e-mail for invitations and notifications, configured in Settings.
- English and Bahasa Indonesia UI, with in-app text overrides.

## What's new

**September 2026**
- **Contract Creator**: added the document explorer, autosaved drafts with version history, diff and restore, document metadata with organization custom fields, and redlining (comments, suggested changes, accept/reject, redline export). The data is stored in new SQLite tables that are created automatically on start.
- **Google credentials without `.env`**: a Superuser can upload the service account and OAuth client JSON files from the first-login banner (*Connect Google*) or from Settings. Uploaded files take priority over the `GOOGLE_*` variables and apply without a restart.
- **Fix**: `.env` is now loaded before any module reads it. Previously `BETTER_AUTH_SECRET` and the Google OAuth values were read before `.env` was loaded, so development silently used an insecure secret and production crashed at startup even with a correct `.env`.
- **Fix**: the bootstrap Superuser's login now works on any host without editing `.env`. `BETTER_AUTH_URL`/`TRUSTED_ORIGINS` were previously required to match the exact deploy domain or login would fail; they're now optional overrides, since the app trusts whatever host/scheme each request actually arrives on. The bootstrap account's password is also now kept in sync with `DEMO_ADMIN_PASSWORD` on every restart (while `SEED_DEMO_ADMIN` isn't `false`), instead of only on first creation.
- **Fix**: login no longer fails with "Invalid origin" on Cloud Run (or similar managed proxies) that present the container with an internal `Host` different from the public `*.run.app` URL. The origin check now also accepts the real host from `X-Forwarded-Host`, and Express trusts proxy headers (`app.set("trust proxy", true)`) so `req.ip`/`req.protocol` are correct behind one too.
- **Fix**: `npm install` no longer force-rebuilds `better-sqlite3` from source. That `postinstall` step needed a full native build toolchain (Python, a C/C++ compiler); minimal environments without one — e.g. Google Cloud's build images — failed to install at all, even though `better-sqlite3`'s own prebuilt binary already installs correctly on its own. Run `npm rebuild better-sqlite3` by hand only if you see a `NODE_MODULE_VERSION` error after upgrading Node (see Troubleshooting).
- **Security**: demo-workspace logins (`*@example.com`, which share `DEMO_ADMIN_PASSWORD`) are no longer created with `NODE_ENV=production`, are removed on start from production servers that already have them, and are deleted by an empty-workspace reset.
- **Security**: the SQLite browser in System Admin masks uploaded credentials. Its search no longer matches masked columns, which previously allowed their contents to be guessed from the number of results.
- **Plug-and-play install, no default credentials**: nothing in `.env` has to be filled in. The first visit to a new install shows a *Create admin account* page, the Google credentials are uploaded as JSON files, and the Gemini key and SMTP are set in Settings. The old shipped login (`admin@silegal.com` / `123456789`) no longer exists; installs upgraded from it keep working and still get a banner asking to change it.
- **Security**: users without a password are no longer given a shared default one on start (previously every such user, including invited colleagues, got `123456789`), and the first account registered on an empty install is no longer made an admin automatically.
- **Firebase removed**: "Sign in with Google" uses the OAuth Client JSON you upload in *Connect Google*, so there is no Firebase project or `firebase-applet-config.json` to configure. This also fixes a fresh install crashing on load with `auth/invalid-api-key`.
- **Fix**: production builds (`npm run build` / `npm start`) no longer render a blank page. A hand-written vendor chunk split made two bundles import each other, leaving React undefined; Vite's default chunking is used instead and first-load JavaScript is ~20% smaller.

**Earlier**
- Tenant policy packs, i18n and admin settings; hardened session authentication.
- SQLite became the single source of truth (`data_store.json` is only a one-time import source).

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI primitives (`src/components/ui/`), TipTap, Recharts, TanStack Query |
| Backend | Express and TypeScript in a single process (`server.ts`). In development Vite runs inside Express as middleware, so the app uses one server and one port. |
| Auth | Better Auth (sessions, organizations, teams) plus a custom RBAC engine (`server/rbac.ts`) |
| Data | SQLite via `better-sqlite3`, stored in one file: `auth.db` |
| Integrations | `@google/genai`, `googleapis`, Google Identity Services (Google Sign-In), `nodemailer`, `docx`, `pdf-lib`, `pdf-parse` |
| Tests | Node's built-in test runner (`node:test`) and Playwright |

## Project layout

```text
server.ts                    Express app: API routes, auth middleware, Vite/static serving
server/                      RBAC engine and routes, Better Auth CLI config
src/
  App.tsx, main.tsx          SPA entry
  components/                Views (ContractsView, ContractCreatorView, SettingsView, ...)
    documents/               Contract Creator explorer, history, info/metadata, comments panels
    settings/                Settings dialogs (Google credentials, reset workspace, ...)
    ui/                      Shared UI primitives
  context/                   Auth, language, tenant, toast and confirm providers
  lib/                       Shared logic (auth, Google clients, document model, TipTap extensions)
  server/                    Extra API routers (auth console, documents, Google credentials)
  i18n/                      Translation catalog additions (EN + ID)
tests/                       node:test suites and Playwright e2e (tests/e2e)
docs/                        Product requirements, RBAC documentation and audits
```

Runtime files are created next to `server.ts` and are **not** tracked by Git: `.env`, `auth.db` (plus `auth.db-wal` and `auth.db-shm`), `uploads/`, and the legacy `data_store.json`.

## Local development

Requirements: **Node.js 20.19 or newer** (22 LTS recommended; see `.nvmrc`) and npm. Older Node versions crash at startup because the PDF parser needs `process.getBuiltinModule`.

```bash
git clone <repository-url>
cd NEW-CLM
npm install
npm run dev
```

`npm install` creates `.env` from `.env.example` and generates a random `BETTER_AUTH_SECRET` automatically (via its `postinstall` script), so there's no `.env` to hand-edit for local development. Re-run it any time with `npm run setup` — it never touches `.env` once `BETTER_AUTH_SECRET` has a real value, so it's safe on an `.env` carried over from another server (see [Moving an existing installation to a new server](#moving-an-existing-installation-to-a-new-server)).

Open **http://localhost:3000**. On the very first visit you'll see *Create admin account*: enter your name, email and a password (8+ characters) and you're signed in as the Superuser. There are no default credentials.

On first start the server creates `auth.db` with all tables and loads a three-country demo workspace. Until the Google credential files are uploaded, a banner offers **Connect Google**. The Gemini key (AI features) and SMTP are set in Settings — nothing goes in `.env`.

## Configuration reference

All variables are read from `.env` in the working directory (see `.env.example`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | — | Set to `production` on servers. In production the app serves the built `dist/` and uses secure cookies, and requires `BETTER_AUTH_SECRET`. |
| `PORT` | `3000` | HTTP port. |
| `BETTER_AUTH_SECRET` | auto-generated | **Required in production.** `npm install`/`npm run setup` fills in a random value if it's still unset or the `.env.example` placeholder. Changing it signs everyone out. |
| `BETTER_AUTH_URL` | — | Optional: pins the app to one exact public URL, e.g. `https://clm.example.com`. Left unset, the app trusts whatever host/scheme each request actually arrives on (nginx's documented config forwards the real `Host` and `X-Forwarded-Proto`), so login works out of the box on localhost, a Codespace, or any deployed domain — nothing to update when the domain changes or the app moves to a new server. |
| `TRUSTED_ORIGINS` | — | Optional: additional trusted origins, comma separated — only needed for a genuinely separate origin, such as a standalone front-end domain. |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | — | Optional, for automated deploys: pre-creates the first Superuser instead of using the *Create admin account* page. Outside production the six demo-workspace users (`*@example.com`) get the same password. |
| `SEED_DEMO_ADMIN` | `true` | Only matters when `DEMO_ADMIN_*` are set: `false` stops re-applying them on start once your own admin exists. |
| `GEMINI_API_KEY` | — | Optional fallback; normally set in Settings → AI Model & Parser. |
| `GOOGLE_*` | — | Optional fallback; normally the JSON files are uploaded in *Connect Google*. |
| `ALLOW_GOOGLE_SELF_SIGNUP` | `false` | When `true`, any Google account can sign in and gets a user created automatically. Otherwise an administrator must invite the user first. |
| `BETTER_AUTH_ENABLE_INFRA` / `BETTER_AUTH_API_KEY` | — | Optional Better Auth Infra dashboard and Sentinel. |

## Google integration

Two JSON files from [Google Cloud Console](https://console.cloud.google.com/) power Drive and Sheets:

1. **Service account key**: IAM & Admin → Service Accounts → *account* → Keys → Add key → JSON. After uploading, share the Drive folder and the spreadsheet with the account's `client_email` as **Editor**.
2. **OAuth client**: APIs & Services → Credentials → OAuth 2.0 Client IDs → Download JSON. Its **Authorized JavaScript origins** must contain the exact URL the app runs on, including `http` vs `https` and the port (e.g. `https://clm.example.com`). The upload dialog warns you when it doesn't.

A Superuser uploads the files from **Connect Google** in the first-login banner, or from **Settings → Google & Database → Manage credential files**.

- Files are validated when uploaded: a file in the wrong slot or an unreadable private key is rejected.
- They are stored in `auth.db` (table `integration_credentials`) and take effect immediately.
- They take priority over `.env`. Removing an upload falls back to `.env`.
- Secret values are never sent back to the browser.

"Sign in with Google" on the login page uses the same uploaded OAuth client, so it works as soon as that file is uploaded and the domain is in its **Authorized JavaScript origins**. Google accounts must be invited first unless `ALLOW_GOOGLE_SELF_SIGNUP=true`.

## Testing

```bash
npm run lint              # TypeScript type check
npm test                  # all node:test suites below, plus demo-account cleanup
npm run test:rbac         # RBAC permission matrix
npm run test:documents    # Contract Creator API: drafts, explorer, metadata, comments (in-memory SQLite)
npm run test:credentials  # Google credential upload and priority over .env
npm run test:e2e          # Playwright browser tests (run `npx playwright install` once first)
```

## Deploying to a new server

The guide below assumes a Linux server (Ubuntu or Debian), a domain pointing at it, systemd, and nginx for HTTPS. The app is a single Node process listening on one port.

### 1. Install the prerequisites

```bash
# Node.js 22 (e.g. via nvm or NodeSource), then:
node -v   # must be v20.19+ (v22 recommended)
sudo apt install -y git nginx build-essential python3   # build tools compile better-sqlite3 if no prebuilt binary matches
sudo useradd --system --create-home --home-dir /opt/silegal silegal
```

### 2. Get the code and build it

```bash
sudo -u silegal git clone <repository-url> /opt/silegal/app
cd /opt/silegal/app
sudo -u silegal npm ci          # install ALL dependencies: do not use --omit=dev
sudo -u silegal npm run build   # dist/ (frontend) + dist/server.cjs
```

> The production bundle still loads `vite` at startup, and `vite` is a devDependency. `npm ci --omit=dev` therefore produces a server that crashes on start.

### 3. Create `.env`

There is nothing to fill in: `npm ci` already created `.env` with a random `BETTER_AUTH_SECRET` (its `postinstall` script). Just restrict its permissions:

```bash
sudo -u silegal chmod 600 .env
```

`NODE_ENV=production` comes from the service file in step 4, the admin account is created in the browser in step 6, and the Google credentials are uploaded there too.

### 4. Run it as a service

Create `/etc/systemd/system/silegal.service`:

```ini
[Unit]
Description=Silegal CLM
After=network.target

[Service]
User=silegal
WorkingDirectory=/opt/silegal/app
ExecStart=/usr/bin/env node dist/server.cjs
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

`WorkingDirectory` matters: `.env`, `auth.db` and `uploads/` are read from and written to the current directory.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now silegal
journalctl -u silegal -f        # wait for "Pengelola Kontrak & IO Server running on http://0.0.0.0:3000"
```

### 5. Put nginx and HTTPS in front

`/etc/nginx/sites-available/silegal`:

```nginx
server {
    server_name clm.example.com;
    client_max_body_size 30m;   # document uploads are limited to 30 MB by the app

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/silegal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d clm.example.com
```

Keep port 3000 closed to the internet; only nginx should reach it.

### 6. First-run checklist (in the browser)

1. Open `https://clm.example.com` and fill in **Create admin account** (it only appears while no admin exists — do this right after the site goes live).
2. **Remove the demo data**: Settings → Security & Maintenance → *Reset System Database* → *Start empty with my organization*. The reset signs you out; sign in again. (The demo login accounts are never created in production, and an empty-workspace reset also deletes them.)
3. **Connect Google** (banner or Settings): upload the two JSON files (see [Google integration](#google-integration)), and add `https://clm.example.com` to the OAuth client's **Authorized JavaScript origins**.
4. Optional: set the Gemini key (Settings → AI Model & Parser) and SMTP (Settings → Notification Recipients), and invite your users (Organization Admin → Invitations).

## Moving an existing installation to a new server

All application data lives in `auth.db`, including users, organizations, contracts, Contract Creator documents and uploaded Google credentials. Attachments live in `uploads/`.

1. Prepare the new server with steps 1–2 above.
2. On the **old** server, stop the app and take a consistent copy of the database:
   ```bash
   sudo systemctl stop silegal
   cd /opt/silegal/app
   node -e "require('better-sqlite3')('auth.db').backup('auth-migrate.db').then(() => console.log('ok'))"
   tar czf silegal-data.tgz auth-migrate.db uploads .env
   ```
3. Copy `silegal-data.tgz` to the new server and unpack it into `/opt/silegal/app`. Rename `auth-migrate.db` to `auth.db`, then run `chown -R silegal: .` and `chmod 600 .env`.
4. If the old `.env` pinned `BETTER_AUTH_URL`/`TRUSTED_ORIGINS` to the old domain, remove or update them (unset, the app just follows the new host). Keep the same `BETTER_AUTH_SECRET` so existing sessions stay valid; a new secret only signs everyone out. Users and credentials come with `auth.db`, so no setup page appears.
5. Continue with steps 4–5 above (service and nginx). New tables and columns are created automatically on start.
6. If the domain changed, add it to the Google OAuth client's **Authorized JavaScript origins**.

## Backups and updates

**Backup** (safe while the app is running, because it uses SQLite's online backup):

```bash
cd /opt/silegal/app
mkdir -p backups
node -e "require('better-sqlite3')('auth.db').backup('backups/auth-' + new Date().toISOString().slice(0,10) + '.db').then(() => console.log('ok'))"
tar czf backups/uploads-$(date +%F).tgz uploads
```

Do not copy `auth.db` with `cp` while the server runs: recent writes may still be in `auth.db-wal`. Store backups off the server. They contain password hashes and the uploaded Google keys.

**Update to a new version:**

```bash
cd /opt/silegal/app
sudo -u silegal git pull
sudo -u silegal npm ci
sudo -u silegal npm run build
sudo systemctl restart silegal
```

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `BETTER_AUTH_SECRET must be set in production` at startup | `.env` is missing, empty, or not in `WorkingDirectory`. Run `npm run setup` in that directory (it won't touch a real secret if one is already set), or set a long random value by hand. |
| `Cannot find module 'vite'` at startup | Dependencies were installed with `--omit=dev`. Run `npm ci` without it. |
| `better-sqlite3` / `NODE_MODULE_VERSION` error | Node was upgraded after installing. Run `npm rebuild better-sqlite3`. |
| Crash mentioning `process.getBuiltinModule` | Node is older than 20.19. Upgrade to Node 22. |
| Repeated `DECODER routines::unsupported` in the log | The service account private key in `.env` is malformed. Upload the service account JSON in the app, or fix/clear `GOOGLE_PRIVATE_KEY`. |
| Google popup fails with `origin_mismatch` / `redirect_uri_mismatch` | The app URL is not in the OAuth client's Authorized JavaScript origins. Add it, then download and upload the JSON again. |
| Users are signed out after a restart | `BETTER_AUTH_SECRET` changed. Keep it stable across deployments. |
| Upload fails with 413 | Raise `client_max_body_size` in nginx (the app accepts up to 30 MB). |

## License

MIT
