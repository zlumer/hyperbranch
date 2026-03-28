import path from 'path';
import fs from 'fs';
import { defineConfig } from 'tsdown';

const NODE_SHEBANG = "#!/usr/bin/env node\n";

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));

export default defineConfig({
  entry: ['./src/hb.ts'],
  outDir: 'dist',
  format: ['esm'],
  clean: true,
  shims: true,
  target: 'node20',
  platform: 'node',
  deps: {
	alwaysBundle: Object.keys(packageJson.dependencies || {}),
	neverBundle: Object.keys(packageJson.devDependencies || {}),
	onlyBundle: false,
  },
  hooks: {
	"build:done"(ctx)
	{
		const HB_PATH = path.join(ctx.options.outDir, 'hb.mjs');
		const JS_OUT_PATH = HB_PATH.replace(/\.mjs$/, '.js');
		let content = fs.readFileSync(HB_PATH, 'utf-8');
		if (content.startsWith('#!'))
			content = content.replace(/^#!.*\n/, '');
		else
			console.warn('Warning: Generated hb.mjs does not start with a shebang. Adding shebang.');
		
		content = NODE_SHEBANG + content;
		
		fs.writeFileSync(JS_OUT_PATH, content);
		fs.chmodSync(JS_OUT_PATH, 0o755);
	},
  }
});
