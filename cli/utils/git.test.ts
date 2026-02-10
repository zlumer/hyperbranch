import { assertEquals } from "@std/assert"
import { stub } from "@std/testing/mock"
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

// Ensure mock git is disabled for these tests as they use their own stub
Deno.env.set("HB_MOCK_GIT", "false");

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
