# Setup Guide

This is the one-time setup you do yourself — Claude can't create accounts or
complete OAuth flows on your behalf, so these steps are manual.

## Step 1: Create your Supabase project (~5 min)

1. Go to https://supabase.com and sign up with `nsd8681@gmail.com`.
2. Click **New Project**.
   - Name: `nithish-job-hunt`
   - Database password: generate a strong one and save it somewhere safe (a password manager, not a text file in this repo).
   - Region: **Europe (Ireland)** — closest to the UK.
3. Wait 2-5 minutes for it to provision.

## Step 2: Get your API credentials (~2 min)

In the Supabase dashboard: **Settings → API**. You need three values:

- **Project URL** (`https://xxxxxxxxxxxx.supabase.co`)
- **anon (public) key**
- **service_role (secret) key** — never expose this one client-side; it's only for the Python scraper's server-side writes.

You'll use these in two separate gitignored env files:

**`scraper/.env`** (copy from `scraper/.env.example`) — used by the Python scraper, needs the service-role key for write access:

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**`.env.local`** at the project root (copy from `.env.example`) — used by the Next.js app, only needs the public anon key:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## Step 3: Create the database tables (~1 min)

1. In Supabase: **SQL Editor → New Query**.
2. Open `supabase/schema.sql` in this repo, copy the whole file, paste it into the query editor.
3. Click **Run**.
4. Go to **Table Editor** and confirm you see all 6 tables: `users`, `jobs`, `applications`, `job_board_status`, `job_board_stats`, `invites`.

Note: this schema adds two things beyond a bare copy of the original spec, both
necessary for the app to actually work:

- A trigger that auto-creates a `public.users` row whenever someone signs up
  via Supabase Auth (otherwise RLS policies that join against `users`/`invites`
  have nothing to match against).
- RLS policies letting an invitee read and accept *their own* pending invite
  row — without this, nobody could ever actually accept an invite, since the
  original policy set only let the invite's owner touch the `invites` table.

## Step 4: Enable email auth

**Authentication → Providers** — confirm **Email** is toggled on (it is by default).

## Step 5: Get free API keys for the real scrapers

The scraper uses official APIs for Adzuna and Reed instead of scraping their
HTML (see `scraper/README.md` for why). Both are free:

- **Adzuna**: sign up at https://developer.adzuna.com/ → get an `App ID` and `App Key`.
- **Reed**: sign up at https://www.reed.co.uk/developers/jobseeker → get an API key.

Add these to your `.env` alongside the Supabase values (see `scraper/.env.example`).

## Step 6: Run the scraper locally once

```
cd scraper
pip install -r requirements.txt
python job_scraper_v2.py
```

You should see a summary line like `Scraping complete. N jobs added, X sources working, Y skipped, Z failed.`
and a log file under `scraper/logs/`.

## Step 7: Run the dashboard locally

```
cd job-search-command-center
npm install
npm run dev
```

Visit http://localhost:3000, sign up with your own email, and you should land
on `/dashboard`.

Once this all works locally, see `DEPLOYMENT.md` for putting it on Vercel + GitHub Actions.
