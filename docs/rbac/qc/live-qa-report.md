# Laporan QA Live — Port Forwarding Codespaces (port 3000)

- **Target:** `https://automatic-umbrella-pw96gr5vjgp36j49-3000.app.github.dev/` (Codespaces port-forward, port 3000)
- **Waktu:** 2026-09-21 ~03:20–03:25 (GMT+7)
- **Metode:** HTTP **read-only** dari luar, tanpa kredensial, **tanpa operasi tulis apa pun**
- **Verdict:** 🔴 **KRITIS — hampir seluruh dataset bisnis & data pengguna dapat dibaca anonim selama URL publik**

## 1. Ringkasan eksekutif

App berjalan (Vite dev, judul "LMS - Legal Management System"), tetapi **hampir semua endpoint API membalas data nyata tanpa autentikasi**. Karena port 3000 di-forward sebagai **publik**, siapa pun yang memiliki URL dapat membaca data tersebut.

**Mitigasi tercepat (sekarang):** Codespaces → tab **Ports** → port 3000 → klik kanan → **Port Visibility → Private**. Lalu rotasi sesi/kredensial dan pertimbangkan menghapus Codespace.

## 2. Matriks paparan anonim (semua TANPA header Authorization)

| Endpoint | HTTP | Data yang terekspos | Jumlah |
|---|---:|---|---:|
| `GET /api/contracts` | 200 | nomor kontrak, nama mitra, kategori | **10** |
| `GET /api/partners` | 200 | data mitra | **10** |
| `GET /api/ios` | 200 | data IO | **10** |
| `GET /api/activity-logs` | 200 | log aktivitas (email, IP, aksi) | **10** |
| `GET /api/tenants` | 200 | daftar tenant (id, domain, driveFolderId) | **2** |
| `GET /api/auth-console/users` | 200 | **pengguna: email, role, status ban** | **3** |
| `GET /api/auth-console/sessions` | 200 | daftar sesi login | 2.156 B |
| `GET /api/auth-console/organizations` | 200 | daftar organisasi | 685 B |
| `GET /api/auth-console/invitations` | 200 | undangan | 33 B |
| `GET /api/auth-console/teams` | 200 | tim/departemen | 27 B |
| `GET /api/auth-console/api-keys` | 200 | daftar API key | 29 B (kosong) |
| `GET /api/user/allowed-users` | 200 | daftar user yang diizinkan | 1 |
| `GET /api/auth-console/rbac-matrix` | 200 | matriks izin deskriptif | 3.636 B |
| `GET /api/templates` · `/api/exchange-rates` | 200 | (non-sensitif) | — |
| `GET /api/rbac/matrix` | **404** | ✅ patcher RBAC belum diterapkan | — |
| `GET /api/dashboard` · `/api/notifications` | 404 | route tidak ada | — |
| `GET /api/user/my-role` | 401 | ✅ satu-satunya endpoint yang benar menolak | — |

### Contoh data nyata (diredaksi sebagian)

```
users:      adhitcl@gmail.com (superuser, active) · maolili@adapundi.com (viewer, banned) · farid@adapundi.com (viewer, banned)
contracts:  CTR-001 001/LEG/MND/2026 "Perjanjian Kerjasama Media Placement Digital 2026" — PT Media Nusantara Digital
            CTR-002 PT Cloud Teknologi Indonesia · CTR-003 PT Global Logistics Utama · CTR-004 PT Solusi Cyber Global
tenants:    org_1789905619545_7137a1 · org_1789542306289_b3a4f3
```

## 3. Uji validasi identitas

| Permintaan | HTTP | Kesimpulan |
|---|---:|---|
| tanpa header | 200 | anonim diperlakukan sebagai **Viewer** |
| `Authorization: Bearer <token acak>` | 200 | **token tidak divalidasi** → tetap lolos |
| `x-user-email: adhitcl@gmail.com` | 200 | identitas dari **header dapat dipalsukan** |

## 4. Kesesuaian kode yang berjalan dengan repo

