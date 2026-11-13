import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.unit.test.ts', 'scripts/**/*.unit.test.ts', 'tests/**/*.unit.test.ts'] },
});
