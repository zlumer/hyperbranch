import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import * as GitClones from "../utils/git-clones.ts";
import { git } from "../utils/git.ts";

Deno.test("Live GitClones Integration (No Mocks)", async (t) => {
  const tempDir = await Deno.makeTempDir({ prefix: "hb-live-clone-test-" });
  const repoDir = join(tempDir, "repo");
  const cloneDir = join(tempDir, "clone");
  
  console.log(`Debug: Test running in ${tempDir}`);

  try {
    await ensureDir(repoDir);
    await git(["init"], repoDir);
    await git(["config", "user.email", "test@example.com"], repoDir);
    await git(["config", "user.name", "Test User"], repoDir);
    await Deno.writeTextFile(join(repoDir, "README.md"), "# Test Repo");
    await git(["add", "README.md"], repoDir);
    await git(["commit", "-m", "Initial commit"], repoDir);

    await t.step("creates clone", async () => {
      // For a fresh repo, base is master or main. Let's find out.
      const branch = await git(["branch", "--show-current"], repoDir);
      await GitClones.createClone("hb/task1/1", branch, cloneDir, repoDir);
      
      const dotGitPath = join(cloneDir, ".git");
      const existsDotGit = await exists(dotGitPath);
      assertEquals(existsDotGit, true, "Clone .git dir should exist");

      // Verify remote exists in repo
      const remotes = await git(["remote"], repoDir);
      assertStringIncludes(remotes, "hb-task1-1");
    });

    await t.step("removes clone", async () => {
      await GitClones.removeClone(cloneDir, "hb/task1/1", false, repoDir);
      
      const existsDotGit = await exists(cloneDir);
      assertEquals(existsDotGit, false, "Clone dir should not exist");

      // Verify remote is removed
      const remotes = await git(["remote"], repoDir);
      assertEquals(remotes.includes("hb-task1-1"), false);
    });

  } finally {
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  }
});
