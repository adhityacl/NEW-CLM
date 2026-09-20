# Handover - RBAC Alignment + Obsidian UI Integration

Repo: `adhityacl/NEW-CLM` � Branch kerja: `feat/rbac-alignment` � Baseline: `0368290` (`main`)

## 1. Changelog (perubahan yang terlihat pengguna)

| Area | Sebelum | Sesudah |
|---|---|---|
| Hierarki role | 3 bucket kasar (`Admin/Editor/Viewer`); `manager`?editor, `superuser`?admin | 5 peran PRD dengan level 1-5 dan aturan `target_level > actor_level` |
| Permission | String deskriptif, tidak pernah dicek | 32 permission code `resource.action` yang benar-benar dievaluasi |
| Invitation | Siapa pun bisa mengundang `superuser`/`admin` | Dibatasi hierarki + scope tenant/departemen |
| Perubahan role | Bisa eskalasi ke `superuser` tanpa cek | Dibatasi hierarki; tidak bisa mengubah role sendiri |
| Scope departemen | Tidak berjalan | `checkScope` + `buildScopeFilter` siap dipakai di query |
| Nilai dari client | `tenantId`/`departmentId` dipercaya | `resolveTrustedScope` memaksa scope milik user (PRD �25) |
| Error otorisasi | Pesan ad-hoc | Kode standar PRD �29 (`401/403/404`) |
| Frontend gating | `isAdmin` boolean | `hasPermission()` / `can()` / `<Can permission>` |
| Design token | Tanpa token radius/shadow/spacing/mono/data | Token Takram + jembatan shadcn/Obsidian UI |

## 2. File baru di PR ini

| File | Fungsi |
|---|---|
| `server/rbac.ts` | Engine RBAC tunggal (peran, permission, scope, invite, role-change, audit, error) |
| `server/rbacRoutes.ts` | Router additif `/api/rbac/*` + middleware `requirePermission()` |
| `tests/rbac.test.ts` | 36 test otorisasi (PRD �30) - **36/36 lulus** |
| `tools/gen-rbac-matrix.ts` | Generator matriks dari kode (anti-drift) |
| `src/lib/permissions.ts` | Helper permission frontend + `<Can>` + route map |
| `src/styles/tokens.css` | Design token (Takram) + jembatan token shadcn |
| `components.json` | Konfigurasi shadcn + registry Obsidian UI (`rsc: false` untuk Vite) |
| `src/components/obsidian/table.tsx`, `separator.tsx` | Komponen Obsidian UI (vendored, MIT) |
| `scripts/rbac-qc.mjs` | Harness QC impersonasi (6 skenario � 5 level) |
| `tools/rbac-devserver.ts` | Server RBAC standalone (tanpa dependensi) untuk eksekusi QC runtime |

## 3. Cara menjalankan

```bash
# Codespaces (devcontainer sudah ada)
npm install
cp .env.example .env      # isi GEMINI_API_KEY, BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_*
npm run dev               # ? http://localhost:3000  (Vite dimount sebagai middleware Express)
```
Port-forward: **3000** (dikonfigurasi di `.devcontainer/devcontainer.json`).

### Menjalankan test RBAC
```bash
npx tsx --test tests/rbac.test.ts        # 36 test, exit 0 bila lulus
```
### Menghasilkan ulang matriks
```bash
npx tsx tools/gen-rbac-matrix.ts qc-output
```
### Menjalankan QC impersonasi (setelah C1-C4 ditutup)
```bash
node scripts/rbac-qc.mjs --base http://localhost:3000 --super-token "<TOKEN>" \
  --accounts '{"admin":"<id>","manager":"<id>","editor":"<id>","viewer":"<id>"}'
```

## 4. ?? Wajib: satu baris pemasangan

Engine belum otomatis aktif (agar tidak mengubah perilaku produksi tanpa review). Tambahkan di `server.ts`, setelah middleware body-parser:

```ts
import { createRbacRouter } from "./server/rbacRoutes";
app.use("/api/rbac", createRbacRouter({ resolveActor }));
```

`resolveActor(req)` cukup mengembalikan `{ id, role, tenantId, departmentId }` dari sesi better-auth yang sudah ada. Setelah ini:
```bash
curl http://localhost:3000/api/rbac/matrix   # verifikasi cepat
```

## 5. Catatan migrasi role (legacy ? standar)

Data lama masih memakai role legacy. Pemetaan yang diterapkan otomatis oleh `normalizeRole()`:

