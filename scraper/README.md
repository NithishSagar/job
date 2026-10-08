# Job scraper

Daily scraper for the JobHunt Command Center. Run by
`.github/workflows/daily-scrape.yml` at 07:00 UTC, or locally with:

```bash
cd scraper
pip install -r requirements.txt
cp .env.example .env     # then fill it in
python job_scraper_v2.py
```

It upserts into `jobs` (on conflict `user_id, job_url`) and refreshes
`job_board_status` and `job_board_stats`. Logs go to
`scraper/logs/scraper_<date>.log`.

## Source status

All 23 sources are registered, so the dashboard shows a row for each one. A
skipped source reports `status = 'Skipped'` with the reason in `error_message` —
it is never silently dropped.

### Real — official APIs (2)

| Source | How |
| --- | --- |
| Adzuna | `GET api.adzuna.com/v1/api/jobs/gb/search/{page}` — documented REST API, `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` |
| Reed | `GET www.reed.co.uk/api/1.0/search` — HTTP Basic, `REED_API_KEY` as username, empty password |

### Real — official feeds / public REST / static HTML (6)

| Source | How |
| --- | --- |
| Dev IT Jobs | Official RSS at `devitjobs.uk/rss`, linked from their own `<head>`. The site itself is a React SPA, so the feed is the only sane route — and the intended one. |
| Artificial Intelligence Jobs UK | Official JSON Feed 1.1 at `/jobs.json`, advertised in their `robots.txt` under **CC BY 4.0, attribution required**. Carries full schema.org `JobPosting` objects including `baseSalary`. |
| Harnham | Public WordPress REST API: `/wp-json/wp/v2/job-listings`. Their search UI is FacetWP/AJAX, but the `job_listing` post type is exposed over the standard REST route, so no UI scraping. Returns US roles too, filtered to UK. |
| TechSpark | The board is `techjobs.techspark.co` (a jBoard tenant) and renders listings server-side. Their `robots.txt` disallows `/rss/`, so this parses the allowed `/jobs` pages with `Crawl-delay: 1` respected. |
| AI Jobs (aijobs.ai) | Server-rendered search: `/jobs?keyword=…&location=London`. `robots.txt` disallows `/job/` detail pages, so only listing pages are requested; the detail URL is stored for you to click, never fetched. |
| HN Hiring | `hnhiring.com/locations/london` is static HTML (`ul.jobs > li.job`) and `robots.txt` has no `Disallow`. Ads have no per-ad URL, so `job_url` is a deterministic `#job-<hash>` anchor on the London page. |

### Stubbed (15)

Each raises `NotImplementedError` with its reason.

**Moved here from the scraping shortlist after actually fetching them:**

| Source | Why |
| --- | --- |
| AI Startups List UK | Next.js app that renders its board client-side. Static HTML has zero listings and there is no public JSON endpoint (`/api/jobs`, `/jobs.json` → 404). Would need a headless browser. |
| IT Job Board | `robots.txt` disallows exactly the URLs a scraper needs: `Disallow: /jobs/?`, `/*?searchId=`, `/ajax/`. |
| Foorilla | Terms forbid "automation, bots, or scrapers without permission", and the same data is sold through a PRO+ API ($64/month). Scraping the htmx partial would be circumventing a paid product. |

**Bot protection and/or terms forbidding automated access:** CW Jobs, Free Work,
Hiring Cafe, Welcome to the Jungle, Wellfound, Built In London, Work in
Startups, LinkedIn, Indeed, Total Jobs, Glassdoor UK, Built In (US).

## Getting the API keys

- **Adzuna** — sign up at <https://developer.adzuna.com/signup>. Free tier,
  instant. You get an *App ID* and an *App Key*.
- **Reed** — register at <https://www.reed.co.uk/developers/jobseeker>. Free.
  One API key, sent as the HTTP Basic *username* with a blank password.

Put them in `scraper/.env` locally, and in GitHub repo
*Settings → Secrets and variables → Actions* for the scheduled run. A missing
key makes only that one source fail (`status = 'Down'`, reason logged); the rest
of the run continues.

## Adding a real implementation for a stubbed source

1. Check it is actually allowed first: read the site's terms for automated
   access, and check `robots.txt` for the URLs you need. If either says no,
   leave the stub alone — that is the honest answer.
2. Confirm the data is in the raw HTML before writing selectors:
   `curl -A "JobSearchCommandCenter/2.0" <url> | less`. If you only get an empty
   app shell, there is no lightweight scraper to write.
3. Replace the `raise NotImplementedError(...)` body with a method that returns
   `list[dict]`, building each row with `self.build_job(...)` so salary, visa,
   tags, remote status and job type are filled in consistently.
4. Fetch through `self._get(...)` — it carries the honest User-Agent, the
   timeout and the polite delay.
5. Nothing else to wire up: the method is already in the registry in
   `__init__`, so it starts reporting as `Working` on the next run.

Prefer an official API, RSS or JSON feed over HTML every time. Three of the six
real scrapers here are feeds the site publishes deliberately.

## Note on `lib/constants.ts`

`JOB_BOARDS` in `lib/constants.ts` lists a different, older set of 21 boards
(Otta, Greenhouse, Lever, …) than the 23 `board_name` values this scraper
writes. The dashboard renders a row per name in that list, so until it is
updated the board-status page will show stale rows and miss the new ones. The
names written here are:

```
Adzuna, Reed, Dev IT Jobs, Artificial Intelligence Jobs UK, Harnham, TechSpark,
AI Jobs, HN Hiring, AI Startups List UK, IT Job Board, Foorilla, CW Jobs,
Free Work, Hiring Cafe, Welcome to the Jungle, Wellfound, Built In London,
Work in Startups, LinkedIn, Indeed, Total Jobs, Glassdoor UK, Built In
```

`BOARD_STATUSES` also needs `'Skipped'` adding if you want it styled rather
than rendered as an unknown string.
