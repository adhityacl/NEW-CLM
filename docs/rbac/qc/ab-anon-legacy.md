# Probe Otorisasi Anonim (read-only)

- Base: `http://localhost:3998`
- Waktu: 2026-09-20T20:29:48.405Z
- Verdict: **BOCOR (2 endpoint)** — 2/16 bermasalah

| Jenis | Endpoint | Status | Verdict |
|---|---|---:|---|
| protected-get | `/api/contracts` | 200 | LEAK (bocor) |
| protected-get | `/api/partners` | 404 | tidak ada route |
| protected-get | `/api/ios` | 404 | tidak ada route |
| protected-get | `/api/tenants` | 404 | tidak ada route |
| protected-get | `/api/activity-logs` | 404 | tidak ada route |
| protected-get | `/api/auth-console/users` | 200 | LEAK (bocor) |
| protected-get | `/api/auth-console/sessions` | 404 | tidak ada route |
| protected-get | `/api/auth-console/organizations` | 404 | tidak ada route |
| protected-get | `/api/auth-console/invitations` | 404 | tidak ada route |
| protected-get | `/api/auth-console/teams` | 404 | tidak ada route |
| protected-get | `/api/auth-console/api-keys` | 404 | tidak ada route |
| protected-get | `/api/user/allowed-users` | 404 | tidak ada route |
| public-get | `/api/exchange-rates` | 404 | lain (404) |
| public-get | `/api/health` | 200 | publik (wajar) |
| write-guard | `/api/__rbac_probe__` | 403 | gerbang tulis AKTIF (Viewer diblokir) |
| write-guard | `/api/contracts/__rbac_probe__` | 403 | gerbang tulis AKTIF (Viewer diblokir) |
