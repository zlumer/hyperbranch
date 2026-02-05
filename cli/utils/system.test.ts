import { assertEquals } from "@std/assert"
import { stub } from "@std/testing/mock"
import { join } from "@std/path"
import * as System from "./system.ts"

// Helper to mock Deno.Command for package managers
function mockPkgManagers(outputs: Record<string, string>) {
	// @ts-ignore: Stubbing Deno.Command
	return stub(Deno, "Command", (cmd: string | URL, options?: Deno.CommandOptions) => {
		const args = options?.args || [];
		const fullCmd = [cmd, ...args].join(" ");
		
		if (outputs[fullCmd]) {
			return {
				output: () => Promise.resolve({
					success: true,
					code: 0,
					stdout: new TextEncoder().encode(outputs[fullCmd]),
					stderr: new Uint8Array()
				})
			} as unknown as Deno.Command;
		}
		
		return {
			output: () => Promise.resolve({
				success: false,
				code: 1,
				stdout: new Uint8Array(),
				stderr: new TextEncoder().encode("Command not found")
			})
		} as unknown as Deno.Command;
	});
}

Deno.test("getPackageCacheMounts - detects npm", async () => {
	const tempDir = await Deno.makeTempDir();
	const originalCwd = Deno.cwd();
	const cmdStub = mockPkgManagers({
		"npm config get cache": "/mock/npm/cache"
	});

	try {
		Deno.chdir(tempDir);
		await Deno.writeTextFile("package-lock.json", "{}");

		const mounts = await System.getPackageCacheMounts();
		assertEquals(mounts, [`-v "/mock/npm/cache:/root/.npm"`]);
	} finally {
		Deno.chdir(originalCwd);
		await Deno.remove(tempDir, { recursive: true });
		cmdStub.restore();
	}
});

Deno.test("getPackageCacheMounts - detects multiple", async () => {
	const tempDir = await Deno.makeTempDir();
	const originalCwd = Deno.cwd();
	const cmdStub = mockPkgManagers({
		"npm config get cache": "/mock/npm/cache",
		"yarn cache dir": "/mock/yarn/cache"
	});

	try {
		Deno.chdir(tempDir);
		await Deno.writeTextFile("package-lock.json", "{}");
		await Deno.writeTextFile("yarn.lock", "");

		const mounts = await System.getPackageCacheMounts();
		assertEquals(mounts.length, 2);
		assertEquals(mounts, [
			`-v "/mock/npm/cache:/root/.npm"`,
			`-v "/mock/yarn/cache:/usr/local/share/.cache/yarn"`
		]);
	} finally {
		Deno.chdir(originalCwd);
		await Deno.remove(tempDir, { recursive: true });
		cmdStub.restore();
	}
});

Deno.test("getAgentConfigMount - creates dir and returns mount", async () => {
	const tempHome = await Deno.makeTempDir();
	const originalEnv = Deno.env.get;
	
	const envStub = stub(Deno.env, "get", (key: string) => {
		if (key === "HOME") return tempHome;
		return originalEnv(key);
	});

	try {
		const mount = await System.getAgentConfigMount();
		const opencodePath = join(tempHome, ".opencode");
		
		// Check dir creation
		const stat = await Deno.stat(opencodePath);
		assertEquals(stat.isDirectory, true);
		
		// Check string
		assertEquals(mount, `-v "${opencodePath}:/root/.opencode:ro"`);
	} finally {
		envStub.restore();
		await Deno.remove(tempHome, { recursive: true });
	}
});

Deno.test("getEnvVars - filters vars", () => {
	const originalEnv = Deno.env.toObject();
	Deno.env.set("TEST_VAR_A", "valueA");
	Deno.env.set("TEST_VAR_B", "valueB");
	
	try {
		const vars = System.getEnvVars(["TEST_VAR_A", "MISSING_VAR"]);
		assertEquals(vars, { "TEST_VAR_A": "valueA" });
		assertEquals(vars["TEST_VAR_B"], undefined);
	} finally {
		Deno.env.delete("TEST_VAR_A");
		Deno.env.delete("TEST_VAR_B");
	}
});
