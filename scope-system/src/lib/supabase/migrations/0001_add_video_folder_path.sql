-- Adds folder hierarchy support to the videos table.
-- Run this once against the existing Supabase project (SQL Editor) since schema.sql
-- only reflects a fresh install.

ALTER TABLE videos ADD COLUMN IF NOT EXISTS folder_path TEXT;
COMMENT ON COLUMN videos.folder_path IS 'Optional folder hierarchy for organizing videos, e.g. "Class A/Lesson 1" (segments separated by "/")';
