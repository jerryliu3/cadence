# Cadence

Cadence is a mobile-first goal-tracking web app built with Next.js + Supabase.
It supports:

- Daily, weekly, and monthly recurring goals
- Fixed goals and recurring goals with optional target counts
- A strict once-per-day completion invariant
- Linked-goal completion cascades
- Insights heatmaps and completion percentages
- Read-only sharing and collaborative group goals
- Bulk goal creation from CSV/XLSX and natural-language parsing

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS + shadcn/ui (Radix-based components)
- Supabase (Postgres, Auth, Storage, RLS, RPC)
- `@supabase/ssr` for auth/session handling
- `date-fns` for all date math

## Local Development (End-to-End)

### 1) Start Supabase locally

```bash
pnpm supabase:start
```

This starts local Postgres/Auth/Storage using Docker.

### 2) Get local credentials

```bash
pnpm supabase:status
```

Copy values into `.env.local`:

```bash
cp .env.local.example .env.local
```

Set:

- `NEXT_PUBLIC_SUPABASE_URL` (usually `http://127.0.0.1:54321`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (use the **Publishable** key shown by `supabase status`)
- `GEMINI_API_KEY` (optional, only needed for AI natural-language bulk parsing)

### 3) Apply migrations and seed data

```bash
pnpm supabase:reset
```

This applies:

- `supabase/migrations/*.sql`
- `supabase/seed.sql`

### 4) Run the app

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo Accounts (Seeded)

- `alice@example.com` / `password123`
- `bob@example.com` / `password123`
- `carla@example.com` / `password123`

Seed data includes:

- Goals across all frequency types
- Completion history spanning ~8 weeks
- A linked-goal chain (`A -> B -> C`)
- A read-only shared goal
- A group goal with multiple participants

## Useful Commands

- `pnpm dev` - start Next.js dev server
- `pnpm build` - production build
- `pnpm lint` - lint checks
- `pnpm test` - run unit tests
- `pnpm supabase:start` - start local Supabase stack
- `pnpm supabase:stop` - stop local Supabase stack
- `pnpm supabase:status` - print local URLs and keys
- `pnpm supabase:reset` - reset DB, apply migrations, run seed

## Pointing to Hosted Supabase

1. Create a hosted Supabase project.
2. Set `.env.local` with hosted URL and your publishable/anon client key.
3. Apply migrations through your normal deployment workflow (`supabase db push` / CI).
4. Optionally adapt seed loading if you want demo data hosted.
