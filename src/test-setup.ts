// Vitest global test setup — runs before each test file
// Stub required environment variables so module-level guards don't throw during tests.

process.env.GITHUB_TOKENS = "test-token-1,test-token-2";
process.env.JWT_SECRET = "test-jwt-secret-at-least-32-characters-long";
process.env.ENCRYPTION_KEY = "test-encryption-key-32-characters!";
