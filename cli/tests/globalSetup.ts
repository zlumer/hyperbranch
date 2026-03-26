import { execa } from 'execa';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';

export default async function setup() {
  console.log('Building CLI for E2E tests...');
  await execa('npx', ['tsdown'], { stdio: 'inherit' });
  
  // Try renaming to hb.js if hb.mjs exists
  try {
    await rename(join(process.cwd(), 'dist/hb.mjs'), join(process.cwd(), 'dist/hb.js'));
    console.log('Renamed dist/hb.mjs to dist/hb.js');
  } catch (e) {
    // maybe it was already hb.js
  }
}