| Legacy | Standar |
|---|---|
| `owner`, `super admin`, `super_admin` | `superuser` |
| `admin` | `admin` |
| `legal` | `manager` |
| `finance` | `editor` |
| `staff`, `member` | `viewer` |
| nilai tak dikenal | `viewer` (deny by default) |

Migrasi data (idempotent, **jalankan di staging dulu**):
```sql
UPDATE user SET role='superuser' WHERE lower(role) IN ('owner','super admin','super_admin');
UPDATE user SET role='manager'   WHERE lower(role)='legal';
UPDATE user SET role='editor'    WHERE lower(role)='finance';
UPDATE user SET role='viewer'    WHERE lower(role) IN ('staff','member');
```
Sebelum migrasi, pastikan setiap user non-superuser punya `tenantId` + `departmentId` valid (constraint PRD �6.1).

## 6. Rencana deploy & rollback

**Deploy (bertahap):**
1. Deploy kode (engine + route) **tanpa** memanggil `requirePermission` di route lama ? tidak ada perubahan perilaku. Verifikasi `/api/rbac/matrix` 200.
2. Pasang `requirePermission()` pada route `auth-console` **satu per satu** (mulai dari `impersonate`, `role`, `invite`, `ban`), uji tiap langkah.
3. Tambah tabel `audit_log` + isi `impersonatedBy` pada sesi impersonasi.
4. Aktifkan filter departemen pada query dokumen.
5. Ganti gating UI `isAdmin` ? `<Can>`; hapus whitelist `/api/tenants/switch` & `/api/audit-logs`.
6. Jalankan `scripts/rbac-qc.mjs`; semua lulus ? siap rilis.

**Rollback (urutan terbalik):**
1. Lepas `requirePermission()` dari route (kembali ke perilaku lama) - tidak perlu deploy ulang DB.
2. `git revert` commit RBAC; engine bersifat aditif sehingga revert aman.
3. Migrasi role bersifat data - siapkan pemetaan balik (`superuser`?`owner`, `manager`?`legal`, `editor`?`finance`, `viewer`?`staff`) bila perlu.
4. Tabel `audit_log` tidak mengganggu bila dibiarkan (read-only saat rollback).

**Titik pemeriksaan:** `/api/rbac/matrix` 200 � 36 test lulus � QC impersonasi lulus � login admin & superuser normal � Editor tidak bisa membuka `/api/auth-console/users`.

## 7. Status kriteria penerimaan (jujur)

| Kriteria | Status |
|---|---|
| RBAC sesuai panduan | ?? Engine + matriks + test selesai; **pemasangan ke route lama belum** (menunggu review karena mengubah jalur auth) |
| Matriks peran-permission | ? Tergenerasi dari kode (32�5) |
| QC impersonasi tiap level | ?? Runtime pada engine: **30/30 lulus** + jejak audit impersonasi terisi. App penuh: menunggu Codespaces |
| Akses terlarang benar-benar ditolak | ?? Terbukti runtime pada engine (6 probe negatif ? 403 + kode standar �29). App penuh menunggu C1-C4 ditutup |
| Jejak audit impersonasi | ?? Terbukti runtime (4 event, `impersonatedBy` terisi). Sisa: isi kolom di `authConsoleRoutes.ts:658` |
| Test otorisasi otomatis lulus | ? 36/36 |
| Integrasi Obsidian UI | ?? Config + token + 2 komponen vendored; sisanya via CLI/`npm i` |
| Token desain konsisten | ?? Token lengkap disediakan; migrasi komponen lama bertahap |
| Responsif & aksesibilitas | ? Belum diverifikasi visual (butuh runtime) |
| Anggaran performa | ? Belum diukur (butuh `npm run build` + runtime) |
| Rencana deploy & rollback | ? Dokumen �6 |
| Dokumentasi serah terima | ? Dokumen ini + 4 dokumen di `DELIVERY/` |

## 8. Risiko yang diketahui

1. **K1:** `server.ts` adalah monolit 287 KB - perubahan auth berisiko tinggi tanpa runtime; karena itu integrasi dibuat additif + bertahap.
2. **K2:** Identitas berbasis header email (C5) masih ada sampai hermetisasi sesi dikerjakan; jangan taruh data sensitif di balik header saja.
3. **K3:** Obsidian UI masih sangat baru - pantau rilis; API setara shadcn sehingga mudah dibalik.
4. **K4:** Konflik internal PRD �34.2 (`document.delete` untuk Editor). Diputuskan **diberikan**, dapat dimatikan lewat konstanta `EDITOR_CAN_DELETE_DOCUMENT` di `server/rbac.ts`.
