import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // Tests never touch dev.db: every run gets a throwaway in-memory database.
    env: { DATABASE_URL: ':memory:', JWT_SECRET: 'test-secret' },
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
