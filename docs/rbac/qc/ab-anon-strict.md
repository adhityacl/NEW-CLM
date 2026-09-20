# Probe Otorisasi Anonim (read-only)

- Base: `http://localhost:3999`
- Waktu: 2026-09-20T20:29:48.250Z
- Verdict: **BERSIH** — 0/16 bermasalah

| Jenis | Endpoint | Status | Verdict |
|---|---|---:|---|
| protected-get | `/api/contracts` | 401 | DENIED (benar) |
| protected-get | `/api/partners` | 401 | DENIED (benar) |
| protected-get | `/api/ios` | 401 | DENIED (benar) |
| protected-get | `/api/tenants` | 401 | DENIED (benar) |
| protected-get | `/api/activity-logs` | 401 | DENIED (benar) |
| protected-get | `/api/auth-console/users` | 401 | DENIED (benar) |
| protected-get | `/api/auth-console/sessions` | 401 | DENIED (benar) |
| protected-get | `/api/auth-console/organizations` | 401 | DENIED (benar) |
| protected-get | `/api/auth-console/invitations` | 401 | DENIED (benar) |
| protected-get | `/api/auth-console/teams` | 401 | DENIED (benar) |
| protected-get | `/api/auth-console/api-keys` | 401 | DENIED (benar) |
| protected-get | `/api/user/allowed-users` | 401 | DENIED (benar) |
| public-get | `/api/exchange-rates` | 401 | lain (401) |
| public-get | `/api/health` | 200 | publik (wajar) |
| write-guard | `/api/__rbac_probe__` | 401 | butuh autentikasi |
| write-guard | `/api/contracts/__rbac_probe__` | 401 | butuh autentikasi |
