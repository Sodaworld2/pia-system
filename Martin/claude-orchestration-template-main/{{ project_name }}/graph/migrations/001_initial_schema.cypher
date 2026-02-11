-- Initial schema setup
-- Migration 001
--
-- Creates core indexes and constraints for code knowledge graph.
-- Idempotent: safe to re-run.

-- Core indexes
CREATE INDEX IF NOT EXISTS ON :File(path);
CREATE INDEX IF NOT EXISTS ON :Function(qualified_name);
CREATE INDEX IF NOT EXISTS ON :Class(qualified_name);
CREATE INDEX IF NOT EXISTS ON :File(project);

-- Constraints (uniqueness)
CREATE CONSTRAINT IF NOT EXISTS ON (f:Function) ASSERT f.qualified_name IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS ON (c:Class) ASSERT c.qualified_name IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS ON (fl:File) ASSERT fl.path IS UNIQUE;

-- Relationship indexes
CREATE INDEX IF NOT EXISTS ON :CALLS(line_number);
CREATE INDEX IF NOT EXISTS ON :IMPORTS(alias);
CREATE INDEX IF NOT EXISTS ON :DEFINES(line_number);
