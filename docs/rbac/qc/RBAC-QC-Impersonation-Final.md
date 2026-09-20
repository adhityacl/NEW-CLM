# Laporan QC Impersonasi RBAC

- Base URL: `http://localhost:3999`
- Waktu: 2026-09-20T20:30:14.609Z
- Hasil: **35/35 lulus**

## Ringkasan per level

| Level | Token | Lulus | Total |
|---|---|---:|---:|
| superuser | super-token | 7 | 7 |
| admin | impersonation | 7 | 7 |
| manager | impersonation | 7 | 7 |
| editor | impersonation | 7 | 7 |
| viewer | impersonation | 7 | 7 |

## Detail

| Skenario | Level | Harapan | HTTP | Kode error | Hasil |
|---|---|---|---:|---|---|
| doc.view | superuser | ALLOW | 200 | - | ✅ |
| doc.view | admin | ALLOW | 200 | - | ✅ |
| doc.view | manager | ALLOW | 200 | - | ✅ |
| doc.view | editor | ALLOW | 200 | - | ✅ |
| doc.view | viewer | ALLOW | 200 | - | ✅ |
| doc.create | superuser | ALLOW | 201 | - | ✅ |
| doc.create | admin | ALLOW | 201 | - | ✅ |
| doc.create | manager | ALLOW | 201 | - | ✅ |
| doc.create | editor | ALLOW | 201 | - | ✅ |
| doc.create | viewer | DENY | 403 | INSUFFICIENT_PERMISSION | ✅ |
| users.list | superuser | ALLOW | 200 | - | ✅ |
| users.list | admin | ALLOW | 200 | - | ✅ |
| users.list | manager | ALLOW | 200 | - | ✅ |
| users.list | editor | DENY | 403 | INSUFFICIENT_PERMISSION | ✅ |
| users.list | viewer | DENY | 403 | INSUFFICIENT_PERMISSION | ✅ |
| rbac.matrix | superuser | ALLOW | 200 | - | ✅ |
| rbac.matrix | admin | ALLOW | 200 | - | ✅ |
| rbac.matrix | manager | ALLOW | 200 | - | ✅ |
| rbac.matrix | editor | ALLOW | 200 | - | ✅ |
| rbac.matrix | viewer | ALLOW | 200 | - | ✅ |
| invite.simulator | superuser | ALLOW | 200 | - | ✅ |
| invite.simulator | admin | ALLOW | 200 | - | ✅ |
| invite.simulator | manager | ALLOW | 200 | - | ✅ |
| invite.simulator | editor | DENY | 403 | INSUFFICIENT_PERMISSION | ✅ |
| invite.simulator | viewer | DENY | 403 | INSUFFICIENT_PERMISSION | ✅ |
| invite.no-scope | superuser | ALLOW | 200 | - | ✅ |
| invite.no-scope | admin | DENY | 403 | TENANT_SCOPE_VIOLATION | ✅ |
| invite.no-scope | manager | DENY | 403 | TENANT_SCOPE_VIOLATION | ✅ |
| invite.no-scope | editor | DENY | 403 | INSUFFICIENT_PERMISSION | ✅ |
| invite.no-scope | viewer | DENY | 403 | INSUFFICIENT_PERMISSION | ✅ |
| invite.as.admin | superuser | ALLOW | 200 | - | ✅ |
| invite.as.admin | admin | DENY | 403 | INVALID_ROLE_ASSIGNMENT | ✅ |
| invite.as.admin | manager | DENY | 403 | INVALID_ROLE_ASSIGNMENT | ✅ |
| invite.as.admin | editor | DENY | 403 | INSUFFICIENT_PERMISSION | ✅ |
| invite.as.admin | viewer | DENY | 403 | INSUFFICIENT_PERMISSION | ✅ |

> Catatan: skenario ber-harapan DENY dianggap lulus hanya bila HTTP 401/403
> dengan kode error standar PRD §29 (bukan 500 / halaman kosong).
