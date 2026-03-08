import { exists } from "@std/fs/exists";
import * as Git from "../utils/git.ts";
import * as GitClones from "../utils/git-clones.ts";
import * as Lifecycle from "../runtime/lifecycle.ts";
import * as Docker from "../utils/docker.ts";
import * as Compose from "../utils/docker-compose.ts";
import { getRunContext } from "../runtime/context.ts";
import { parseRunNumber, splitRunBranchName, getRunBranchName as parseRunBranchName } from "../utils/branch-naming.ts";

export interface RunOptions extends Lifecycle.PrepareOptions {}

export interface RunResult {
  runId: string;
  port: number;
}

export async function run(
  taskId: string,
  options: RunOptions & { commit?: boolean } = {},
): Promise<RunResult> {

  // commit the dirty task file first if --commit is passed
  if (options.commit)
    await Git.commitDirtyTaskFile(taskId);

  // 1. Determine next run index
  // We need to look at existing branches to find the next index
  const nextBranch = await Git.getNextRunBranch(taskId);
  let runIndex = parseRunNumber(nextBranch) || 1;

  let ctx = getRunContext(taskId, runIndex);

  let iterations = 0;
  while (await exists(ctx.clonePath)) {
    console.warn(`⚠️  Found stale run directory at ${ctx.clonePath}. Bumping run index to avoid conflicts.`);
    runIndex++;
    ctx = getRunContext(taskId, runIndex);
    iterations++;
    if (iterations > 100) {
      throw new Error(`Could not find an available run index after 100 attempts. (Last path: ${ctx.clonePath})`);
    }
  }

  // 2. Prepare
  await Lifecycle.prepare(ctx, options);

  // 3. Start
  await Lifecycle.start(ctx);

  // 4. Inspect to get port
  const { port } = await Lifecycle.inspect(ctx);

  return { runId: ctx.branchName, port };
}

export async function stopRun(runId: string): Promise<void> {
  const { taskId, runIndex } = parseRunId(runId);
  const ctx = getRunContext(taskId, runIndex);
  await Lifecycle.stop(ctx);
}

export async function destroyRun(runId: string): Promise<void> {
  const { taskId, runIndex } = parseRunId(runId);
  const ctx = getRunContext(taskId, runIndex);
  await Lifecycle.destroy(ctx);
}

export async function removeRun(taskId: string, runIndex: number, force: boolean): Promise<void> {
  const runId = parseRunBranchName(taskId, runIndex);
  
  // Safety checks
  if (!force) {
    const status = await getStatus(runId);
    if (status.toLowerCase() === "working" || status.toLowerCase() === "starting") {
       throw new Error(`Run ${taskId}/${runIndex} is active (${status}). Use --force to remove.`);
    }

    // Check Git Cleanliness
    const runBranch = runId;
    if (await Git.branchExists(runBranch)) {
        const branchInfo = splitRunBranchName(runBranch);
        const remoteName = branchInfo ? `hb-${branchInfo.taskId}-${branchInfo.runIndex}` : runBranch;
        await Git.fetch(remoteName, `${runBranch}:${runBranch}`);
        const baseBranch = await Git.resolveBaseBranch(taskId);
        const unmerged = await Git.getUnmergedCommits(runBranch, baseBranch);
        if (unmerged.trim().length > 0) {
            throw new Error(`Run has unmerged commits:\n${unmerged}\nUse --force to delete anyway.`);
        }
    }
  }

  console.log(`Removing run ${taskId}/${runIndex}...`);
  await destroyRun(runId);
  console.log("✅ Run removed.");
}

export async function getStatus(runId: string): Promise<string> {
  const { taskId, runIndex } = parseRunId(runId);
  const ctx = getRunContext(taskId, runIndex);
  const status = await Lifecycle.getRunState(ctx);
  return status;
}

export async function resumeRun(runId: string): Promise<void> {
  const { taskId, runIndex } = parseRunId(runId);
  const ctx = getRunContext(taskId, runIndex);
  await Lifecycle.start(ctx);
}

export interface RunInfo {
  runId: string;
  branchName: string;
  status: string;
  logsPath: string; // Deprecated
  drift?: { ahead: number; behind: number };
}

export async function listRuns(taskId: string): Promise<RunInfo[]> {
  const branches = await Git.listTaskRunBranches(taskId);
  const runs: RunInfo[] = [];

  const baseBranch = await Git.resolveBaseBranch(taskId);

  for (const branch of branches) {
    const runIdx = splitRunBranchName(branch)?.runIndex;
    if (runIdx === undefined) continue;

    const ctx = getRunContext(taskId, runIdx);
    const status = await Lifecycle.getRunState(ctx);
    
    let drift;
    if (await exists(ctx.clonePath)) {
      try {
        await Git.git(["fetch", "origin", baseBranch], ctx.clonePath);
        drift = await Git.getDrift(ctx.clonePath, baseBranch);
      } catch (e) {
        // ignore fetch errors
      }
    }

    runs.push({
      runId: branch,
      branchName: branch,
      status,
      // logsPath is deprecated but kept for compatibility if needed, 
      // but ideally consumers should use the logs API
      logsPath: "", 
      drift,
    });
  }
  return runs;
}

