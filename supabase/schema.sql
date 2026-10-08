-- ============================================
-- JobHunt Command Center — Supabase schema
-- Run this once in the Supabase SQL Editor (New Query → paste → Run).
-- ============================================

-- ============================================
-- TABLE 1: USERS
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'owner', -- 'owner' or 'viewer'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Auto-create a public.users row whenever someone signs up via Supabase Auth,
-- so RLS policies that join against users/invites have something to match on
-- without the app having to remember to insert it client-side.
CREATE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================
-- TABLE 2: JOBS (All scraped jobs)
-- ============================================

CREATE TABLE jobs (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_url TEXT NOT NULL,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT DEFAULT 'GBP',
  description TEXT,
  location TEXT,
  job_type TEXT, -- 'Full-time', 'Contract', 'Intern'
  visa_sponsorship BOOLEAN,
  remote_status TEXT, -- 'On-site', 'Remote', 'Hybrid'
  company_size TEXT, -- 'Startup', 'Scale-up', 'Enterprise'
  funding_stage TEXT, -- 'Seed', 'Series A', 'Series B', 'Public'
  date_posted TIMESTAMP,
  date_scraped TIMESTAMP DEFAULT NOW(),
  source TEXT NOT NULL, -- 'Indeed', 'Wellfound', 'LinkedIn', etc.
  tags TEXT[], -- Array of tech keywords
  is_tier1_company BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, job_url) -- Prevent duplicates
);

CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_date_posted ON jobs(date_posted DESC);
CREATE INDEX idx_jobs_source ON jobs(source);
CREATE INDEX idx_jobs_visa ON jobs(visa_sponsorship);

-- ============================================
-- TABLE 3: APPLICATIONS (Your tracked applications)
-- ============================================

CREATE TABLE applications (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  status TEXT DEFAULT 'Applied',
    -- Statuses: 'Applied', 'Rejected', 'In Process', 'Interview', 'Offer', 'Withdrawn'
  date_applied TIMESTAMP DEFAULT NOW(),
  date_of_response TIMESTAMP,
  rejection_reason TEXT,
  interview_date TIMESTAMP,
  interview_type TEXT, -- 'Phone', 'Video', 'On-site'
  interview_notes TEXT,
  offer_salary_min INTEGER,
  offer_salary_max INTEGER,
  offer_equity TEXT,
  offer_start_date DATE,
  offer_status TEXT, -- 'Received', 'Accepted', 'Declined', 'Negotiating'
  cover_letter_used TEXT,
  cv_used TEXT,
  follow_up_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_applications_user_id ON applications(user_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_date ON applications(date_applied DESC);

-- ============================================
-- TABLE 4: JOB BOARD STATUS (Scraper health)
-- ============================================

CREATE TABLE job_board_status (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board_name TEXT NOT NULL,
  status TEXT DEFAULT 'Unknown', -- 'Working', 'Down', 'Partial'
  jobs_scraped_today INTEGER DEFAULT 0,
  last_scraped TIMESTAMP,
  error_message TEXT,
  error_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, board_name)
);

CREATE INDEX idx_board_status_user ON job_board_status(user_id);
CREATE INDEX idx_board_status_updated ON job_board_status(updated_at DESC);

-- ============================================
-- TABLE 5: JOB BOARD STATISTICS (Analytics)
-- ============================================

CREATE TABLE job_board_stats (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  board_name TEXT NOT NULL,
  total_jobs_scraped INTEGER DEFAULT 0,
  jobs_this_month INTEGER DEFAULT 0,
  jobs_this_week INTEGER DEFAULT 0,
  jobs_today INTEGER DEFAULT 0,
  avg_salary_min INTEGER,
  avg_salary_max INTEGER,
  visa_sponsorship_percent FLOAT,
  response_rate FLOAT, -- % of jobs you applied to that got responses
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, board_name)
);

CREATE INDEX idx_board_stats_user ON job_board_stats(user_id);

-- ============================================
-- TABLE 6: INVITES (Access management)
-- ============================================

CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_email TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'viewer',
  accepted BOOLEAN DEFAULT FALSE,
  accepted_by_id UUID REFERENCES users(id),
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX idx_invites_owner ON invites(owner_id);
CREATE INDEX idx_invites_code ON invites(invite_code);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_board_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_board_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - USERS
-- ============================================

CREATE POLICY "Users can see own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- ============================================
-- RLS POLICIES - JOBS
-- ============================================

CREATE POLICY "Users can see own jobs" ON jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Viewers can see owner jobs" ON jobs
  FOR SELECT USING (
    user_id IN (
      SELECT owner_id FROM invites
      WHERE accepted = TRUE AND accepted_by_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert jobs" ON jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs" ON jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own jobs" ON jobs
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- RLS POLICIES - APPLICATIONS
-- ============================================

CREATE POLICY "Users can see own applications" ON applications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert applications" ON applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applications" ON applications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own applications" ON applications
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Viewers can see owner applications" ON applications
  FOR SELECT USING (
    user_id IN (
      SELECT owner_id FROM invites
      WHERE accepted = TRUE AND accepted_by_id = auth.uid()
    )
  );

-- ============================================
-- RLS POLICIES - BOARD STATUS
-- ============================================

CREATE POLICY "Users can see own board status" ON job_board_status
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own board status" ON job_board_status
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own board status" ON job_board_status
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Viewers can see owner board status" ON job_board_status
  FOR SELECT USING (
    user_id IN (
      SELECT owner_id FROM invites
      WHERE accepted = TRUE AND accepted_by_id = auth.uid()
    )
  );

-- ============================================
-- RLS POLICIES - BOARD STATS
-- ============================================

CREATE POLICY "Users can see own board stats" ON job_board_stats
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own board stats" ON job_board_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own board stats" ON job_board_stats
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Viewers can see owner board stats" ON job_board_stats
  FOR SELECT USING (
    user_id IN (
      SELECT owner_id FROM invites
      WHERE accepted = TRUE AND accepted_by_id = auth.uid()
    )
  );

-- ============================================
-- RLS POLICIES - INVITES
-- ============================================

CREATE POLICY "Owners can manage invites" ON invites
  FOR ALL USING (auth.uid() = owner_id);

-- A viewer needs to be able to read + accept the single invite addressed to
-- them (by code) before they're in accepted_by_id — otherwise they can never
-- complete the accept flow in the first place.
CREATE POLICY "Invitee can read their own pending invite" ON invites
  FOR SELECT USING (accepted = FALSE AND expires_at > NOW());

CREATE POLICY "Invitee can accept their own invite" ON invites
  FOR UPDATE USING (accepted = FALSE AND expires_at > NOW())
  WITH CHECK (accepted_by_id = auth.uid());
