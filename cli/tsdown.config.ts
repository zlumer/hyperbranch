import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/hb.ts'],
  outDir: 'dist',
  format: ['esm'],
  clean: true,
  target: 'node20',
  platform: 'node',
  deps: {}
});
