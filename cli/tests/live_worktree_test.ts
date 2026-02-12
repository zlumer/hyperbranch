import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import * as GitWorktree from "../utils/git-worktree.ts";
import { git } from "../utils/git.ts";

Deno.test("Live GitWorktree Integration (No Mocks)", async (t) => {
  // 1. Setup Environment
  const originalMockGit = Deno.env.get("HB_MOCK_GIT");
  Deno.env.set("HB_MOCK_GIT", "false"); // Disable mocks to use real git

  const tempDir = await Deno.makeTempDir({ prefix: "hb-live-test-" });
  const repoDir = join(tempDir, "repo");
  const worktreeDir = join(tempDir, "wt");
  
  console.log(`Debug: Test running in ${tempDir}`);

  try {
    // 2. Initialize Repo
    await ensureDir(repoDir);
    await git(["init"], repoDir);
    await git(["config", "user.email", "test@example.com"], repoDir);
    await git(["config", "user.name", "Test User"], repoDir);
    await Deno.writeTextFile(join(repoDir, "README.md"), "# Test Repo");
    await git(["add", "README.md"], repoDir);
    await git(["commit", "-m", "Initial commit"], repoDir);

    // 3. Create Worktree
    await t.step("creates worktree with relative paths", async () => {
      await GitWorktree.createWorktree("feature-branch", "master", worktreeDir, repoDir);
      
      // Verify existence
      const dotGitPath = join(worktreeDir, ".git");
      const existsDotGit = await exists(dotGitPath);
      assertEquals(existsDotGit, true, "Worktree .git file should exist");

      // Verify Content is relative
      const dotGitContent = await Deno.readTextFile(dotGitPath);
      console.log(`Debug: .git content: ${dotGitContent.trim()}`);
      
      // Should start with "gitdir: ../" (relative path)
      // It might be "..\/repo/..." on Windows or "../repo/..." on Posix
      assertStringIncludes(dotGitContent, "../repo/.git/worktrees/wt", "Should contain relative path to repo gitdir");
      
      // Verify Repo gitdir file
      const match = dotGitContent.match(/^gitdir:\s*(.*)$/m);
      if (!match) throw new Error("Could not parse .git file");
      
      // The path in .git is relative to worktreeDir. 
      // We need to resolve it to find the actual gitdir file in repo.
      // However, we can just look in the expected location: repo/.git/worktrees/wt/gitdir
      // Note: "wt" is the directory name of the worktree, but git uses the folder name provided in add?
      // Git usually uses the basename of the path. Here "wt".
      
      const repoGitDirFile = join(repoDir, ".git", "worktrees", "wt", "gitdir");
      const existsRepoGitDir = await exists(repoGitDirFile);
      assertEquals(existsRepoGitDir, true, "Repo gitdir file should exist");
      
      const repoGitDirContent = await Deno.readTextFile(repoGitDirFile);
      console.log(`Debug: repo gitdir content: ${repoGitDirContent.trim()}`);
      
      assertStringIncludes(repoGitDirContent, "../../../../wt/.git", "Should contain relative path to worktree .git");
    });

    // 4. Verify Move Resistance
    await t.step("survives directory move", async () => {
      // Move the entire tempDir to a new location?
      // Or move the repo and worktree together to a new parent?
      
      // Relative paths allow moving the *entire project structure* together.
      // If we move tempDir to tempDirMoved, the relative link between repo and wt should still hold.
      
      const newTempDir = tempDir + "-moved";
      await Deno.rename(tempDir, newTempDir);
      
      const newWorktreeDir = join(newTempDir, "wt");
      
      // Run git status in the moved worktree
      try {
        const output = await git(["status"], newWorktreeDir);
        console.log("Debug: git status output:", output);
        assertStringIncludes(output, "On branch feature-branch");
      } catch (e) {
        console.error("Git status failed after move:", e);
        throw e;
      } finally {
         // Move back for cleanup (or just update tempDir variable for cleanup)
         // But cleanup uses tempDir variable which is still the old path.
         // Let's rename back to be safe for cleanup block
         await Deno.rename(newTempDir, tempDir);
      }
    });

  } finally {
    // Restore Env
    if (originalMockGit) Deno.env.set("HB_MOCK_GIT", originalMockGit);
    else Deno.env.delete("HB_MOCK_GIT");

    // Cleanup
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  }
});
