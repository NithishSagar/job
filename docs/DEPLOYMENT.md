# Deployment Guide

Do this after `SETUP.md` is working locally.

## 1. Push this repo to GitHub

```
cd F:\JOB\job-search-command-center
git init
git add .
git commit -m "Initial JobHunt Command Center"
```

Create a new (private) repo on GitHub, then:

```
git remote add origin https://github.com/<your-username>/job-search-command-center.git
git branch -M main
git push -u origin main
```

Double check `.gitignore` excludes `.env`, `.env.local`, and `scraper/logs/` before pushing — none of those should ever reach a public or even private remote.

## 2. Deploy the dashboard to Vercel

1. Go to https://vercel.com, sign up, **Import Project → From Git**, connect GitHub, select this repo.
2. Vercel will auto-detect Next.js. Set the **Root Directory** to `job-search-command-center` if you pushed the whole monorepo (scraper + dashboard together) rather than just the dashboard folder.
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**. After a couple of minutes you'll get a live URL (e.g. `https://job-search-command-center.vercel.app` — you can rename the project in Vercel's settings if you want the `nithish-job-hunt` subdomain specifically).

## 3. Turn on the daily scraper (GitHub Actions)

The workflow file is already in this repo at `.github/workflows/daily-scrape.yml`, scheduled for 7 AM UTC daily, plus a manual "Run workflow" button.

1. In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (the *service role* key, not anon — the scraper needs write access)
   - `ADZUNA_APP_ID`
   - `ADZUNA_APP_KEY`
   - `REED_API_KEY`
2. Go to the **Actions** tab, select "Daily Job Scraper", click **Run workflow** to test it manually once.
3. Check the run's logs and the uploaded log artifact to confirm it completed. From then on it runs automatically every day at 7 AM UTC.

## 4. Inviting a viewer (e.g. a future Claude session)

Supabase Auth doesn't let a non-human "log in" on its own — viewer access means
sharing real sign-in credentials with whoever you want to see the dashboard.
From `/dashboard/settings`, generate an invite link, then:

- Either sign up a dedicated viewer account yourself and accept the invite
  under that account, and share that account's login when you want a Claude
  session to check the dashboard on your behalf, or
- Open the invite link in a session where you're walking Claude through the
  dashboard together.

There's no automated way for an AI session to self-register for ongoing
access — that's a deliberate limit of Supabase Auth, not a missing feature
here.
