/**
 * Shared, schema-aligned constants.
 *
 * The string values here must match the values allowed by
 * supabase/schema.sql — they are written straight into Postgres.
 */

export const APPLICATION_STATUSES = [
  'Applied',
  'In Process',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const INTERVIEW_TYPES = ['Phone', 'Video', 'On-site', 'Take-home', 'Panel'] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const OFFER_STATUSES = ['Received', 'Negotiating', 'Accepted', 'Declined'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const REMOTE_STATUSES = ['Remote', 'Hybrid', 'On-site'] as const;
export type RemoteStatus = (typeof REMOTE_STATUSES)[number];

export const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'] as const;

export const BOARD_STATUSES = ['Working', 'Partial', 'Down', 'Unknown'] as const;
export type BoardStatusValue = (typeof BOARD_STATUSES)[number];

export type UserRole = 'owner' | 'viewer';

/**
 * Every job board the scraper targets. The dashboard renders a row for each of
 * these even when the board has no row in `job_board_status` yet (it then
 * shows as "Unknown / Not yet scraped"); any board the scraper reports that is
 * missing from this list is appended automatically.
 *
 * These names are byte-identical to the `board_name` values written by
 * `scraper/job_scraper_v2.py` (its `self.scrapers` registry) — keep the two in
 * sync, otherwise a board will show up twice.
 */
export const JOB_BOARDS = [
  // Group A — official APIs
  'Adzuna',
  'Reed',
  // Group B — HTML parsers
  'Dev IT Jobs',
  'Artificial Intelligence Jobs UK',
  'Harnham',
  'TechSpark',
  'AI Jobs',
  'HN Hiring',
  'AI Startups List UK',
  'IT Job Board',
  'Foorilla',
  // Group C — stubs / JS-rendered boards
  'CW Jobs',
  'Free Work',
  'Hiring Cafe',
  'Welcome to the Jungle',
  'Wellfound',
  'Built In London',
  'Work in Startups',
  'LinkedIn',
  'Indeed',
  'Total Jobs',
  'Glassdoor UK',
  'Built In',
  'Silicon Roundabout',
  'Remote Rocketship',
] as const;

export type JobBoardName = (typeof JOB_BOARDS)[number];

/** Sidebar navigation (also used to resolve the page title in the header). */
export const NAV_ITEMS = [
  { href: '/dashboard/jobs', label: 'Jobs', icon: 'briefcase' },
  { href: '/dashboard/applications', label: 'Applications', icon: 'send' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: 'chart' },
  { href: '/dashboard/board-status', label: 'Board Status', icon: 'pulse' },
  { href: '/dashboard/board-statistics', label: 'Board Statistics', icon: 'stack' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'cog' },
] as const;

/** Palette used by the recharts visualisations (works on light + dark). */
export const CHART_COLORS = [
  '#6366f1',
  '#06b6d4',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
  '#f97316',
  '#3b82f6',
  '#a3e635',
  '#e11d48',
];
