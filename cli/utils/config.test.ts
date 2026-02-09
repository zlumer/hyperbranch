import { assertEquals } from "@std/assert"
import { join } from "@std/path"
import { ensureDir } from "@std/fs/ensure-dir"
import { loadConfig } from "./config.ts"

Deno.test("loadConfig - defaults", async () => {
	const tempDir = await Deno.makeTempDir();
	const originalCwd = Deno.cwd();
	
	try {
		Deno.chdir(tempDir);
		const config = await loadConfig();
		assertEquals(config.env_vars, []);
	} finally {
		Deno.chdir(originalCwd);
		await Deno.remove(tempDir, { recursive: true });
	}
});

Deno.test("loadConfig - reads table config", async () => {
	const tempDir = await Deno.makeTempDir();
	const originalCwd = Deno.cwd();
	
	try {
		Deno.chdir(tempDir);
		const hbDir = join(tempDir, ".hyperbranch");
		await ensureDir(hbDir);
		await Deno.writeTextFile(join(hbDir, "config.toml"), `
env_vars = ["TEST"]
`);

		const config = await loadConfig();
		assertEquals(config.env_vars, ["TEST"]);
	} finally {
		Deno.chdir(originalCwd);
		await Deno.remove(tempDir, { recursive: true });
	}
});