export async function getRunFiles(
  runId: string,
  path: string = "",
): Promise<
  { type: "file"; content: string } | { type: "dir"; files: Git.GitFile[] }
> {
  // This remains Git-based, so it's fine
  const type = await Git.getType(runId, path);
  if (type === "blob") {
    const content = await Git.readFile(runId, path);
    return { type: "file", content };
  } else if (type === "tree") {
    const files = await Git.listFilesDetailed(runId, path);
    return { type: "dir", files };
  }
  throw new Error(`Path '${path}' not found in run '${runId}'`);
}

export async function mergeRun(
  taskId: string,
  runId: string,
  strategy: "merge" | "squash" | "ff",
  cleanup: boolean = false,
): Promise<{ cleanupSkipped: boolean }> {
  const baseBranch = await Git.resolveBaseBranch(taskId);
  const currentBranch = await Git.getCurrentBranch();

  if (baseBranch !== currentBranch) {
    throw new Error(
      `Cannot merge run. Current branch is '${currentBranch}', but run base branch is '${baseBranch}'. Please checkout '${baseBranch}' first.`,
    );
  }

  const branchInfo = splitRunBranchName(runId);
  const remoteName = branchInfo ? `hb-${branchInfo.taskId}-${branchInfo.runIndex}` : runId;
  await Git.fetch(remoteName, `${runId}:${runId}`);
  await Git.merge(runId, strategy);

  if (!cleanup)
    return { cleanupSkipped: false }

  if (branchInfo) {
    const ctx = getRunContext(branchInfo.taskId, branchInfo.runIndex);
    const isDirty = await GitClones.status(ctx.clonePath);
    if (isDirty)
      return { cleanupSkipped: true }
  }

  await destroyRun(runId);
  
  return { cleanupSkipped: false };
}

export async function pullRun(
  taskId: string,
  runId: string,
  strategy: "merge" | "rebase" = "rebase",
): Promise<void> {
  const { runIndex } = parseRunId(runId);
  const ctx = getRunContext(taskId, runIndex);

  if (!(await exists(ctx.clonePath))) {
    throw new Error(`Run clone not found at ${ctx.clonePath}`);
  }

  const baseBranch = await Git.resolveBaseBranch(taskId);

  // 1. Fetch on host
  await Git.git(["fetch", "origin", baseBranch], ctx.clonePath);

  // 2. Execute git pull inside container
  const containerId = await Compose.getServiceContainerId(
    ctx.paths.runDir,
    ctx.paths.composeFile,
    "task",
    ctx.dockerProjectName
  );

  if (!containerId) {
    throw new Error(`Container for run ${runId} not found or not running`);
  }

  // Set git config inside container to avoid errors if not configured globally
  const gitName = await Git.getConfig("user.name") || "Hyperbranch";
  const gitEmail = await Git.getConfig("user.email") || "bot@hyperbranch.com";
  await Docker.execContainer(containerId, ["git", "config", "user.name", gitName], { workdir: "/app" });
  await Docker.execContainer(containerId, ["git", "config", "user.email", gitEmail], { workdir: "/app" });

  try {
    if (strategy === "rebase") {
      await Docker.execContainer(containerId, ["git", "rebase", `origin/${baseBranch}`], { workdir: "/app" });
    } else {
      await Docker.execContainer(containerId, ["git", "merge", `origin/${baseBranch}`], { workdir: "/app" });
    }
  } catch (e) {
    throw new Error(`Failed to ${strategy} base branch in container: ${e}`);
  }
}

// Helpers

export function parseRunId(runId: string): { taskId: string; runIndex: number } {
  const info = splitRunBranchName(runId);
  if (!info) {
    // Maybe it's just a branch name passed as ID?
    // Or maybe we should support passing taskId + runIndex separately?
    // Current convention seems to be runId === branchName
    throw new Error(`Invalid runId format: ${runId}`);
  }
  return { taskId: info.taskId, runIndex: info.runIndex };
}

export const _deps = {
  Git,
  Lifecycle
};

// Logs helper for server/CLI
export async function getLogsStream(runId: string, follow: boolean): Promise<Deno.ChildProcess> {
  const { taskId, runIndex } = parseRunId(runId);
  const ctx = getRunContext(taskId, runIndex);
  return Lifecycle.logs(ctx, follow);
}

export async function getLatestRunId(taskId: string): Promise<string | null> {
  return await Git.getLatestRunBranch(taskId);
}

export async function getHostPort(runId: string, containerPort: number): Promise<number> {
  const { taskId, runIndex } = parseRunId(runId);
  const ctx = getRunContext(taskId, runIndex);

  // Check if branch exists
  if (!(await Git.branchExists(ctx.branchName))) {
    throw new Error(`Run ID '${runId}' does not exist`);
  }

  return await Lifecycle.getHostPort(ctx, containerPort);
}
