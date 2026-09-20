# Probe Otorisasi Anonim (read-only)

- Base: `https://automatic-umbrella-pw96gr5vjgp36j49-3000.app.github.dev`
- Waktu: 2026-09-20T20:49:08.481Z
- Verdict: **BOCOR (5 endpoint)** — 5/16 bermasalah

| Jenis | Endpoint | Status | Verdict |
|---|---|---:|---|
| protected-get | `/api/contracts` | 401 | DENIED (benar) |
| protected-get | `/api/partners` | 401 | DENIED (benar) |
| protected-get | `/api/ios` | 401 | DENIED (benar) |
| protected-get | `/api/tenants` | 401 | DENIED (benar) |
| protected-get | `/api/activity-logs` | 401 | DENIED (benar) |
| protected-get | `/api/auth-console/users` | 401 | DENIED (benar) |
| protected-get | `/api/auth-console/sessions` | 200 | LEAK (bocor) |
| protected-get | `/api/auth-console/organizations` | 200 | LEAK (bocor) |
| protected-get | `/api/auth-console/invitations` | 200 | LEAK (bocor) |
| protected-get | `/api/auth-console/teams` | 200 | LEAK (bocor) |
| protected-get | `/api/auth-console/api-keys` | 200 | LEAK (bocor) |
| protected-get | `/api/user/allowed-users` | 401 | DENIED (benar) |
| public-get | `/api/exchange-rates` | 200 | publik (wajar) |
| public-get | `/api/health` | 404 | lain (404) |
| write-guard | `/api/__rbac_probe__` | 401 | butuh autentikasi |
| write-guard | `/api/contracts/__rbac_probe__` | 401 | butuh autentikasi |
