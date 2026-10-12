/**
 * Row types mirroring supabase/schema.sql (ground truth).
 *
 * Postgres `TIMESTAMP` / `DATE` columns come back from PostgREST as ISO
 * strings, so they are typed as `string | null` here.
 */

import type {
  ApplicationStatus,
  BoardStatusValue,
  Recommendation,
  UserRole,
} from '@/lib/constants';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole | string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Job {
  id: number;
  user_id: string;
  company_name: string;
  job_title: string;
  job_url: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  description: string | null;
  location: string | null;
  job_type: string | null;
  visa_sponsorship: boolean | null;
  remote_status: string | null;
  company_size: string | null;
  funding_stage: string | null;
  date_posted: string | null;
  date_scraped: string | null;
  source: string;
  tags: string[] | null;
  is_tier1_company: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Application {
  id: number;
  user_id: string;
  job_id: number;
  company_name: string;
  job_title: string;
  status: ApplicationStatus | string;
  date_applied: string | null;
  date_of_response: string | null;
  rejection_reason: string | null;
  interview_date: string | null;
  interview_type: string | null;
  interview_notes: string | null;
  offer_salary_min: number | null;
  offer_salary_max: number | null;
  offer_equity: string | null;
  offer_start_date: string | null;
  offer_status: string | null;
  cover_letter_used: string | null;
  cv_used: string | null;
  follow_up_date: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface JobBoardStatusRow {
  id: number;
  user_id: string;
  board_name: string;
  status: BoardStatusValue | string | null;
  jobs_scraped_today: number | null;
  last_scraped: string | null;
  error_message: string | null;
  error_count: number | null;
  success_count: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface JobBoardStatsRow {
  id: number;
  user_id: string;
  board_name: string;
  total_jobs_scraped: number | null;
  jobs_this_month: number | null;
  jobs_this_week: number | null;
  jobs_today: number | null;
  avg_salary_min: number | null;
  avg_salary_max: number | null;
  visa_sponsorship_percent: number | null;
  response_rate: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Invite {
  id: string;
  owner_id: string;
  invite_email: string;
  invite_code: string;
  role: string | null;
  accepted: boolean | null;
  accepted_by_id: string | null;
  accepted_at: string | null;
  created_at: string | null;
  expires_at: string | null;
}

/** A minimal job shape used by the "add application" job picker. */
export type JobOption = Pick<Job, 'id' | 'company_name' | 'job_title' | 'source'>;

/**
 * A row from the `top_100_jobs` Supabase VIEW (joins `jobs` + `evaluations`).
 * Both the view and the `evaluations` table it reads from are maintained by a
 * separate, manual AI-scoring process outside this app — see
 * docs/API_DOCS.md. Scored fields are therefore all optional/nullable here:
 * this app only displays them, it never assumes they're populated, and it
 * never writes to `evaluations`.
 */
export interface RankedJob {
  id: number;
  job_title: string;
  company_name: string;
  location: string | null;
  job_url: string;
  source?: string | null;
  date_posted?: string | null;
  match_score: number | null;
  recommendation: Recommendation | string | null;
  fit_summary: string | null;
  ranked_position: number | null;
  key_strengths_match: string[] | null;
}
