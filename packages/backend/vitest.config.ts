import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    env: {
      DATABASE_URL: 'postgresql://pyr:pyr_dev_password@localhost:5432/pyr_test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-secret-must-be-at-least-32-characters-long',
      API_KEY: 'test-api-key-for-tests',
      NODE_ENV: 'test',
    },
  },
});
