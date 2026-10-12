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

Offline checks (no network, no credentials): `cd scraper && python test_scraper.py`.

## Source status

All 25 sources are registered, so the dashboard shows a row for each one. A
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

### Stubbed (17)

Each raises `NotImplementedError` with its reason.

**Moved here from the scraping shortlist after actually fetching them:**

| Source | Why |
| --- | --- |
| AI Startups List UK | Next.js app that renders its board client-side. Static HTML has zero listings and there is no public JSON endpoint (`/api/jobs`, `/jobs.json` → 404). Would need a headless browser. (Did not resolve in DNS at all on 2026-10-12 — worth re-checking whether the site still exists.) |
| IT Job Board | `robots.txt` disallows exactly the URLs a scraper needs: `Disallow: /jobs/?`, `/*?searchId=`, `/ajax/`. |
| Foorilla | Terms forbid "automation, bots, or scrapers without permission", and the same data is sold through a PRO+ API ($64/month). Scraping the htmx partial would be circumventing a paid product. |

**Re-investigated individually on 2026-10-12** — see the next section: CW Jobs,
Hiring Cafe, Welcome to the Jungle, Work in Startups, Silicon Roundabout,
Remote Rocketship.

**Bot protection and/or terms forbidding automated access** (still on the
original bulk assessment, not individually re-checked): Free Work, Wellfound,
Built In London, LinkedIn, Indeed, Total Jobs, Glassdoor UK, Built In (US).

## Per-site re-investigation, 2026-10-12

Six sources were re-checked individually with real fetches rather than carried
over on the earlier bulk "bot protection and/or terms" judgement. For each:
`robots.txt`, the terms page, and the raw HTML of the actual listing page
(`curl -A "JobSearchCommandCenter/2.0"`). **All six came back unusable, none for
a reason Firecrawl can fix.** Two of the old reasons turned out to be wrong and
have been corrected in the code.

| Source | Verdict | Evidence |
| --- | --- | --- |
| **Welcome to the Jungle** | Terms prohibit | `robots.txt` is fully permissive (`User-agent: *` / empty `Disallow:`) — so the old "Cloudflare bot management" reason was not the real one. The terms are: they forbid "any software, device, script, robot … (including but not limited to spiders, browser plug-ins and add-ons, or any other technology) to web 'scrape' or otherwise copy or download our Website, Content or Services", with a carve-out only for public search engines. `uk.` is the same platform as `www.` (shared `window.env`, same Algolia app) and its footer points at those terms. |
| **Hiring Cafe** | Terms prohibit | The closest call of the six. `robots.txt` is actively welcoming — explicit `Allow: /jobs`, `Allow: /job`, plus `jobs-sitemap.xml` and `job-posting-sitemap.xml` — and there is **no** anti-bot clause anywhere in the terms. But section 5 says "You must not: Republish material from HiringCafe / Sell, rent, or sub-license material / **Reproduce, duplicate, or copy material from HiringCafe** / Redistribute content from HiringCafe", which is what storing their listings is. This repo's own rule (below) is "if *either* says no, leave the stub alone", so it stays stubbed. Raw `/jobs` HTML is a JS shell ("Loading…" placeholders, no job rows), so it *would* have been the one real Firecrawl candidate — but Firecrawl is a renderer, not a licence. |
| **Work in Startups** | Blocked at the edge | CloudFront answers **every** request from this host with `403 ERROR / Request blocked` — including `/robots.txt` itself, and with a normal browser User-Agent too. Neither its crawl rules nor its terms can be read. The refusal is the answer. |
| **CW Jobs** | Terms prohibit | The old reason ("fronts listings with bot detection") was **wrong**: `/jobs/machine-learning/in-london` returns 1.08 MB of static HTML containing all 108 listings — titles, salaries, descriptions — to this exact User-Agent with no challenge, and the wildcard `robots.txt` block has no blanket `Disallow: /`. The blocker is terms clause 1.1: use is "for the sole purpose of individuals looking for employment opportunities", you may "use, print and download" only, and "You may not otherwise copy, display, transmit or distribute any material from the site", with anything else "unauthorised processing". `robots.txt` also disallows `/jobs*?page=*`, so no pagination either. |
| **Silicon Roundabout** | Nothing to scrape | The only one that is not a permissions question. `robots.txt` permits everything (empty `Disallow:`), but there is no job board: `/jobs`, `/careers`, `/job-board`, `/talent` all 404, the WordPress REST API lists no job post type (`/wp-json/wp/v2/types` → only post/page/attachment/…), and `page-sitemap.xml` contains only community, events, founders and investor pages. Roles move through their community channels. |
| **Remote Rocketship** | Terms prohibit; official API exists | Terms section 5, *Fair Use & Automation*: "Scraping the Platform, running automated browser sessions, or performing request bursts that mimic scraping is prohibited." That names headless rendering explicitly, so Firecrawl is specifically excluded rather than merely unhelpful. Section 3 adds "Purchasing access for scraping or reselling data voids any refund rights." They sell the sanctioned route: `POST https://www.remoterocketship.com/api/openclaw/jobs`, `Authorization: Bearer <key>`, 3000 jobs or 500 requests/day, 50 jobs/request — but the key needs an active paid subscription, so this is stubbed the same way Foorilla is, with the endpoint recorded in the reason. |

## Firecrawl: investigated, not adopted

