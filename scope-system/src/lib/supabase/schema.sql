-- Create custom types for our system
CREATE TYPE analysis_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE tag_category AS ENUM ('ATES', 'CLASSROOM_MANAGEMENT', 'LEARNER_ENGAGEMENT', 'CUSTOM');

-- 1. Videos Table
-- Stores metadata about the uploaded videos
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  title TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL, -- Path in Supabase Storage
  duration_seconds INTEGER,
  status analysis_status DEFAULT 'pending',
  metadata JSONB DEFAULT '{}'::jsonb,
  folder_path TEXT -- Optional folder hierarchy for organizing videos, e.g. "Class A/Lesson 1" (segments separated by "/")
);

-- 2. Codebooks Table
-- Defines the structure of tags (e.g. D_PLAN, S_MONITOR)
CREATE TABLE codebooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  name TEXT NOT NULL,
  category tag_category DEFAULT 'ATES',
  description TEXT,
  codes JSONB NOT NULL -- Array of objects: { id: "D_PLAN", label: "Direct Planning", ... }
);

-- 3. Analyses Table
-- Represents a single analysis run on a video (either AI-generated or Manual Tagging session)
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  codebook_id UUID REFERENCES codebooks(id) ON DELETE SET NULL,
  is_ai_generated BOOLEAN DEFAULT FALSE,
  user_id UUID, -- For manual tagging, reference to auth.users (optional for now)
  summary_metrics JSONB DEFAULT '{}'::jsonb -- Stores Talk Ratio, etc.
);

-- 4. Tags Table
-- The actual tags/segments on the video timeline
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
  code_id TEXT NOT NULL, -- References the code ID in the codebook (e.g. "D_PLAN")
  start_time FLOAT NOT NULL, -- in seconds
  end_time FLOAT NOT NULL, -- in seconds
  evidence_text TEXT, -- Text transcript snippet
  confidence_score FLOAT, -- For AI generated tags
  notes TEXT -- For manual tagging
);

-- 5. TDS Meta-Coding Table
-- Metacognitive strategy-coding layer attached to TDS_* tagged events
CREATE TABLE tds_meta (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
  start_time FLOAT NOT NULL, -- in seconds
  end_time FLOAT NOT NULL, -- in seconds
  basic_class TEXT, -- 'COG' | 'OVERLAP' | 'META'
  meta_intro BOOLEAN DEFAULT FALSE,
  meta_intro_type TEXT,
  stg_naming INTEGER DEFAULT 0,
  stg_when INTEGER DEFAULT 0,
  stg_how INTEGER DEFAULT 0,
  stg_why INTEGER DEFAULT 0,
  stg_when_not INTEGER DEFAULT 0,
  missed_meta TEXT DEFAULT 'none', -- 'none' | 'partial' | 'full'
  mo_score INTEGER DEFAULT 0,
  mo_components JSONB DEFAULT '[]'::jsonb,
  tds_reasoning TEXT,
  UNIQUE (analysis_id, start_time, end_time)
);

-- Setup basic Row Level Security (RLS)
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE codebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tds_meta ENABLE ROW LEVEL SECURITY;

-- Create policies to allow anon/authenticated access (For MVP purposes, allowing full access. Update later for production)
CREATE POLICY "Allow public read access to videos" ON videos FOR SELECT USING (true);
CREATE POLICY "Allow public insert to videos" ON videos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to videos" ON videos FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to codebooks" ON codebooks FOR SELECT USING (true);
CREATE POLICY "Allow public insert to codebooks" ON codebooks FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read access to analyses" ON analyses FOR SELECT USING (true);
CREATE POLICY "Allow public insert to analyses" ON analyses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to analyses" ON analyses FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to tags" ON tags FOR SELECT USING (true);
CREATE POLICY "Allow public insert to tags" ON tags FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to tags" ON tags FOR UPDATE USING (true);
CREATE POLICY "Allow public delete to tags" ON tags FOR DELETE USING (true);

CREATE POLICY "Allow public read access to tds_meta" ON tds_meta FOR SELECT USING (true);
CREATE POLICY "Allow public insert to tds_meta" ON tds_meta FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to tds_meta" ON tds_meta FOR UPDATE USING (true);
CREATE POLICY "Allow public delete to tds_meta" ON tds_meta FOR DELETE USING (true);
