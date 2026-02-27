import { defineConfig } from '@rsbuild/core';

export default defineConfig({
  source: {
    entry: { index: './src/index.ts' },
    decorators: { version: 'legacy' },
  },
  html: {
    template: './src/index.html',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
