-- Knowledge Graph Schema
-- Full schema for fresh installs
-- Use migrations for updates to existing graphs

-- ============================================
-- INDEXES - Speed up common queries
-- ============================================

-- File lookup by path
CREATE INDEX ON :File(path);

-- Function/Class lookup by qualified name
CREATE INDEX ON :Function(qualified_name);
CREATE INDEX ON :Class(qualified_name);

-- Project scoping
CREATE INDEX ON :File(project);

-- ============================================
-- CONSTRAINTS - Data integrity
-- ============================================

-- Unique qualified names (prevents duplicates)
CREATE CONSTRAINT ON (f:Function) ASSERT f.qualified_name IS UNIQUE;
CREATE CONSTRAINT ON (c:Class) ASSERT c.qualified_name IS UNIQUE;
CREATE CONSTRAINT ON (fl:File) ASSERT fl.path IS UNIQUE;

-- ============================================
-- RELATIONSHIP INDEXES
-- ============================================

-- Optimize call chain queries
CREATE INDEX ON :CALLS(line_number);
CREATE INDEX ON :IMPORTS(alias);
CREATE INDEX ON :DEFINES(line_number);
