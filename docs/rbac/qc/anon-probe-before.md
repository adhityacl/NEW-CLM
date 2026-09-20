# Probe Otorisasi Anonim (read-only)

- Base: `https://automatic-umbrella-pw96gr5vjgp36j49-3000.app.github.dev`
- Waktu: 2026-09-20T20:26:20.667Z
- Verdict: **BOCOR (12 endpoint)** — 12/16 bermasalah

| Jenis | Endpoint | Status | Verdict |
|---|---|---:|---|
| protected-get | `/api/contracts` | 200 | LEAK (bocor) |
| protected-get | `/api/partners` | 200 | LEAK (bocor) |
| protected-get | `/api/ios` | 200 | LEAK (bocor) |
| protected-get | `/api/tenants` | 200 | LEAK (bocor) |
| protected-get | `/api/activity-logs` | 200 | LEAK (bocor) |
| protected-get | `/api/auth-console/users` | 200 | LEAK (bocor) |
| protected-get | `/api/auth-console/sessions` | 200 | LEAK (bocor) |
| protected-get | `/api/auth-console/organizations` | 200 | LEAK (bocor) |
| protected-get | `/api/auth-console/invitations` | 200 | LEAK (bocor) |
| protected-get | `/api/auth-console/teams` | 200 | LEAK (bocor) |
| protected-get | `/api/auth-console/api-keys` | 200 | LEAK (bocor) |
| protected-get | `/api/user/allowed-users` | 200 | LEAK (bocor) |
| public-get | `/api/exchange-rates` | 200 | publik (wajar) |
| public-get | `/api/health` | 404 | lain (404) |
| write-guard | `/api/__rbac_probe__` | 403 | gerbang tulis AKTIF (Viewer diblokir) |
| write-guard | `/api/contracts/__rbac_probe__` | 403 | gerbang tulis AKTIF (Viewer diblokir) |
