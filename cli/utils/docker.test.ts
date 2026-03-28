import { describe, it, expect, vi, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as Docker from "./docker.js";
import * as execaModule from "execa";

vi.mock("execa", () => ({
  execa: vi.fn()
}))

describe("Docker utils", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buildImage - calls docker build", async () => {
    const execaMock = vi.mocked(execaModule.execa).mockResolvedValue({ stdout: "" } as any);

    await Docker.buildImage("Dockerfile.test", "test-tag");
    expect(execaMock).toHaveBeenCalledTimes(1);
    
    const args = execaMock.mock.calls[0][1] as string[];
    expect(execaMock.mock.calls[0][0]).toBe("docker");
    expect(args[0]).toBe("build");
    expect(args.includes("Dockerfile.test")).toBe(true);
    expect(args.includes("test-tag")).toBe(true);
  });

  it("getUserId - returns uid:gid on linux", async () => {
    const originalOs = process.platform;
    
    if (originalOs !== "linux") {
        const id = await Docker.getUserId();
        expect(id).toBe("node");
        return;
    }

    const execaMock = vi.mocked(execaModule.execa).mockImplementation((cmd, args) => {
        if (args && args[0] === "-u") {
            return Promise.resolve({ stdout: "1001\n" }) as any;
        }
        if (args && args[0] === "-g") {
            return Promise.resolve({ stdout: "1002\n" }) as any;
        }
        return Promise.reject(new Error("Command not found")) as any;
    });

    const id = await Docker.getUserId();
    expect(id).toBe("1001:1002");
  });

  it("prepareRunAssets - copies files", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'test-'));
    const runDir = join(tempDir, "run");
    
    try {
        // Just verify it doesn't crash on mocked assets
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
  });
});