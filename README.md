# JobHunt Command Center

A personal AI/ML job-search tracker for Nithish Sagar Dharmappa: a Next.js
dashboard (deployed on Vercel) backed by Supabase, fed daily by a Python
scraper that pulls AI/ML job listings from a mix of official job-search APIs
and a handful of small sites that are safe to scrape directly.

## Structure

```
job-search-command-center/
├── app/                    Next.js dashboard (6 pages + auth + invite flow)
├── lib/supabase/           Supabase browser/server client helpers
├── supabase/schema.sql     Full DB schema + RLS policies — run this first
├── scraper/
│   ├── job_scraper_v2.py   Scraper orchestrator (23 sources, see its README)
│   ├── requirements.txt
│   └── README.md           Which sources are real vs stubbed, and why
├── docs/
│   ├── SETUP.md            Start here
│   ├── DEPLOYMENT.md       Vercel + GitHub Actions
│   ├── API_DOCS.md         Data model reference
│   └── PRIVACY.md
└── .github/workflows/daily-scrape.yml   Runs the scraper at 7 AM UTC daily
```

## Quick start

See `docs/SETUP.md`. Short version: create a Supabase project, run
`supabase/schema.sql`, get free Adzuna + Reed API keys, `npm install` the
dashboard, `pip install -r requirements.txt` the scraper, run both locally,
then follow `docs/DEPLOYMENT.md` to put it on Vercel + GitHub Actions.

## Important deviation from the original spec worth knowing about

The original brief asked for scrapers against all 21 (+2 bonus) job boards,
including LinkedIn, Indeed, Glassdoor, Reed, Totaljobs, and Wellfound. Several
of those either explicitly prohibit automated scraping in their Terms of
Service or run bot-detection that a plain daily scraper will just get blocked
on. After flagging this, the agreed approach was: use official free APIs
where they exist (Adzuna, Reed), write real scrapers only for sites that are
genuinely static and don't forbid it, and leave the rest as clearly-labeled
stubs rather than code that silently fails or risks the account/IP getting
blocked. See `scraper/README.md` for the exact breakdown of which of the 23
sources are real vs stubbed.
