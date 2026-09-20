# Rencana Integrasi Obsidian UI + Design Token

- **Sumber:** https://www.obsidianui.dev/ � https://gitlab.com/Atharvsinh-codez/ObsidianUI
- **Lisensi:** **MIT** (terverifikasi dari file `LICENSE` di GitLab + field `license.key = "mit"`) ? aman untuk internal/komersial, wajib menyertakan notice.
- **Model distribusi:** **shadcn-registry** (copy-paste / CLI). **Tidak ada paket npm resmi** - `npm i obsidian-ui` menarik paket lama 2019 yang sudah di-unpublish dan **tidak terkait**.
- **Kompatibilitas:** dibangun tepat di **React 19 + Tailwind v4** - sama dengan stack *silegal*.

## 1. Kesiapan (terverifikasi)

| Aspek | Hasil verifikasi |
|---|---|
| Registry dapat diakses | ? `GET https://www.obsidianui.dev/r/{table,badge,tabs}.json` ? **HTTP 200**, schema `registry-item.json` |
| Lisensi | ? MIT (`gitlab.com/.../-/raw/main/LICENSE` ? "MIT License") |
| Dependensi bersama | ? `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `motion` sudah ada di `package.json` |
| Dependensi tambahan | ?? Sebagian komponen butuh `@radix-ui/react-*` (belum ada ? perlu `npm i`) |
| Aset demo pihak ketiga | ?? Block WebGL/Three.js: aset demo **tidak** ikut lisensi MIT. Jangan dipakai di halaman admin. |

## 2. Cara pasang (resmi)

`components.json` sudah ditambahkan (RSC **dimatikan** untuk Vite, registry `@obsidian` terdaftar). Selanjutnya:

```bash
# primitif inti untuk halaman RBAC/admin
npx shadcn@latest add @obsidian/table @obsidian/badge @obsidian/dialog @obsidian/tabs \
  @obsidian/select @obsidian/input @obsidian/label @obsidian/dropdown-menu \
  @obsidian/card @obsidian/tooltip @obsidian/skeleton @obsidian/sonner
```

> Setelah komponen masuk ke repo, **tidak ada** ketergantungan runtime ke `obsidianui.dev` (offline-safe).

## 3. Pemetaan komponen ? kebutuhan halaman RBAC (PRD �21)

| Kebutuhan UI | Permission (PRD) | Komponen Obsidian UI |
|---|---|---|
| Tabel user/role/permission | `user.view` | `table` (+ `pagination`) |
| Badge status role/aktif/banned | `user.view` | `badge` |
| Tombol Undang Pengguna | `user.invite` | `button`, `dialog` |
| Pemilih role (hierarki-aware) | `user.role.assign` | `select`, `dropdown-menu` (opsi dari `assignableRoles`) |
| Form tambah/edit user | `user.create`, `user.edit` | `input`, `label`, `form` |
| Tab Users/Roles/Permissions | `admin.access` | `tabs` |
| Menu aksi per baris (?) | `user.*` | `dropdown-menu` |
| Toast hasil aksi | - | `sonner` |
| Keadaan memuat/kosong | - | `skeleton`, `empty` |
| Navigasi admin | `admin.access` | `sidebar`, `breadcrumb`, `separator` |
| Tooltip bantuan izin | - | `tooltip` |
| Matriks RBAC (halaman ini) | `admin.access` | `table` + `badge` + token `--color-data-*` |

> **Hindari** untuk halaman admin: `three`, `@react-three/fiber`, `@paper-design/shaders-react`, block efek dekoratif. Alasan: beban bundle besar, tidak menambah fungsi.

## 4. Design token (preset 17 Takram - Teknologi Lembut Presisi)

Token yang **sudah ada** (dipertahankan sebagai identitas produk): `--line-brand-green #06C755`, `--color-canvas/surface/hairline/ink*`.
Token yang **ditambahkan** (`src/styles/tokens.css`):

| Kategori | Token baru |
|---|---|
| Radius | `--radius-xs 6` � `sm 8` � `md 10` � `lg 14` � `xl 16` � `full 9999` |
| Shadow | `--shadow-xs/sm/md/elevated/focus` (lembut, opasitas rendah) |
| Surface | `--color-surface-2` (header tabel/panel) |
| Palet data (muted natural) | `--color-data-1 #4A6FA5` � `2 #6B8E6B` � `3 #C08552` � `4 #8C8579` � `5 #2E3A46` |
| Tipografi | `--font-mono` (angka/ID/API key), `--leading-tight`, `--tracking-tight` |
| Motion | `--ease-soft cubic-bezier(.16,1,.3,1)`, `--duration-fast/base` |
| Jembatan shadcn | `--background/--foreground/--card/--primary/--border/--ring/--radius` ? memetakan ke variabel `--line-*` |

Aturan integrasi (wajib):
1. Komponen Obsidian UI **hanya** memakai token di atas - tidak ada hex/nama warna Tailwind hardcoded.
2. Tiap nilai punya pasangan light/dark (lewat override variabel, **bukan `!important`**).
3. Warna `#06C755` tetap accent brand, tapi dipakai untuk aksi utama saja (Takram: saturasi tinggi dikurangi di permukaan).
4. Alias lama `--color-blue/red/yellow` dipertahankan agar komponen lama tidak pecah selama migrasi.
5. Fokus keyboard terlihat (`--shadow-focus`) + `prefers-reduced-motion` dihormati (WCAG 2.1 AA).

## 5. Yang sudah diterapkan di PR ini

| Item | File |
|---|---|
| Config shadcn + registry Obsidian | `components.json` |
| Token desain (Takram + jembatan shadcn) | `src/styles/tokens.css` |
| Komponen Obsidian UI (vendored, import relatif mengikuti konvensi repo) | `src/components/obsidian/table.tsx`, `src/components/obsidian/separator.tsx` |
| Helper permission frontend | `src/lib/permissions.ts` |

> Komponen di-vendor ke `src/components/obsidian/` dan **tidak menimpa** `src/components/ui/*` yang sudah ada (`badge/button/card/separator/...`) supaya build tidak pecah. Migrasi primitif lama ? Obsidian UI dilakukan bertahap setelah verifikasi visual.

## 6. Langkah lanjutan & risiko

1. `npm i @radix-ui/react-separator` (atau pasang komponen lewat CLI di atas) - dependensi radix belum ada.
2. Migrasi 6 primitif `src/components/ui/` ke Obsidian UI **satu per satu**, dengan pemeriksaan visual light/dark.
3. Ganti gating `isAdmin` ? `<Can permission="...">` (lihat `src/lib/permissions.ts`).
4. Bersihkan utang teknis: ratusan override `.dark .bg-white/slate-* !important` di `src/index.css` ? ganti pemakaian warna hardcoded menjadi token, lalu hapus override.
5. Ukur bundle sebelum/sesudah (`npm run build`) - patokan anggaran: halaman utama tidak memburuk signifikan.

**Risiko:** proyek Obsidian UI sangat baru (dibuat 2026-09-17) dan API-nya setara shadcn/ui, sehingga bila ada masalah dapat diganti balik ke shadcn resmi tanpa lock-in.
