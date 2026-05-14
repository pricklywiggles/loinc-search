import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '.env.local') });

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
