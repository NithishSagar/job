-- ============================================
-- 0002 — content_hash on jobs (cross-board dedup)
-- ============================================
-- Additive and idempotent: safe to run on an install that already has the
-- original schema.sql applied, and safe to re-run. A fresh install gets the
-- column from schema.sql instead, so running this after it is a no-op.
--
-- UNIQUE(user_id, job_url) only catches the same URL twice. The same vacancy
-- syndicated to two boards arrives under two URLs, so the scraper also stores
-- sha256(company + normalised title + first 200 chars of description) and
-- checks it against recent rows before upserting.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_content_hash ON jobs(content_hash);
