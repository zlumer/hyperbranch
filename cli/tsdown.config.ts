import { defineConfig } from 'tsdown';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  entry: ['./src/hb.ts'],
  outDir: 'dist',
  format: ['esm'],
  clean: true,
  target: 'node20',
  platform: 'node',
  deps: {
    alwaysBundle: Object.keys(pkg.dependencies || {})
  }
});