| Path | Status | Catatan |
|---|---|---|
| `/src/main.tsx` | 200 (2.354 B) | disajikan Vite dev |
| `/src/components/Sidebar.tsx` | 200 (111.258 B) | memuat penanda `partner-spending` & `admin-users` → **sesuai `main` repo** |
| `/src/lib/rbacScoping.ts` | 200 | ada |
| `/src/lib/permissions.ts`, `/src/styles/tokens.css` | 200 tapi isi = `index.html` (1.494 B) | **tidak ada** — SPA fallback (perubahan branch belum diterapkan, sesuai dugaan) |

## 5. Akar masalah (kode)

1. **`rbacAuthMiddleware` (`server.ts:84-217`)** — identitas dari header (`x-user-email`, `x-google-user-email`, `?userEmail`) atau token yang dicari di tabel `session`; jika tidak ketemu → default **`Viewer`**. Hanya metode tulis yang diblokir untuk Viewer → **semua GET lolos**, termasuk endpoint admin.
2. **`authConsoleRouter` tanpa guard per-route** (`server.ts:7864`) → terbukti: `/api/auth-console/*` semuanya 200.
3. **Whitelist middleware** memuat `/api/tenants/switch` dan `/api/auth-console/organizations/*` (C4) — **tidak** saya eksekusi (bersifat mengubah state).
4. Identitas berbasis header email (C5) masih hidup.

## 6. Perbaikan yang menutupnya (sudah siap di branch `feat/rbac-alignment`)

| Perbaikan | Menutup |
|---|---|
| `tools/apply-rbac-integration.mjs --tier=secure` | whitelist C4 + guard `requirePermission` pada `/api/auth-console/users` dan `/api/tenants/switch` |
| `server/rbac.ts` + `server/rbacRoutes.ts` | sumber izin tunggal berbasis permission; `/api/rbac/matrix` sebagai verifikasi cepat (kini 404) |
| Handover §6 | menghapus default "anonim = Viewer" dan identitas dari header (C5) |

## 7. Rekomendasi berurutan

1. **(Sekarang)** jadikan port 3000 **Private**; hentikan paparan publik.
2. Terapkan `node tools/apply-rbac-integration.mjs server.ts --tier=secure`, restart, ulangi probe §2 — target: `/api/auth-console/*` → **401/403**; `/api/contracts` → 200 hanya untuk sesi sah.
3. Ubah anonim menjadi **401 UNAUTHENTICATED** (bukan Viewer) dan hapus identitas dari header.
4. Jalankan `node scripts/rbac-qc.mjs --base <url> --super-token <TOKEN>` untuk QC per level setelah token tersedia.
5. Rotasi sesi/kredensial: email pengguna & superuser sudah terpapar.

## 8. Bukti A/B bahwa perbaikan menutup kebocoran (dijalankan di sini)

Karena patch belum diterapkan di Codespace, efeknya dibuktikan lewat A/B pada engine yang sama:

| Mode | Cara | Hasil probe anonim |
|---|---|---|
| **warisan** (replika middleware lama) | `node tools/rbac-devserver.ts 3998 --legacy` | **BOCOR** — `/api/contracts` & `/api/auth-console/users` → 200 |
| **strict** (hasil `--tier=strict`) | `node tools/rbac-devserver.ts 3999` | **BERSIH** — 12 endpoint terproteksi → **401** |

Bukti: `qc/ab-anon-legacy.md` vs `qc/ab-anon-strict.md` (lengkap dengan JSON).

Regresi QC impersonasi setelah perubahan: **35/35 lulus** (7 skenario × 5 level) — `qc/RBAC-QC-Impersonation-Final.md`.

## 9. Batas pengujian (transparansi)

Tidak ada operasi tulis/ubah data, tidak ada percobaan eskalasi, tidak ada eksploitasi lanjutan. Semua probe **GET read-only** untuk QA yang diminta pemilik app. Panel browser AutoClaw tidak dapat memuat host tersebut (`ERR_ABORTED`), jadi inspeksi UI berbasis HTTP, bukan tangkapan layar.
