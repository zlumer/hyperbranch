import path from 'path';
import fs from 'fs';
import { defineConfig } from 'tsdown';

const NODE_SHEBANG = "#!/usr/bin/env node\n";

export default defineConfig({
  entry: ['./src/hb.ts'],
  outDir: 'dist',
  format: ['esm'],
  clean: true,
  target: 'node20',
  platform: 'node',
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
  },
  deps: {}
});
