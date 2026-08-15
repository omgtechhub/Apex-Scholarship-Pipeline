import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/__tests__/auth.test.ts',
      'src/__tests__/admin-crawl.test.ts',
      'src/__tests__/ai-retry.test.ts',
      'src/__tests__/pipeline.test.ts',
      'src/__tests__/quality.test.ts',
      'src/__tests__/e2e-pipeline.test.ts',
    ],
  },
});
