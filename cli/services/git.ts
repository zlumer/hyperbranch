
import { loadTask } from "../utils/loadTask.ts";
import { getRunBranchName, getRunBranchPrefix, getTaskBranchName, parseRunNumber } from "../utils/branch-naming.ts";

// Helper to run git command
export async function git(args: string[], cwd?: string): Promise<string> {
  if (Deno.env.get("HB_MOCK_GIT") === "true") {
      // Return dummy output for common commands if needed
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return "main";
      if (args[0] === "branch" && args[1] === "--list") return "";
      return "";
  }
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

export async function add(files: string[], cwd?: string): Promise<void> {
  await git(["add", ...files], cwd);
}

export async function commit(message: string, files?: string[], cwd?: string): Promise<void> {
  const args = ["commit", "-m", message];
  if (files && files.length > 0) {
    args.push("--", ...files);
  }
  await git(args, cwd);
}

export async function getCurrentBranch(): Promise<string> {
  return await git(["rev-parse", "--abbrev-ref", "HEAD"]);
}

export async function branchExists(branch: string): Promise<boolean> {
  try {
    await git(["rev-parse", "--verify", branch]);
    return true;
  } catch {
    return false;
  }
}

export async function checkFileExistsInBranch(branch: string, filePath: string): Promise<boolean> {
  try {
    await git(["cat-file", "-e", `${branch}:${filePath}`]);
    return true;
  } catch {
    return false;
  }
}

export async function isBranchMerged(branch: string, base: string): Promise<boolean> {
  try {
    const output = await git(["branch", "--merged", base]);
    const mergedBranches = output.split("\n").map(b => b.trim().replace(/^[\*\+]\s+/, ""));
    return mergedBranches.includes(branch);
  } catch {
    return false;
  }
}

export async function resolveBaseBranch(taskId: string): Promise<string> {
  try {
    const task = await loadTask(taskId);
    if (task.frontmatter.parent) {
      const parentBranch = getTaskBranchName(task.frontmatter.parent);
      // Check if branch exists
      if (await branchExists(parentBranch)) {
        return parentBranch;
      }
    }
  } catch {
    // Task might not exist or load failed
  }

  // Fall back to current branch, then main, then master
  try {
    const current = await getCurrentBranch();
    // Verify it exists (it should since we're on it, but safe practice)
    if (await branchExists(current)) {
      return current;
    }
  } catch {
    // Detached HEAD or error
  }

  if (await branchExists("main")) {
    return "main";
  }
  return "master";
}

export async function getNextRunBranch(taskId: string): Promise<string> {
  const prefix = getRunBranchPrefix(taskId);
  try {
    const output = await git(["branch", "--list", `${prefix}*`]);
    const branches = output.split("\n").map((b) => b.trim().replace(/^[\*\+]\s+/, ""));

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
    const branches = output.split("\n").map((b) => b.trim().replace(/^[\*\+]\s+/, "")).filter(Boolean);
    
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

export async function removeWorktree(path: string, force = false): Promise<void> {
  const args = ["worktree", "remove", path];
  if (force) args.push("--force");
  await git(args);
}

export async function deleteBranch(branch: string, force = false): Promise<void> {
  const args = ["branch", force ? "-D" : "-d", branch];
  await git(args);
}

export async function getUnmergedCommits(branch: string, base: string): Promise<string> {
  // Returns commits in branch that are not in base
  return await git(["log", `${branch}`, `^${base}`, "--oneline"]);
}

export async function status(worktreePath: string): Promise<boolean> {
  // Returns true if the worktree is dirty
  try {
    const output = await git(["status", "--porcelain"], worktreePath);
    return output.trim().length > 0;
  } catch {
    // If git status fails (e.g. not a git repo), assume dirty for safety?
    // Or maybe it's not a valid worktree.
    // Let's assume dirty to be safe unless we are sure.
    return true;
  }
}
