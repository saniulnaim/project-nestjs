import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    // Tests never touch dev.db: every run gets a throwaway in-memory database.
    env: { DATABASE_URL: ':memory:', JWT_SECRET: 'test-secret' },
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
  },
});
