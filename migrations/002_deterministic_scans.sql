-- Migration: 002_deterministic_scans.sql
-- Description: Creates deterministic_scans table and query indices for deterministic mode beta

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS deterministic_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(255) NOT NULL,
    mode VARCHAR(50) NOT NULL DEFAULT 'deep',
    overall_score INTEGER NOT NULL,
    letter_grade VARCHAR(10),
    archetype VARCHAR(100),
    data JSONB NOT NULL,
    api_calls_used INTEGER DEFAULT 0,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deterministic_scans_user_id_created_at 
    ON deterministic_scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deterministic_scans_username_mode_created_at 
    ON deterministic_scans(LOWER(username), mode, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deterministic_scans_overall_score 
    ON deterministic_scans(overall_score DESC);

