import { copy } from "@std/fs/copy";
import { expandGlob } from "@std/fs/expand-glob";
import { isAbsolute, join } from "@std/path";
import { loadTask } from "./loadTask.ts";
import { getRunBranchName, getRunBranchPrefix, getTaskBranchName, parseRunNumber } from "./branch-naming.ts";
import { GIT_WORKTREES_PATH, GIT_LEGACY_WORKTREES_PATH } from "./paths.ts";

// Helper to run git command
async function git(args: string[], cwd?: string): Promise<string> {
  const command = new Deno.Command("git", {
    args,
    cwd: cwd || Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr).trim();
    throw new Error(`Git command failed: git ${args.join(" ")}\n${stderr}`);
  }
  return new TextDecoder().decode(output.stdout).trim();
}

export async function isGitDirty(): Promise<boolean> {
  try {
    // diff-index --quiet HEAD -- returns exit code 1 if dirty
    await git(["diff-index", "--quiet", "HEAD", "--"]);
    return false;
  } catch {
    return true;
  }
}

export async function createStash(): Promise<string | null> {
  if (!(await isGitDirty())) {
    return null;
  }
  // Create a commit object without modifying index/workdir
  const hash = await git(["stash", "create"]);
  return hash || null;
}

export async function resolveBaseBranch(taskId: string): Promise<string> {
  try {
    const task = await loadTask(taskId);
    if (task.frontmatter.parent) {
      const parentBranch = getTaskBranchName(task.frontmatter.parent);
      // Check if branch exists
      try {
        await git(["rev-parse", "--verify", parentBranch]);
        return parentBranch;
      } catch {
        // Parent branch doesn't exist, fall back to default
      }
    }
  } catch {
    // Task might not exist or load failed
  }

  // Default branch (try main, then master)
  try {
    await git(["rev-parse", "--verify", "main"]);
    return "main";
  } catch {
    return "master";
  }
}

export async function getNextRunBranch(taskId: string): Promise<string> {
  const prefix = getRunBranchPrefix(taskId);
  try {
    const output = await git(["branch", "--list", `${prefix}*`]);
    const branches = output.split("\n").map((b) => b.trim().replace("* ", ""));

    let maxIdx = 0;
    for (const branch of branches) {
      const idx = parseRunNumber(branch);
      if (idx !== null && idx > maxIdx) {
        maxIdx = idx;
      }
    }
    return getRunBranchName(taskId, maxIdx + 1);
  } catch {
    return getRunBranchName(taskId, 1);
  }
}

export async function getLatestRunBranch(taskId: string): Promise<string | null> {
  const prefix = getRunBranchPrefix(taskId);
  try {
    const output = await git(["branch", "--list", `${prefix}*`]);
    const branches = output.split("\n").map((b) => b.trim().replace("* ", "")).filter(Boolean);
    
    if (branches.length === 0) return null;

    let maxIdx = -1;
    let latestBranch = "";

    for (const branch of branches) {
      const idx = parseRunNumber(branch);
      if (idx !== null && idx > maxIdx) {
        maxIdx = idx;
        latestBranch = branch;
      }
    }
    return latestBranch || null;
  } catch {
    return null;
  }
}

export async function createWorktree(
  branch: string,
  base: string,
  path: string,
): Promise<void> {
  // git worktree add -b <branch> <path> <base>
  await git(["worktree", "add", "-b", branch, path, base]);
}

export async function applyStash(path: string, hash: string): Promise<void> {
  try {
    // Apply inside the worktree
    await git(["stash", "apply", hash], path);
  } catch (e) {
    // Throw a specific error for conflict
    throw new Error(
      `Conflict detected while applying stash ${hash} to worktree. Aborting run.\nOriginal Error: ${e}`,
    );
  }
}

export async function copyUntrackedFiles(dest: string): Promise<void> {
  // ls-files --others --exclude-standard gives relative paths
  const output = await git(["ls-files", "--others", "--exclude-standard"]);
  if (!output) return;

  const files = output.split("\n").filter(Boolean);
  const cwd = Deno.cwd();

  for (const file of files) {
    if (file.startsWith(GIT_WORKTREES_PATH) || file.startsWith(GIT_LEGACY_WORKTREES_PATH)) {
      continue;
    }

    const srcPath = join(cwd, file);
    const destPath = join(dest, file);
    await copy(srcPath, destPath, {
      overwrite: true,
      preserveTimestamps: true,
    });
  }
}

import { CopyConfig } from "./config.ts";
import { dirname } from "@std/path";
import { exists } from "@std/fs/exists";

export async function copyIgnoredFiles(
  dest: string,
  config: CopyConfig,
): Promise<void> {
  const cwd = Deno.cwd();

  // 1. Handle Files (include patterns)
  for (const pattern of config.include) {
    for await (
      const file of expandGlob(pattern, {
        root: cwd,
        exclude: config.exclude,
        globstar: true,
      })
    ) {
      if (file.isFile) {
        const relPath = file.path.substring(cwd.length + 1);
        const destPath = join(dest, relPath);
        await Deno.mkdir(dirname(destPath), { recursive: true });
        await copy(file.path, destPath, {
          overwrite: true,
          preserveTimestamps: true,
        });
      }
    }
  }

  // 2. Handle Directories (includeDirs)
  // Recursive copy, respecting excludeDirs
  for (const dir of config.includeDirs) {
    const srcDir = join(cwd, dir);
    if (!(await exists(srcDir))) continue;

    // Re-implementation using single expandGlob for the directory
    for await (
      const entry of expandGlob(`${dir}/**/*`, {
        root: cwd,
        exclude: config.excludeDirs,
        globstar: true,
      })
    ) {
      if (entry.isFile) {
        const relPath = entry.path.substring(cwd.length + 1);
        const destPath = join(dest, relPath);
        await Deno.mkdir(dirname(destPath), { recursive: true });
        await copy(entry.path, destPath, {
          overwrite: true,
          preserveTimestamps: true,
        });
      }
    }
  }
}
