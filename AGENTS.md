# AGENTS.md — Konstitusi SPA Mebel Monitor

Baca juga: [MIGRATION-HANDOFF.md](./MIGRATION-HANDOFF.md) (status tahap + path).

## Prioritas

1. Jangan rusak produksi Next / data toko.
2. Fitur kasir + offline benar.
3. **UI harus sama persis dengan Next** sebelum cutover (syarat user).
4. Hosting tetap gratis (Cloudflare Workers static + Supabase Free).

## Stack

- Vite + React 19 + TypeScript + Tailwind 4 + shadcn + React Router
- Supabase JS client (anon) + RLS
- Dexie offline
- Deploy: `wrangler.jsonc` assets SPA → Cloudflare Workers
- Edge privileged ops: Supabase Edge Functions saja

## Sumber patokan UI & bisnis

Repo Next paralel: `../Aplikasi monitoring` (atau path Windows `C:\Users\USER\projek real\Aplikasi monitoring`).

- Jangan tebak desain — **salin pola** dari Next (`globals.css`, layout, transaksi).
- Entitas: Transaksi ≠ Nota ≠ Invoice (sama aturan AGENTS Next).

## Aturan kode

- Validasi Zod; toast sonner; dark mode support
- Harga rupiah = integer (`src/lib/money.ts`)
- Offline sync idempoten via `client_id`
- Minimal over-engineering; jangan install dep baru tanpa perlu

## Windows PowerShell

Jangan `&&`. Pakai `;` atau perintah terpisah.
