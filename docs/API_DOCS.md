# Data Model / API Reference

There's no custom REST API in this project — the Next.js dashboard talks
directly to Supabase (which auto-generates a REST + realtime API over
Postgres via PostgREST), and the Python scraper writes to the same tables
using the `supabase` Python client. This doc is the reference for the six
tables, since they *are* the API surface.

## `jobs`

One row per scraped job listing.

| Column | Notes |
|---|---|
| `job_url` | Unique per user — the scraper upserts on `(user_id, job_url)` conflict, so re-scraping the same listing updates it instead of duplicating it. |
| `visa_sponsorship` | `true`/`false`/`NULL`. `NULL` means the scraper couldn't determine it from the listing text — treat as "unknown", not "no". |
| `source` | The board name exactly as used in `job_board_status.board_name` / `job_board_stats.board_name` — keep these three in sync if you add a new source. |
| `tags` | Tech keywords extracted from the description (Python, PyTorch, AWS, Docker, etc.) — see `extract_tags()` in the scraper. |

## `applications`

One row per application you've made. `status` is a free-text column but the
dashboard only offers these six values: `Applied`, `Rejected`, `In Process`,
`Interview`, `Offer`, `Withdrawn`. Linked to its source listing via `job_id`.

## `job_board_status`

One row per board per user, upserted every scraper run. This is what drives
`/dashboard/board-status`. `status` is `Working` / `Partial` / `Down` /
`Unknown` — `Unknown` means the scraper hasn't run for that board yet (e.g. a
newly added source, or anything still stubbed in Group C — see
`scraper/README.md`).

## `job_board_stats`

One row per board per user, the aggregate numbers behind
`/dashboard/board-statistics`. Updated by the scraper after each run by
recomputing counts from `jobs`.

## `evaluations` + `top_100_jobs` (external — not defined in this repo)

The `/dashboard/ranked` page reads a `top_100_jobs` VIEW, expected to join
`jobs` with an `evaluations` table and return (at least): `id` (the
underlying job's id), `job_title`, `company_name`, `location`, `job_url`,
`match_score` (0-100), `recommendation` (`APPLY`/`MAYBE`/`SKIP`),
`fit_summary`, `ranked_position`, `key_strengths_match` (text array).

Neither object is created by `supabase/schema.sql` or written to by anything
in this repo — a separate, manual AI-scoring process (a human running job
descriptions through Claude in a chat session and writing the results back to
Supabase) owns both. If `/dashboard/ranked` shows a "could not load
top_100_jobs" error, that process's table/view hasn't been created yet in
this Supabase project — this app only ever reads it.

One thing to check on whoever's side created the view: a plain Postgres VIEW
runs with its creator's privileges by default, not the querying user's, which
would make it ignore the `jobs`/`applications`-style RLS policies in this
repo entirely (harmless for a single-user setup, worth knowing if a second
viewer is ever invited). Postgres 15+ supports `CREATE VIEW ... WITH
(security_invoker = true)` to make it respect RLS like a normal query instead.

## `invites`

Short-lived (7-day) invite codes an owner generates from
`/dashboard/settings`. An invite only grants read access to `jobs`,
`applications`, `job_board_status`, and `job_board_stats` once
`accepted = true` — it never grants write access or access to `users` itself.

## External APIs the scraper calls

| Service | Docs | Auth |
|---|---|---|
| Adzuna Job Search API | https://developer.adzuna.com/docs/search | `app_id` + `app_key` query params |
| Reed Jobseeker API | https://www.reed.co.uk/developers/jobseeker | HTTP Basic Auth, API key as username, blank password |

Everything else the scraper touches directly (Group B sites) is plain HTTP
GET + HTML parsing of public pages — no auth, no API keys needed. See
`scraper/README.md` for exactly which sites that applies to.
