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
- Scheduled Web Push reminders on desktop and iOS Home Screen apps

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
- `NEXT_PUBLIC_APP_URL` (optional; used for auth redirect links such as password reset)
- `GEMINI_API_KEY` (optional, only needed for AI natural-language bulk parsing)

Push notifications also require:

- `SUPABASE_SECRET_KEY` (server-only; `SUPABASE_SERVICE_ROLE_KEY` is also supported)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (a `mailto:` address or `https:` URL)
- `CRON_SECRET` (a long random server-only value)

Generate a VAPID key pair with:

```bash
pnpm exec web-push generate-vapid-keys
```

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
3. Set `NEXT_PUBLIC_APP_URL` to your deployed app URL (for example, your Vercel domain).
4. In Supabase Dashboard -> Authentication -> URL Configuration:
   - Set **Site URL** to your deployed app URL.
   - Add `${NEXT_PUBLIC_APP_URL}/reset-password` to **Redirect URLs**.
5. Apply migrations through your normal deployment workflow (`supabase db push` / CI).
6. Optionally adapt seed loading if you want demo data hosted.

## Scheduled Push Notifications

`vercel.json` invokes `/api/push/dispatch` at the top of every hour. Set all push environment
variables above in the Vercel project before deploying. Vercel automatically sends
`CRON_SECRET` as the route's bearer token.

Each user gets an enabled 9:00 PM reminder in their device's IANA timezone when notification
settings are initialized. It can be disabled, and users can create additional daily reminders.
Expired browser subscriptions are removed automatically.

On iOS or iPadOS 16.4 and newer:

1. Add Cadence to the Home Screen from the browser Share menu.
2. Open Cadence from its Home Screen icon.
3. Go to **Settings** and tap **Enable** under Push notifications.

iOS does not allow a normal browser tab to request Web Push permission. Permission must be
requested from the installed Home Screen app in response to the Enable button.
