# Laporan QA Live — Port Forwarding Codespaces (port 3000)

- **Target:** `https://automatic-umbrella-pw96gr5vjgp36j49-3000.app.github.dev/` (Codespaces port-forward, port 3000)
- **Waktu:** 2026-09-21 ~03:20 (GMT+7)
- **Metode:** HTTP read-only dari luar (tanpa kredensial), tanpa operasi tulis apa pun
- **Verdict:** 🔴 **KRITIS — data bisnis & data pengguna terekspos ke request anonim selama URL dapat diakses publik**

## 1. Ringkasan eksekutif

App berjalan (Vite dev), tetapi **hampir semua endpoint API membalas data nyata tanpa autentikasi**. Karena port 3000 di-forward sebagai **publik**, siapa pun yang memiliki URL dapat membaca data tersebut. Ini bukan sekadar bug RBAC — ini **kebocoran data aktif**.

Mitigasi tercepat (lakukan sekarang): di Codespaces → tab **Ports** → port 3000 → klik kanan → **Port Visibility → Private**. Lalu rotasi kredensial yang mungkin terpapar dan pertimbangkan menghapus Codespace.

## 2. Bukti probe (semua TANPA header Authorization)

| Endpoint | HTTP | Isi yang terekspos |
|---|---:|---|
| `GET /` | 200 | Halaman app ("LMS - Legal Management System"), Vite dev |
| `GET /api/health` | 404 | — (app tidak punya route ini) |
| `GET /api/rbac/matrix` | 404 | ✅ Patcher RBAC **belum diterapkan** (sesuai dugaan) |
| `GET /api/auth-console/users` | 200 | **Daftar pengguna + email + role + status ban** (3 user) |
| `GET /api/contracts` | 200 | **10 kontrak** dengan nomor kontrak & nama mitra |
| `GET /api/tenants` | 200 | **2 tenant** beserta ID/domain |
| `GET /api/activity-logs` | 200 | **10 log aktivitas** (email pengguna, IP, aksi) |
| `GET /api/auth-console/rbac-matrix` | 200 | Matriks izin deskriptif (3,6 KB) |
| `GET /api/user/my-role` | 401 | ✅ satu-satunya endpoint yang benar menolak |

### Data nyata yang terlihat (contoh nyata)

```
users (3):
  adhitcl@gmail.com    role=superuser  banned=False   ← akun superuser ikut terbaca
  maolili@adapundi.com role=viewer     banned=True (PENDING_APPROVAL)
  farid@adapundi.com   role=viewer     banned=True (PENDING_APPROVAL)

tenants (2): org_1789905619545_7137a1, org_1789542306289_b3a4f3
contracts (10): CTR-001 001/LEG/MND/2026 "Perjanjian Kerjasama Media Placement Digital 2026" —
  PT Media Nusantara Digital; CTR-002 PT Cloud Teknologi Indonesia; CTR-003 PT Global Logistics Utama;
  CTR-004 PT Solusi Cyber Global; …
activity-logs (10): termasuk email pelaku + IP.
```

### Uji validasi identitas

| Permintaan | HTTP | Arti |
|---|---:|---|
| Tanpa header apa pun | 200 | Anonim dianggap **Viewer** |
| Dengan `Authorization: Bearer <token acak>` | 200 | **Token tidak divalidasi** → tetap Viewer |
| Dengan `x-user-email: adhitcl@gmail.com` | 200 | Header email **dapat dipalsukan** (tidak ada verifikasi) |

## 3. Akar masalah (kode)

1. **`rbacAuthMiddleware` (`server.ts:84-217`)**: identitas diambil dari header (`x-user-email`, `x-google-user-email`, `?userEmail`) atau token yang dicari di tabel `session`; bila tidak ketemu → default `Viewer`. Hanya metode tulis yang diblokir untuk Viewer — **semua GET diloloskan**, termasuk endpoint admin.
2. **`authConsoleRouter` tidak punya guard per-route** (`server.ts:7864`) → `/api/auth-console/users`, `/api/auth-console/rbac-matrix`, dst. terbuka.
3. **Whitelist middleware** memuat `/api/tenants/switch` dan `/api/auth-console/organizations/*` (C4) — kali ini tidak saya eksekusi karena bersifat mengubah state.
4. Header email sebagai identitas (C5) masih hidup.

## 4. Kaitan dengan perbaikan yang sudah disiapkan

| Perbaikan yang sudah ada | Menutup |
|---|---|
| Patch `--tier=secure` (`tools/apply-rbac-integration.mjs`) | Menutup whitelist C4 + memasang guard `requirePermission` pada `/api/auth-console/users` dan `/api/tenants/switch` |
| `server/rbac.ts` + `server/rbacRoutes.ts` | Sumber izin tunggal berbasis permission; `GET /api/rbac/matrix` untuk verifikasi cepat (sekarang masih 404) |
| Rencana §6 handover | Menghilangkan default "anonim = Viewer" dan identitas dari header (C5) |

## 5. Rekomendasi berurutan

1. **(Sekarang)** Jadikan port 3000 **Private** di Codespaces; hentikan paparan publik.
2. Terapkan `node tools/apply-rbac-integration.mjs server.ts --tier=secure`, restart, lalu ulangi probe di laporan ini — target: `/api/auth-console/users` → **401/403**, `/api/contracts` → tetap 200 hanya untuk sesi sah.
3. Hapus jalur identitas berbasis header email (C5) dan default `Viewer` untuk anonim → **401 UNAUTHENTICATED**.
4. Jalankan `node scripts/rbac-qc.mjs --base <url> --super-token <TOKEN>` setelah token tersedia untuk QC per level.
5. Rotasi: karena email pengguna & superuser bocor, pertimbangkan reset sesi/notifikasi.

## 6. Yang TIDAK dilakukan (batas etika pengujian)

Tidak ada operasi tulis/ubah data (tanpa POST/PUT/DELETE), tidak ada percobaan eskalasi, tidak ada eksploitasi lebih jauh. Semua probe bersifat **GET read-only** untuk keperluan QA sesuai permintaan pemilik app.
