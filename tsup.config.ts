import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  shims: false,
  splitting: false,
  treeshake: true,
  minify: false,
  outDir: 'dist',
  target: 'node18',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
