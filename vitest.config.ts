import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The domain kernel is pure TypeScript: no DOM needed.
    environment: 'node',
  },
});
