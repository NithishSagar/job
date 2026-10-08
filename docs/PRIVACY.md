# Privacy

This is a single-user personal tool. Notes on how data is handled:

- **Who can see your data**: only your Supabase account (`nsd8681@gmail.com`)
  by default. Row-Level Security means every query is scoped to
  `auth.uid()` — there is no admin dashboard or shared view across users.
  A second person/account only gets read access to your `jobs` and
  `applications` rows if you explicitly generate an invite from
  `/dashboard/settings` and they accept it (see `DEPLOYMENT.md`).
- **Third parties**: no analytics, ad tech, or tracking scripts are included
  in the dashboard. The only outbound calls are to Supabase (your own
  database) and, from the scraper, to Adzuna's and Reed's official job-search
  APIs (to pull job listings) plus whichever small job sites the scraper
  fetches from directly — see `scraper/README.md` for the exact list.
- **Data at rest**: Supabase encrypts data at rest by default on all tiers,
  including the free tier.
- **Transport**: Supabase's API and your Vercel deployment are HTTPS-only.
- **Deleting your data**: `/dashboard/settings` has an export-data button
  (downloads your jobs + applications as JSON) and a delete-account section.
  The delete flow is stubbed to a server route rather than wired to a live
  destructive admin call — see the note in that page's code before relying on
  it, and consider just deleting the Supabase project directly if you want a
  hard reset.
- **Secrets**: `.env`, `.env.local`, and `scraper/logs/` are gitignored.
  Never commit your Supabase service-role key, Adzuna/Reed API keys, or
  database password to the repo, even if it's private.
