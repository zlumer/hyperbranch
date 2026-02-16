import { dirname, join, relative } from "@std/path";
import { exists } from "@std/fs/exists";
import { git } from "./git.ts";

/**
 * Returns the Git version as a string (e.g., "2.25.1").
 */
export async function getGitVersion(): Promise<string> {
  const output = await git(["--version"]);
  const match = output.match(/git version (\d+\.\d+\.\d+)/);
  if (match) {
    return match[1];
  }
  throw new Error(`Could not parse git version from: ${output}`);
}

/**
 * Parses a git version string into a number array [major, minor, patch].
 */
export function parseGitVersion(version: string): number[] {
  return version.split(".")
    .map((p) => parseInt(p, 10))
    .filter((n) => !isNaN(n));
}

/**
 * Checks if the current git version is greater than or equal to the target.
 */
export async function isGitVersionAtLeast(major: number, minor: number): Promise<boolean> {
  try {
    const versionStr = await getGitVersion();
    const parts = parseGitVersion(versionStr);
    
    if (parts.length < 2) return false;
    if (parts[0] > major) return true;
    if (parts[0] === major && parts[1] >= minor) return true;
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Creates a new worktree. 
 * Uses --relative-paths if supported (Git >= 2.38), otherwise manually rewrites paths.
 */
export async function createWorktree(
  branch: string,
  base: string,
  path: string,
  cwd?: string,
): Promise<void> {
  const supportsRelative = await isGitVersionAtLeast(2, 38);
  
  if (supportsRelative) {
    await git(["worktree", "add", "--relative-paths", "-b", branch, path, base], cwd);
  } else {
    await createWorktreeLegacy(branch, base, path, cwd);
  }
}

/**
 * Fallback for older Git versions: creates worktree then rewrites paths to be relative.
 */
async function createWorktreeLegacy(
  branch: string,
  base: string,
  path: string,
  cwd?: string,
): Promise<void> {
  // 1. Create worktree (absolute paths by default)
  await git(["worktree", "add", "-b", branch, path, base], cwd);

  try {
    await rewriteWorktreePathsToRelative(path);
  } catch (error) {
    console.error(`Failed to rewrite worktree paths: ${error}`);
    // Cleanup
    try {
      await removeWorktree(path, true, cwd);
      await git(["branch", "-D", branch], cwd);
    } catch { /* ignore cleanup error */ }
    throw error;
  }
}

/**
 * Rewrites .git file in worktree and gitdir in repo to use relative paths.
 */
async function rewriteWorktreePathsToRelative(worktreePath: string): Promise<void> {
  const dotGitPath = join(worktreePath, ".git");
  if (!(await exists(dotGitPath))) {
    throw new Error(`Worktree .git file not found at ${dotGitPath}`);
  }

  // Read .git file to find the repo's gitdir path
  const dotGitContent = await Deno.readTextFile(dotGitPath);
  const match = dotGitContent.match(/^gitdir:\s*(.*)$/m);
  if (!match) {
    throw new Error(`Invalid .git file format: ${dotGitContent}`);
  }
  
  const absRepoGitDir = match[1].trim(); // /path/to/repo/.git/worktrees/name
  
  // Read repo's gitdir file to confirm generic structure
  const repoGitDirFile = join(absRepoGitDir, "gitdir");
  if (!(await exists(repoGitDirFile))) {
    // This might happen if the path in .git is not what we expect, 
    // but typically it points to the worktree metadata dir.
    throw new Error(`Repo gitdir file not found at ${repoGitDirFile}`);
  }

  // Calculate relative paths
  // 1. worktree/.git -> repo/worktrees/name
  const relPathToRepo = relative(worktreePath, absRepoGitDir);
  
  // 2. repo/worktrees/name/gitdir -> worktree/.git
  // The content of repoGitDirFile points to worktree/.git
  const gitDirContent = await Deno.readTextFile(repoGitDirFile);
  const absWorktreeDotGit = gitDirContent.trim();
  const relPathToWorktree = relative(absRepoGitDir, absWorktreeDotGit);

  // Write new content
  await Deno.writeTextFile(dotGitPath, `gitdir: ${relPathToRepo}\n`);
  await Deno.writeTextFile(repoGitDirFile, `${relPathToWorktree}\n`);
}

export async function removeWorktree(path: string, force = false, cwd?: string): Promise<void> {
  const args = ["worktree", "remove", path];
  if (force) args.push("--force");
  
  try {
    await git(args, cwd);
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    // If force is true and the error is "not a working tree", we can just remove the dir
    if (force && (err.message.includes("not a working tree") || err.message.includes("does not exist"))) {
        if (await exists(path)) {
            await Deno.remove(path, { recursive: true });
        }
        // Also prune to be safe, as metadata might be stale
        await pruneWorktrees();
        return;
    }
    throw err;
  }
}

/**
 * Prunes worktrees safely by attempting to run from the main repository.
 */
export async function pruneWorktrees(): Promise<void> {
  try {
    // Try to resolve the common git directory to find the main repo
    const commonDir = await git(["rev-parse", "--git-common-dir"]);
    let mainRepoPath = commonDir.trim();
    
    // If commonDir ends in .git, the parent is the repo root
    if (mainRepoPath.endsWith(".git")) {
      mainRepoPath = dirname(mainRepoPath);
    }
    
    if (await exists(mainRepoPath)) {
      await git(["worktree", "prune"], mainRepoPath);
      return;
    }
  } catch {
    // Fallback to standard prune if detection fails
  }
  await git(["worktree", "prune"]);
}

export async function getWorktreePath(branch: string): Promise<string | null> {
  try {
    const output = await git(["worktree", "list", "--porcelain"]);
    const lines = output.split("\n");
    let currentPath = "";
    
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        currentPath = line.substring(9);
      } else if (line.startsWith("branch ")) {
        const ref = line.substring(7);
        if (ref === `refs/heads/${branch}` || ref === `refs/heads/${branch}\n`) {
          return currentPath;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function status(worktreePath: string): Promise<boolean> {
  // Returns true if the worktree is dirty
  try {
    const output = await git(["status", "--porcelain"], worktreePath);
    return output.trim().length > 0;
  } catch {
    return true;
  }
}
