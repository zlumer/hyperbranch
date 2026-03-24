import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import fsPromises from "node:fs/promises";
import * as GitClones from "../utils/git-clones.ts";
import { execa } from "execa";

vi.mock("execa");

describe.sequential("GitClones Integration", () => {
  let tempDir: string;
  let cloneDir: string;

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(join(process.cwd(), "hb-test-git-clone-"));
    cloneDir = join(tempDir, "clone");
    await fsPromises.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("creates clone using git clone with proper branch", async () => {
    const calledArgs: string[][] = [];
    
    // @ts-ignore
    vi.mocked(execa).mockImplementation((cmd, args) => {
      if (cmd !== "git") {
        return Promise.reject(new Error(`Unexpected command: ${cmd}`));
      }
      calledArgs.push((args as string[]) || []);
      return Promise.resolve({
        stdout: "",
        stderr: "",
        exitCode: 0,
        failed: false,
      } as any);
    });

    await GitClones.createClone("hb/task1/1", "base", cloneDir, tempDir);
    
    expect(calledArgs.length).toBe(3);
    expect(calledArgs[0]).toEqual(["branch", "hb/task1/1", "base"]);
    expect(calledArgs[1]).toEqual(["clone", "-b", "hb/task1/1", "--single-branch", "--depth", "1", ".", cloneDir]);
    expect(calledArgs[2]).toEqual(["remote", "add", "hb-task1-1", cloneDir]);
  });
});
