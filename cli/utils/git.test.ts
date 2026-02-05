import { assertEquals, assertRejects } from "@std/assert"
import { stub, Spy, assertSpyCalls } from "@std/testing/mock"
import { join } from "@std/path"
import * as Git from "./git.ts"
import { getRunBranchName, getRunBranchPrefix } from "./branch-naming.ts"

// Mock Deno.Command to avoid actual git execution
function mockGit(outputs: Record<string, { stdout?: string, stderr?: string, success: boolean }>) {
	// @ts-ignore: Stub types are tricky with Deno namespace
	return stub(Deno, "Command", (cmd: string | URL, options?: Deno.CommandOptions) => {
		if (cmd !== "git") {
			throw new Error(`Unexpected command: ${cmd}`);
		}
		const args = options?.args || [];
		const key = args.join(" ");
		
		// Find matching output or default
		let result = outputs[key];
		
		// Fallback for prefix matching if needed, or just strict match
		if (!result) {
			// Try to match basic commands
			// For "branch --list task/123/run-*", we need to match the dynamic key
			for (const k in outputs) {
				if (k.endsWith("*") && key.startsWith(k.slice(0, -1))) {
					result = outputs[k];
					break;
				}
			}
		}

		if (!result) {
			// Return successful empty for unmocked commands to avoid crashing unrelated tests, 
			// or throw to be strict. Let's return failure to be safe.
			return {
				output: () => Promise.resolve({
					success: false,
					code: 1,
					stdout: new Uint8Array(),
					stderr: new TextEncoder().encode(`Unmocked command: ${key}`)
				})
			} as unknown as Deno.Command;
		}

		return {
			output: () => Promise.resolve({
				success: result.success,
				code: result.success ? 0 : 1,
				stdout: new TextEncoder().encode(result.stdout || ""),
				stderr: new TextEncoder().encode(result.stderr || "")
			})
		} as unknown as Deno.Command;
	});
}

Deno.test("isGitDirty - returns true when dirty", async () => {
	const commandStub = mockGit({
		"diff-index --quiet HEAD --": { success: false } // Exit code 1 means dirty
	});
	try {
		assertEquals(await Git.isGitDirty(), true);
	} finally {
		commandStub.restore();
	}
});

Deno.test("isGitDirty - returns false when clean", async () => {
	const commandStub = mockGit({
		"diff-index --quiet HEAD --": { success: true }
	});
	try {
		assertEquals(await Git.isGitDirty(), false);
	} finally {
		commandStub.restore();
	}
});

Deno.test("createStash - creates stash if dirty", async () => {
	const commandStub = mockGit({
		"diff-index --quiet HEAD --": { success: false },
		"stash create": { success: true, stdout: "abc123hash\n" }
	});
	try {
		const hash = await Git.createStash();
		assertEquals(hash, "abc123hash");
	} finally {
		commandStub.restore();
	}
});

Deno.test("createStash - returns null if clean", async () => {
	const commandStub = mockGit({
		"diff-index --quiet HEAD --": { success: true }
	});
	try {
		const hash = await Git.createStash();
		assertEquals(hash, null);
	} finally {
		commandStub.restore();
	}
});

Deno.test("getNextRunBranch - increments index", async () => {
	const prefix = getRunBranchPrefix("123");
	const commandStub = mockGit({
		[`branch --list ${prefix}*`]: { 
			success: true, 
			stdout: `  ${prefix}1\n  ${prefix}2\n` 
		}
	});
	try {
		const branch = await Git.getNextRunBranch("123");
		assertEquals(branch, getRunBranchName("123", 3));
	} finally {
		commandStub.restore();
	}
});

Deno.test("getNextRunBranch - starts at 1", async () => {
	const prefix = getRunBranchPrefix("456");
	const commandStub = mockGit({
		[`branch --list ${prefix}*`]: { success: true, stdout: "" }
	});
	try {
		const branch = await Git.getNextRunBranch("456");
		assertEquals(branch, getRunBranchName("456", 1));
	} finally {
		commandStub.restore();
	}
});

Deno.test("applyStash - throws on conflict", async () => {
	const commandStub = mockGit({
		"stash apply hash123": { success: false, stderr: "Merge conflict in file.txt" }
	});
	try {
		await assertRejects(
			async () => await Git.applyStash("path", "hash123"),
			Error,
			"Conflict detected"
		);
	} finally {
		commandStub.restore();
	}
});

Deno.test("copyIgnoredFiles - respects excludes", async () => {
	const tempDir = await Deno.makeTempDir();
	const srcDir = await Deno.makeTempDir();
	const originalCwd = Deno.cwd();

	try {
		Deno.chdir(srcDir);
		
		// Create file structure
		await Deno.mkdir(".env-files");
		await Deno.writeTextFile(".env-files/.env.prod", "SECRET=PROD");
		await Deno.writeTextFile(".env-files/.env.local", "SECRET=LOCAL"); // Should be excluded
		
		await Deno.mkdir("node_modules");
		await Deno.writeTextFile("node_modules/pkg.json", "{}");
		await Deno.mkdir("node_modules/.cache");
		await Deno.writeTextFile("node_modules/.cache/cache.txt", "garbage"); // Should be excluded

		const config = {
			include: [".env-files/*"],
			exclude: [".env-files/.env.local"],
			includeDirs: ["node_modules"],
			excludeDirs: ["node_modules/.cache"]
		};

		await Git.copyIgnoredFiles(tempDir, config);

		// Verify .env files
		const copiedEnvProd = await Deno.stat(join(tempDir, ".env-files/.env.prod")).then(() => true).catch(() => false);
		const copiedEnvLocal = await Deno.stat(join(tempDir, ".env-files/.env.local")).then(() => true).catch(() => false);
		
		assertEquals(copiedEnvProd, true, ".env.prod should be copied");
		assertEquals(copiedEnvLocal, false, ".env.local should be excluded");

		// Verify node_modules
		const copiedPkg = await Deno.stat(join(tempDir, "node_modules/pkg.json")).then(() => true).catch(() => false);
		const copiedCache = await Deno.stat(join(tempDir, "node_modules/.cache/cache.txt")).then(() => true).catch(() => false);
		
		assertEquals(copiedPkg, true, "node_modules/pkg.json should be copied");
		assertEquals(copiedCache, false, "node_modules/.cache should be excluded");

	} finally {
		Deno.chdir(originalCwd);
		await Deno.remove(tempDir, { recursive: true });
		await Deno.remove(srcDir, { recursive: true });
	}
});
