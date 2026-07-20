-- Adds the tds_meta table for the TDS metacognitive strategy-coding layer.
-- Run this once against the existing Supabase project (SQL Editor) since schema.sql
-- only reflects a fresh install.

CREATE TABLE IF NOT EXISTS tds_meta (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  basic_class TEXT,
  meta_intro BOOLEAN DEFAULT FALSE,
  meta_intro_type TEXT,
  stg_naming INTEGER DEFAULT 0,
  stg_when INTEGER DEFAULT 0,
  stg_how INTEGER DEFAULT 0,
  stg_why INTEGER DEFAULT 0,
  stg_when_not INTEGER DEFAULT 0,
  missed_meta TEXT DEFAULT 'none',
  mo_score INTEGER DEFAULT 0,
  mo_components JSONB DEFAULT '[]'::jsonb,
  tds_reasoning TEXT,
  UNIQUE (analysis_id, start_time, end_time)
);

ALTER TABLE tds_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to tds_meta" ON tds_meta FOR SELECT USING (true);
CREATE POLICY "Allow public insert to tds_meta" ON tds_meta FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to tds_meta" ON tds_meta FOR UPDATE USING (true);
CREATE POLICY "Allow public delete to tds_meta" ON tds_meta FOR DELETE USING (true);
