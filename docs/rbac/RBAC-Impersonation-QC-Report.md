# Laporan QC Impersonasi RBAC

- **Repo:** `adhityacl/NEW-CLM` � branch `feat/rbac-alignment`
- **Harness:** `scripts/rbac-qc.mjs` (tanpa dependensi eksternal, Node 22 fetch)
- **Status:** ? **menunggu eksekusi runtime di Codespaces** - lihat �3 (alasan jujur)

## 1. Apa yang sudah diverifikasi tanpa runtime (statis)

| Item | Cara verifikasi | Hasil |
|---|---|---|
| Engine RBAC sesuai PRD (hierarki, permission, scope, invite, role-change, error, audit) | `tests/rbac.test.ts` - 36 test | ? **36/36 lulus** (`npx tsx --test tests/rbac.test.ts`) |
| Matriks peran�permission sinkron dengan kode | `tools/gen-rbac-matrix.ts` dari `server/rbac.ts` | ? 32 permission � 5 peran, tergenerasi |
| Skenario QC per level siap dijalankan | `scripts/rbac-qc.mjs` (6 skenario � 5 level = 30 probe) | ? siap |
| Defect pada kode lama teridentifikasi | Audit PRD baris-per-baris | ? 12 temuan (4 kritis) |

**Bukti unit test (ringkas):**

```
# tests 36
# pass  36
# fail   0
```

Catatan: pada eksekusi pertama, suite **menemukan 1 bug nyata** di `assignableRoles()` (SUPERUSER ikut dapat menetapkan `superuser`). Sudah diperbaiki ? inilah bukti suite benar-benar menjaga aturan, bukan sekadar hijau.

## 2. Skenario QC impersonasi (PRD �30)

Dijalankan harness `scripts/rbac-qc.mjs`: untuk tiap level, harness menyamar sebagai user level tersebut (lewat `POST /api/auth-console/users/:id/impersonate` dengan token SUPERUSER, atau token yang diberikan), lalu memanggil endpoint dan membandingkan hasil dengan matriks izin.

| Skenario | Endpoint | SUPERUSER | ADMIN | MANAGER | EDITOR | VIEWER |
|---|---|:--:|:--:|:--:|:--:|:--:|
| `doc.view` | `GET /api/contracts` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `doc.create` | `POST /api/contracts` | ALLOW | ALLOW | ALLOW | ALLOW | **DENY** |
| `users.list` | `GET /api/auth-console/users` | ALLOW | ALLOW | ALLOW | **DENY** | **DENY** |
| `rbac.matrix` | `GET /api/rbac/matrix` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| `invite.viewer` | `POST /api/rbac/simulate/invite` `{targetRole:"viewer"}` | ALLOW | ALLOW | ALLOW | **DENY** | **DENY** |
| `invite.as.admin` | `POST /api/rbac/simulate/invite` `{targetRole:"admin"}` | ALLOW | **DENY** | **DENY** | **DENY** | **DENY** |

Aturan penilaian: skenario ber-harapan **DENY** hanya dianggap lulus bila HTTP **401/403 dengan kode error standar PRD �29** - bukan `500`, halaman kosong, atau sukses tanpa pesan.

Skenario tambahan yang wajib dicatat manual (PRD �30 negatif):

- Akses lintas tenant: user tenant A membuka dokumen tenant B ? `403 TENANT_SCOPE_VIOLATION` (atau `404 RESOURCE_NOT_FOUND` bila sengaja disamarkan, PRD �29).
- Akses lintas departemen: MANAGER/EDITOR/VIEWER membuka dokumen departemen lain ? `403 DEPARTMENT_SCOPE_VIOLATION`.
- Manipulasi payload: MANAGER mengirim `tenantId`/`departmentId` palsu ? tetap dipaksa ke scope miliknya (PRD �25).
- Tautan dalam (deep link) ke halaman admin oleh EDITOR ? UI harus menolak, dan endpoint tetap menolak (backend otoritatif).

## 3. Cara menjalankan (di Codespaces)

```bash
# 1. Nyalakan app
npm run dev            # server di http://localhost:3000

# 2. Ambil token SUPERUSER dari sesi login browser (DevTools ? Application ? Cookies/localStorage),
#    lalu jalankan harness. Isi id akun untuk tiap level agar impersonasi otomatis:
node scripts/rbac-qc.mjs \
  --base http://localhost:3000 \
  --super-token "<TOKEN_SUPERUSER>" \
  --accounts '{"admin":"<userId>","manager":"<userId>","editor":"<userId>","viewer":"<userId>"}'
```

Hasil: `qc-output/rbac-qc-report.md` dan `qc-output/rbac-qc-report.json` (tabel lulus/gagal per level + kode error tiap probe). Exit code `0` bila semua lulus.

### Mengapa belum dijalankan di sini (jujur)

App ini **full-stack** dan butuh runtime Express + better-auth + SQLite + kredensial (`GEMINI_API_KEY`, `BETTER_AUTH_SECRET`, `GOOGLE_*`). Lingkungan kerja agen tidak memiliki kredensial tersebut dan kanal preview AutoClaw hanya mendukung situs statis - jadi QC runtime **tidak dapat** dieksekusi di sisi agen tanpa membocorkan rahasia. Karena itu:

- Yang bisa diverifikasi tanpa runtime (logika otorisasi, matriks, skenario) ? **sudah diverifikasi dan lulus**.
- Yang butuh runtime (HTTP + sesi + impersonasi nyata) ? harness sudah disiapkan, **dijalankan oleh Anda di Codespaces**, hasilnya deterministic.

> Catatan penting: hasil QC runtime di atas **akan gagal** untuk beberapa skenario sampai C1-C4 pada laporan audit ditutup (endpoint masih di-whitelist dan impersonasi belum digerbangi). Urutan yang benar: pasang engine ? tutup C1-C4 ? baru jalankan harness.

## 4. Bukti jejak audit impersonasi (target PRD �27)

Setelah implementasi penuh, tiap sesi impersonasi harus menghasilkan event:

```json
{
  "actorId": "u-editor-01",
  "action": "document.edit",
  "targetType": "DOCUMENT",
  "targetId": "doc-1",
  "tenantId": "t1",
  "departmentId": "d1",
  "impersonatedBy": "u-superuser-01",
  "timestamp": "2026-09-21T10:30:00Z"
}
```

Hal ini sudah dijamin di level engine (`buildAuditEvent`, diuji di `tests/rbac.test.ts`: identitas pelaku efektif dan admin asli **tidak tercampur**). Yang belum: kolom `impersonatedBy` pada tabel `session` masih kosong saat impersonasi (`authConsoleRoutes.ts:658`) - perbaikan ada di rencana �6 audit report.