[Firecrawl](https://firecrawl.dev) was evaluated as a way to reach boards whose
listings only exist after JavaScript runs. **No source currently qualifies, so
there is no Firecrawl code and no `FIRECRAWL_API_KEY` in `.env.example`** — an
API key wired to nothing would just be a key you pay attention to for no reason.

The reasoning matters more than the result: Firecrawl renders pages, it does not
grant permission. A site whose terms forbid automated access stays off-limits
regardless of which tool would technically reach it — and in Remote Rocketship's
case the terms rule out "automated browser sessions" by name. Of the six sites
above, the only one that was a genuine *technical* JS-shell problem (Hiring
Cafe) is also the one whose terms forbid copying its material.

If a source ever does land in that bucket — no robots/terms prohibition, data
genuinely absent from raw HTML — the budget is the binding constraint:

- Free tier is **500 requests/month**; this runs daily from GitHub Actions.
- 31 runs/month × 1 request per board per run = **31 requests per board per
  month**, so the free tier supports roughly **16 Firecrawl-backed boards** at
  one request each, and that is before any retry.
- So: **one `/scrape` call per board per run, hard.** No per-page pagination
  spidering, no detail-page fetch per listing — take whatever the first
  rendered listing page gives and stop. A board that needs 5 pages costs 155
  requests/month on its own, i.e. a third of the quota for one source.
- Build it as a small client reading `FIRECRAWL_API_KEY` via `os.getenv`, and
  when the key is unset report `Down` with "FIRECRAWL_API_KEY not set" rather
  than crashing — the same shape as `scrape_adzuna` / `scrape_reed` raising
  `RuntimeError` for a missing key, which `run_all_scrapers` already catches
  and logs per board.

## Deduplication (two layers)

`UNIQUE(user_id, job_url)` in Postgres only catches re-scraping the *same URL*.
The same vacancy syndicated to Reed and Adzuna arrives under two different URLs
and passes straight through it. So there is a second layer:

1. **`remove_duplicates(jobs)`** — unchanged. Collapses identical `job_url`s
   within a run.
2. **`remove_content_duplicates(jobs)`** → **`is_duplicate(job, cache)`** — new.
   Every row built by `build_job` now carries
   `content_hash = sha256(company.lower().strip() + normalize_title(title) + description[:200])`,
   stored in `jobs.content_hash`. Before upserting a batch:
   - **Exact match:** if a stored row for this user has the same `content_hash`
     and its `date_scraped` is **within 7 days**, the new row is skipped — it is
     the same live posting from another board. If the stored row is **older than
     7 days** the upsert goes ahead, treating it as a re-advertised/still-live
     vacancy so `date_scraped` moves forward.
   - **Fuzzy safety net:** for near-misses the hash cannot catch (a board that
     pads whitespace or truncates the description upstream),
     `difflib.SequenceMatcher` compares `normalize_title(job_title)` against
     other jobs from the **same company** scraped in the last 7 days, and treats
     **≥ 0.85** as a duplicate. Same-company only, deliberately — it never scans
     the whole table.
   - Rows accepted during a run are folded back into the cache, so two boards
     carrying the same vacancy in a *single* run also collapse.
   - The lookup is two bounded, chunked queries (hashes in the batch; recent
     rows for the companies in the batch). If it fails it **fails open** — logs a
     warning and upserts unfiltered rather than losing the run, with the
     `UNIQUE(user_id, job_url)` constraint still underneath.

`run_all_scrapers()` reports the count as `jobs_cross_board_duplicates`.

**Schema:** `content_hash` is nullable and additive. A fresh install gets it
from the `CREATE TABLE jobs` block in `supabase/schema.sql`; an install that has
already run the original schema applies
`supabase/migrations/0002_content_hash.sql`, which is idempotent
(`ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`) and therefore safe
to run on either. Existing rows keep `content_hash = NULL` and are simply never
matched by the exact-hash check; the fuzzy layer still covers them.

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
   app shell, there is no lightweight scraper to write — and reaching for a
   renderer does not change step 1's answer. See the Firecrawl section.
3. Replace the `raise NotImplementedError(...)` body with a method that returns
   `list[dict]`, building each row with `self.build_job(...)` so salary, visa,
   tags, remote status, job type *and `content_hash`* are filled in
   consistently. Never assemble the dict by hand — a row without a
   `content_hash` silently opts out of cross-board dedup.
4. Fetch through `self._get(...)` — it carries the honest User-Agent, the
   timeout and the polite delay.
5. Nothing else to wire up: the method is already in the registry in
   `__init__`, so it starts reporting as `Working` on the next run.

Prefer an official API, RSS or JSON feed over HTML every time. Three of the six
real scrapers here are feeds the site publishes deliberately.

## Note on `lib/constants.ts`

`JOB_BOARDS` in `lib/constants.ts` lists a different, older set of 21 boards
(Otta, Greenhouse, Lever, …) than the 25 `board_name` values this scraper
writes. The dashboard renders a row per name in that list, so until it is
updated the board-status page will show stale rows and miss the new ones. The
names written here are:

```
Adzuna, Reed, Dev IT Jobs, Artificial Intelligence Jobs UK, Harnham, TechSpark,
AI Jobs, HN Hiring, AI Startups List UK, IT Job Board, Foorilla, CW Jobs,
Free Work, Hiring Cafe, Welcome to the Jungle, Wellfound, Built In London,
Work in Startups, LinkedIn, Indeed, Total Jobs, Glassdoor UK, Built In,
Silicon Roundabout, Remote Rocketship
```

`BOARD_STATUSES` also needs `'Skipped'` adding if you want it styled rather
than rendered as an unknown string.
