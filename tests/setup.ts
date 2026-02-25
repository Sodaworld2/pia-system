/**
 * Global test setup — runs before every test file
 * Sets environment variables needed by PIA modules
 */
process.env.NODE_ENV = 'test';
process.env.PIA_DB_PATH = ':memory:';        // In-memory SQLite for test isolation
process.env.PIA_LOG_LEVEL = 'error';         // Suppress info/debug logs during tests
process.env.ANTHROPIC_API_KEY = 'test-key-do-not-use';  // Prevent accidental real API calls
