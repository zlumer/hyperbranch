import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { loadConfig } from "./config.ts"

describe("loadConfig", () => {
  it("defaults", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'test-'));
    const originalCwd = process.cwd();
    
    try {
      process.chdir(tempDir);
      const config = await loadConfig();
      expect(config.env_vars).toEqual([]);
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("reads table config", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'test-'));
    const originalCwd = process.cwd();
    
    try {
      process.chdir(tempDir);
      const hbDir = join(tempDir, ".hyperbranch");
      await mkdir(hbDir, { recursive: true });
      await writeFile(join(hbDir, "config.toml"), `
env_vars = ["TEST"]
`);

      const config = await loadConfig();
      expect(config.env_vars).toEqual(["TEST"]);
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
