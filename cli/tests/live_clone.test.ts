import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import * as GitClones from "../utils/git-clones.js";
import { git } from "../utils/git.js";

describe.sequential("Live GitClones Integration (No Mocks)", () => {
  let tempDir: string;
  let repoDir: string;
  let cloneDir: string;

  beforeAll(async () => {
    tempDir = await fsPromises.mkdtemp(join(process.cwd(), "hb-live-clone-test-"));
    repoDir = join(tempDir, "repo");
    cloneDir = join(tempDir, "clone");
    
    console.log(`Debug: Test running in ${tempDir}`);

    await fsPromises.mkdir(repoDir, { recursive: true });
    await git(["init"], repoDir);
    await git(["config", "user.email", "test@example.com"], repoDir);
    await git(["config", "user.name", "Test User"], repoDir);
    await fsPromises.writeFile(join(repoDir, "README.md"), "# Test Repo");
    await git(["add", "README.md"], repoDir);
    await git(["commit", "-m", "Initial commit"], repoDir);
  });

  afterAll(async () => {
    if (tempDir) {
      try {
        await fsPromises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("creates clone", async () => {
    const branch = await git(["branch", "--show-current"], repoDir);
    await GitClones.createClone("hb/task1/1", branch, cloneDir, repoDir);
    
    const dotGitPath = join(cloneDir, ".git");
    const existsDotGit = fs.existsSync(dotGitPath);
    expect(existsDotGit).toBe(true);

    const remotes = await git(["remote"], repoDir);
    expect(remotes).toContain("hb-task1-1");
  });

  it("removes clone", async () => {
    await GitClones.removeClone(cloneDir, "hb/task1/1", false, repoDir);
    
    const existsDotGit = fs.existsSync(cloneDir);
    expect(existsDotGit).toBe(false);

    const remotes = await git(["remote"], repoDir);
    expect(remotes.includes("hb-task1-1")).toBe(false);
  });
});
