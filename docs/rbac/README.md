# DELIVERY — RBAC Alignment + Obsidian UI (repo `adhityacl/NEW-CLM`)

Indeks semua hasil kerja. Sumber kebenaran RBAC: `Engineering PRD — RBAC Structure & Authorization.md` (35 seksi). Panduan desain: preset **17 Takram**.

## Mulai dari sini

| Dokumen | Untuk apa |
|---|---|
| [HANDOVER.md](HANDOVER.md) | Changelog, cara menjalankan, migrasi role, deploy & rollback, status kriteria, risiko |
| [RBAC-Audit-Report.md](RBAC-Audit-Report.md) | Audit baris-per-baris PRD ↔ kode + 12 temuan (4 kritis) |
| [RBAC-Impersonation-QC-Report.md](RBAC-Impersonation-QC-Report.md) | Metode & hasil QC impersonasi (unit + runtime) |
| [ObsidianUI-Integration-Plan.md](ObsidianUI-Integration-Plan.md) | Cara pasang Obsidian UI, pemetaan komponen, design token |
| [RBAC-Role-Permission-Matrix.md](RBAC-Role-Permission-Matrix.md) / [.csv](RBAC-Role-Permission-Matrix.csv) | Matriks 32 permission × 5 peran (dihasilkan dari kode) |

## Bukti eksekusi (qc/)

| Artefak | Isi |
|---|---|
| [qc/RBAC-QC-Impersonation-Run.md](qc/RBAC-QC-Impersonation-Run.md) | Laporan QC runtime: **30/30 lulus**, tabel per level & kode error |
| [qc/RBAC-QC-Impersonation-Run.json](qc/RBAC-QC-Impersonation-Run.json) | Data mentah hasil QC (untuk otomasi/CI) |
| [qc/impersonation-audit-trail.json](qc/impersonation-audit-trail.json) | 4 event impersonasi dengan `impersonatedBy` terisi |

## Kode (di branch `feat/rbac-alignment`, PR #1)

| File | Fungsi |
|---|---|
| `server/rbac.ts` | Engine RBAC tunggal sesuai PRD |
| `server/rbacRoutes.ts` | Router `/api/rbac/*` + `requirePermission()` (additif) |
| `tests/rbac.test.ts` | 36 test otorisasi (PRD §30) — 36/36 lulus |
| `tools/gen-rbac-matrix.ts` | Generator matriks dari kode |
| `tools/rbac-devserver.ts` | Server RBAC standalone untuk eksekusi QC runtime |
| `scripts/rbac-qc.mjs` | Harness QC impersonasi |
| `src/lib/permissions.ts` | Helper permission frontend + `<Can>` |
| `src/styles/tokens.css`, `components.json`, `src/components/obsidian/*` | Fondasi Obsidian UI + design token |

## Cara cepat

```bash
# 1) test otorisasi
npx tsx --test tests/rbac.test.ts            # 36/36

# 2) matriks dari kode
npx tsx tools/gen-rbac-matrix.ts qc-output

# 3) QC runtime pada engine standalone
npx tsx tools/rbac-devserver.ts 3999 &       # server di :3999
node scripts/rbac-qc.mjs --base http://localhost:3999   # 30/30
```

## ⚠️ Satu langkah aktivasi (belum dilakukan, sengaja)

Engine belum dipasang ke route lama agar tidak mengubah jalur autentikasi tanpa review:

```ts
// server.ts
app.use("/api/rbac", createRbacRouter({ resolveActor }));
```

Lihat §4 & §6 `HANDOVER.md`.
