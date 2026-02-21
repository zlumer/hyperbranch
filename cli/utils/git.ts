import { loadTask } from "./loadTask.ts";
import {
  getRunBranchName,
  getRunBranchPrefix,
  getTaskBranchName,
  parseRunNumber,
} from "./branch-naming.ts";
import { getTaskPath } from "./tasks.ts";

// Helper to run git command
export async function git(args: string[], cwd?: string): Promise<string> {
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

export async function commit(
  message: string,
  files?: string[],
  cwd?: string,
): Promise<void> {
  const args = ["commit", "-m", message];
  if (files && files.length > 0) {
    args.push("--", ...files);
  }
  await git(args, cwd);
}

export async function fetch(remote: string, refspec: string): Promise<void> {
  await git(["fetch", remote, refspec]);
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

export async function checkFileExistsInBranch(
  branch: string,
  filePath: string,
): Promise<boolean> {
  try {
    await git(["cat-file", "-e", `${branch}:${filePath}`]);
    return true;
  } catch {
    return false;
  }
}

export async function isBranchMerged(
  branch: string,
  base: string,
): Promise<boolean> {
  try {
    const output = await git(["branch", "--merged", base]);
    const mergedBranches = output.split("\n").map((b) =>
      b.trim().replace(/^[\*\+]\s+/, "")
    );
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
    const branches = output.split("\n").map((b) =>
      b.trim().replace(/^[\*\+]\s+/, "")
    );

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

export async function getLatestRunBranch(
  taskId: string,
): Promise<string | null> {
  const prefix = getRunBranchPrefix(taskId);
  try {
    const output = await git(["branch", "--list", `${prefix}*`]);
    const branches = output.split("\n").map((b) =>
      b.trim().replace(/^[\*\+]\s+/, "")
    ).filter(Boolean);

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

export async function listTaskRunBranches(taskId: string): Promise<string[]> {
  const prefix = getRunBranchPrefix(taskId);
  try {
    const output = await git(["branch", "--list", `${prefix}*`]);
    const branches = output.split("\n").map((b) =>
      b.trim().replace(/^[\*\+]\s+/, "")
    ).filter(Boolean);
    return branches.sort((a, b) => {
      const idxA = parseRunNumber(a) || 0;
      const idxB = parseRunNumber(b) || 0;
      return idxB - idxA; // Descending order
    });
  } catch {
    return [];
  }
}


export async function merge(
  branch: string,
  strategy: "merge" | "squash" | "rebase" = "merge",
): Promise<void> {
  const args = [strategy === "rebase" ? "rebase" : "merge"];
  if (strategy === "squash") {
    args.push("--squash");
  }
  args.push(branch);

  // Rebase requires checking out the branch to be rebased?
  // Usually "git rebase master" while on feature branch rebases feature onto master.
  // "git rebase master feature" checks out feature and rebases onto master.

  // Here we want to merge `branch` INTO current branch.
  // "git merge branch"
  // "git merge --squash branch"
  // "git rebase branch" (rebases current onto branch? No, usually we want to merge branch into current)

  // If strategy is rebase, it's ambiguous.
  // "Merge the run's clone/branch back to the main branch."
  // If I am on Main, and I want to "Merge" RunBranch:
  // - Merge: git merge RunBranch
  // - Squash: git merge --squash RunBranch
  // - Rebase: git rebase Main RunBranch (Rebases RunBranch onto Main) -> Then fast-forward merge Main to RunBranch?

  // Let's stick to Merge and Squash for now as they modify the current branch.
  if (strategy === "rebase") {
    throw new Error("Rebase strategy not supported in this context yet.");
  }

  await git(args);
}

export async function listFiles(
  branch: string,
  path: string = ".",
): Promise<string[]> {
  // git ls-tree --name-only branch:path
  const ref = path === "." || path === "" ? branch : `${branch}:${path}`;
  try {
    const output = await git(["ls-tree", "--name-only", ref]);
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function readFile(branch: string, path: string): Promise<string> {
  return await git(["show", `${branch}:${path}`]);
}

export interface GitFile {
  mode: string;
  type: "blob" | "tree" | "commit";
  hash: string;
  path: string;
}

export async function listFilesDetailed(
  branch: string,
  path: string = ".",
): Promise<GitFile[]> {
  const ref = path === "." || path === "" ? branch : `${branch}:${path}`;
  try {
    const output = await git(["ls-tree", ref]);
    return output.split("\n").filter(Boolean).map((line) => {
      const [meta, filePath] = line.split("\t");
      const [mode, type, hash] = meta.split(" ");
      return { mode, type: type as any, hash, path: filePath };
    });
  } catch {
    return [];
  }
}

export async function getType(
  branch: string,
  path: string,
): Promise<"blob" | "tree" | "commit" | null> {
  const ref = path === "." || path === "" ? branch : `${branch}:${path}`;
  try {
    const output = await git(["cat-file", "-t", ref]);
    return output.trim() as any;
  } catch {
    return null;
  }
}


export async function deleteBranch(
  branch: string,
  force = false,
): Promise<void> {
  const args = ["branch", force ? "-D" : "-d", branch];
  await git(args);
}

export async function getUnmergedCommits(
  branch: string,
  base: string,
): Promise<string> {
  // Returns commits in branch that are not in base
  return await git(["log", `${branch}`, `^${base}`, "--oneline"]);
}

export async function getConfig(key: string): Promise<string | null> {
  try {
    return await git(["config", "--get", key]);
  } catch {
    return null;
  }
}

export async function commitDirtyTaskFile(taskId: string): Promise<void> {
  const taskPath = getTaskPath(taskId)

  // Check if git has staged files (apart from this task)
  const stagedOutput = await git(["diff", "--name-only", "--cached"])
  const stagedFiles = stagedOutput.split("\n").filter(Boolean)
  
  const hasOtherStagedFiles = stagedFiles.some(file => !taskPath.endsWith(file))
  if (hasOtherStagedFiles)
    throw new Error("Git has staged files apart from this task. Aborting to avoid committing unintended changes.")

  // Check if task file is dirty
  const statusOutput = await git(["status", "--porcelain", taskPath])
  if (!statusOutput.trim())
    return // Not dirty, do nothing

  // Read task file to get task header for commit message
  const task = await loadTask(taskId)
  let taskHeader = taskId
  
  const match = task.body.match(/^#\s+(.*)$/m)
  if (match)
    taskHeader = match[1].trim()

  // Add and commit
  await git(["add", taskPath])
  await git(["commit", "-m", `chore: added task ${taskHeader}`])
}
