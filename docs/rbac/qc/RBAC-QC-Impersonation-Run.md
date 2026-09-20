# Laporan QC Impersonasi RBAC

- Base URL: `http://localhost:3999`
- Waktu: 2026-09-20T20:13:07.767Z
- Hasil: **30/30 lulus**

## Ringkasan per level

| Level | Token | Lulus | Total |
|---|---|---:|---:|
| superuser | super-token | 6 | 6 |
| admin | impersonation | 6 | 6 |
| manager | impersonation | 6 | 6 |
| editor | impersonation | 6 | 6 |
| viewer | impersonation | 6 | 6 |

## Detail

| Skenario | Level | Harapan | HTTP | Kode error | Hasil |
|---|---|---|---:|---|---|
| doc.view | superuser | ALLOW | 200 | - | ? |
| doc.view | admin | ALLOW | 200 | - | ? |
| doc.view | manager | ALLOW | 200 | - | ? |
| doc.view | editor | ALLOW | 200 | - | ? |
| doc.view | viewer | ALLOW | 200 | - | ? |
| doc.create | superuser | ALLOW | 201 | - | ? |
| doc.create | admin | ALLOW | 201 | - | ? |
| doc.create | manager | ALLOW | 201 | - | ? |
| doc.create | editor | ALLOW | 201 | - | ? |
| doc.create | viewer | DENY | 403 | INSUFFICIENT_PERMISSION | ? |
| users.list | superuser | ALLOW | 200 | - | ? |
| users.list | admin | ALLOW | 200 | - | ? |
| users.list | manager | ALLOW | 200 | - | ? |
| users.list | editor | DENY | 403 | INSUFFICIENT_PERMISSION | ? |
| users.list | viewer | DENY | 403 | INSUFFICIENT_PERMISSION | ? |
| rbac.matrix | superuser | ALLOW | 200 | - | ? |
| rbac.matrix | admin | ALLOW | 200 | - | ? |
| rbac.matrix | manager | ALLOW | 200 | - | ? |
| rbac.matrix | editor | ALLOW | 200 | - | ? |
| rbac.matrix | viewer | ALLOW | 200 | - | ? |
| invite.simulator | superuser | ALLOW | 200 | - | ? |
| invite.simulator | admin | ALLOW | 200 | - | ? |
| invite.simulator | manager | ALLOW | 200 | - | ? |
| invite.simulator | editor | DENY | 403 | INSUFFICIENT_PERMISSION | ? |
| invite.simulator | viewer | DENY | 403 | INSUFFICIENT_PERMISSION | ? |
| invite.as.admin | superuser | ALLOW | 200 | - | ? |
| invite.as.admin | admin | DENY | 403 | INVALID_ROLE_ASSIGNMENT | ? |
| invite.as.admin | manager | DENY | 403 | INVALID_ROLE_ASSIGNMENT | ? |
| invite.as.admin | editor | DENY | 403 | INSUFFICIENT_PERMISSION | ? |
| invite.as.admin | viewer | DENY | 403 | INSUFFICIENT_PERMISSION | ? |

> Catatan: skenario ber-harapan DENY dianggap lulus hanya bila HTTP 401/403
> dengan kode error standar PRD �29 (bukan 500 / halaman kosong).
