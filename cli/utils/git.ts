import { RunId, TaskId } from "./id.js";
import { loadTask } from "./loadTask.js";
import { getTaskPath } from "./tasks.js";
import { execa } from "execa";

// Helper to run git command
export async function git(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execa("git", args, {
      cwd: cwd || process.cwd()
    });
    return stdout.trim();
  } catch (error: any) {
    const stderr = error.stderr || error.message;
    throw new Error(`Git command failed: git ${args.join(" ")}\n${stderr}`);
  }
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

export async function hasGitBinary(): Promise<boolean> {
  try {
    await execa("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}
export async function isGitRepository(): Promise<boolean> {
  try {
	const { exitCode } = await execa("git", ["rev-parse", "--is-inside-work-tree"], { reject: false });
	return exitCode === 0;
  } catch {
	return false;
  }
}

export async function getRootGitDir(): Promise<string> {
  return await git(["rev-parse", "--show-toplevel"]);
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

export async function resolveBaseBranch(taskId: TaskId): Promise<string> {
  try {
    const task = await loadTask(taskId.id);
    if (task.frontmatter.parent) {
      const parentBranch = TaskId.from(task.frontmatter.parent)?.toBranchName()
      // Check if branch exists
      if (parentBranch && await branchExists(parentBranch)) {
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

export async function getNextRunBranch(task: TaskId): Promise<RunId> {
  const prefix = task.runBranchPrefix()
  try {
    const branches = await getBranchesByPrefix(prefix);

    let maxIdx = 0;
    for (const branch of branches) {
      const runId = RunId.fromString(branch)
      if (!runId || runId.task.id !== task.id)
        continue

      maxIdx = Math.max(maxIdx, runId.idx);
    }
    return task.toRunId(maxIdx + 1);
  } catch {
    return task.toRunId(1);
  }
}

async function getBranchesByPrefix(prefix: string) {
	const output = await git(["branch", "-a", "--list", `*${prefix}*`]);
  const branches = output.split("\n").map((b) =>
    b.trim()
      .replace(/^[\*\+]\s+/, "")
      .replace(/^remotes\/[^/]+\//, "")
  ).filter(Boolean);
  return branches;
}

export async function getLatestRunBranch(
  taskId: TaskId,
): Promise<RunId | null> {
  try {
    const branches = await getBranchesByPrefix(taskId.runBranchPrefix());
    
    if (branches.length === 0) return null;

    let maxIdx = -1;
    let latestRun: RunId | null = null;

    for (const branch of branches) {
      const runId = RunId.fromString(branch)
      if (!runId)
        continue
      console.assert(runId.task.id == taskId.id, "Branch does not match task ID prefix. This should not happen.")
      // const idx = parseRunNumber(branch);
      if (runId.idx > maxIdx) {
        maxIdx = runId.idx;
        latestRun = runId;
      }
    }
    return latestRun || null;
  } catch {
    return null;
  }
}

export async function listTaskRunBranches(taskId: TaskId): Promise<string[]> {
  const prefix = taskId.runBranchPrefix()
  try {
    const branches = await getBranchesByPrefix(prefix);
    return branches.sort((a, b) => {
      const idxA = RunId.fromString(a)?.idx || 0;
      const idxB = RunId.fromString(b)?.idx || 0;
      if (idxA == idxB) {
        return a.localeCompare(b); // Fallback to alphabetical if runIdx is the same or cannot be parsed
      }
      return idxB - idxA; // Descending order
    });
  } catch {
    return [];
  }
}


export async function merge(
  branch: string,
  strategy: "merge" | "squash" | "ff" = "merge",
): Promise<void> {
  const args = ["merge"]
  if (strategy === "ff") {
	args.push("--ff-only");
  }
  if (strategy === "squash") {
    args.push("--squash");
  }
  args.push(branch);

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

export async function getDrift(
  cwd: string,
  baseBranch: string,
): Promise<{ ahead: number; behind: number; isFfAble: boolean }> {
  try {
    const output = await git(
      ["rev-list", "--left-right", "--count", `HEAD...origin/${baseBranch}`],
      cwd,
    );
    const [ahead, behind] = output.split("\t").map((n) => parseInt(n, 10));

    let isFfAble = false;
    if (behind > 0) {
      try {
        await git(["merge-base", "--is-ancestor", "HEAD", `origin/${baseBranch}`], cwd);
        isFfAble = true;
      } catch {
        isFfAble = false;
      }
    }

    return { ahead: ahead || 0, behind: behind || 0, isFfAble };
  } catch {
    return { ahead: 0, behind: 0, isFfAble: false };
  }
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