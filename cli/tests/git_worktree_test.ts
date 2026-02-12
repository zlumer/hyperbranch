import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import * as GitWorktree from "../utils/git-worktree.ts";
import { stub } from "@std/testing/mock";

// Helper to mock Deno.Command
function mockGitCommand(handler: (args: string[]) => string | Promise<string>) {
  // @ts-ignore: Stub types
  return stub(Deno, "Command", (cmd: string | URL, options?: Deno.CommandOptions) => {
    if (cmd !== "git") {
      throw new Error(`Unexpected command: ${cmd}`);
    }
    const args = options?.args || [];
    
    return {
      output: async () => {
        try {
          const stdout = await handler(args);
          return {
            success: true,
            code: 0,
            stdout: new TextEncoder().encode(stdout),
            stderr: new Uint8Array(),
          };
        } catch (e) {
          // If handler throws, return failure
          return {
            success: false,
            code: 1,
            stdout: new Uint8Array(),
            stderr: new TextEncoder().encode(String(e)),
          };
        }
      }
    } as unknown as Deno.Command;
  });
}

Deno.test("GitWorktree Integration", async (t) => {
  // Ensure we bypass the internal mock in git.ts
  const originalEnv = Deno.env.get("HB_MOCK_GIT");
  Deno.env.set("HB_MOCK_GIT", "false");

  // Use a temporary directory
  const tempDir = await Deno.makeTempDir({ prefix: "hb-test-git-" });
  const repoDir = join(tempDir, "repo");
  
  await ensureDir(repoDir);
  
  try {
      // Test 1: High-level version check and flag usage
      await t.step("uses --relative-paths on new git", async () => {
        const commandStub = mockGitCommand((args) => {
          if (args[0] === "--version") return "git version 2.39.0";
          if (args[0] === "worktree" && args[1] === "add") {
            if (args.includes("--relative-paths")) return "";
            throw new Error("Missing --relative-paths");
          }
          return "";
        });

        try {
          await GitWorktree.createWorktree("branch", "base", "path");
        } finally {
          commandStub.restore();
        }
      });

      // Test 2: Rewrite logic on old git
      await t.step("rewrites paths on old git", async () => {
         // Setup fake worktree structure
         const wtPath = join(tempDir, "wt");
         await ensureDir(wtPath);
         const dotGitPath = join(wtPath, ".git");
         
         const repoGitDir = join(repoDir, ".git"); 
         const repoWorktreeDir = join(repoGitDir, "worktrees", "wt");
         await ensureDir(repoWorktreeDir);
         
         // 1. Create .git file pointing to absolute path
         await Deno.writeTextFile(dotGitPath, `gitdir: ${repoWorktreeDir}\n`);
         
         // 2. Create gitdir file pointing to worktree .git
         const gitDirFile = join(repoWorktreeDir, "gitdir");
         await Deno.writeTextFile(gitDirFile, `${join(wtPath, ".git")}\n`);
         
         // Mock git version to be old
         const commandStub = mockGitCommand((args) => {
            if (args[0] === "--version") return "git version 2.25.1";
            if (args[0] === "worktree" && args[1] === "add") {
               return ""; 
            }
            return "";
         });
         
         try {
           // Call createWorktree
           await GitWorktree.createWorktree("branch", "base", wtPath);
           
           // Verify contents
           const newDotGit = await Deno.readTextFile(dotGitPath);
           const newGitDir = await Deno.readTextFile(gitDirFile);
           
           console.log("New .git content:", newDotGit.trim());
           console.log("New gitdir content:", newGitDir.trim());

           // Should NOT contain absolute paths
           if (newDotGit.includes(repoWorktreeDir)) {
              throw new Error(`.git file still contains absolute path: ${newDotGit}`);
           }
           // Should contain relative path (starts with ..)
           if (!newDotGit.includes("..")) {
               throw new Error(`.git file does not look relative: ${newDotGit}`);
           }

           if (newGitDir.includes(wtPath)) {
              throw new Error(`gitdir file still contains absolute path: ${newGitDir}`);
           }
         } finally {
           commandStub.restore();
         }
      });

  } finally {
    // Restore env
    if (originalEnv) Deno.env.set("HB_MOCK_GIT", originalEnv);
    else Deno.env.delete("HB_MOCK_GIT");
    
    await Deno.remove(tempDir, { recursive: true });
  }
});
