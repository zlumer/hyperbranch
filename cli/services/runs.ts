import * as Git from "../utils/git.ts";
import * as Lifecycle from "../runtime/lifecycle.ts";
import { getRunContext } from "../runtime/context.ts";
import { parseRunNumber, splitRunBranchName } from "../utils/branch-naming.ts";

export interface RunOptions extends Lifecycle.PrepareOptions {}

export interface RunResult {
  runId: string;
  port: number;
}

export async function run(
  taskId: string,
  options: RunOptions = {},
): Promise<RunResult> {
  // 1. Determine next run index
  // We need to look at existing branches to find the next index
  const nextBranch = await Git.getNextRunBranch(taskId);
  const runIndex = parseRunNumber(nextBranch) || 1;

  const ctx = getRunContext(taskId, runIndex);

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

export async function getStatus(runId: string): Promise<string> {
  const { taskId, runIndex } = parseRunId(runId);
  const ctx = getRunContext(taskId, runIndex);
  const { status } = await Lifecycle.inspect(ctx);
  return status;
}

export interface RunInfo {
  runId: string;
  branchName: string;
  status: string;
  logsPath: string; // Deprecated
}

export async function listRuns(taskId: string): Promise<RunInfo[]> {
  const branches = await Git.listTaskRunBranches(taskId);
  const runs: RunInfo[] = [];

  for (const branch of branches) {
    const runIdx = splitRunBranchName(branch)?.runIndex;
    if (runIdx === undefined) continue;

    const ctx = getRunContext(taskId, runIdx);
    const { status } = await Lifecycle.inspect(ctx);
    
    runs.push({
      runId: branch,
      branchName: branch,
      status,
      // logsPath is deprecated but kept for compatibility if needed, 
      // but ideally consumers should use the logs API
      logsPath: "", 
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
  strategy: "merge" | "squash" | "rebase" = "merge",
  cleanup: boolean = false,
): Promise<void> {
  const baseBranch = await Git.resolveBaseBranch(taskId);
  const currentBranch = await Git.getCurrentBranch();

  if (baseBranch !== currentBranch) {
    throw new Error(
      `Cannot merge run. Current branch is '${currentBranch}', but run base branch is '${baseBranch}'. Please checkout '${baseBranch}' first.`,
    );
  }

  await Git.merge(runId, strategy);

  if (cleanup) {
    await destroyRun(runId);
  }
}

// Helpers

function parseRunId(runId: string): { taskId: string; runIndex: number } {
  const info = splitRunBranchName(runId);
  if (!info) {
    // Maybe it's just a branch name passed as ID?
    // Or maybe we should support passing taskId + runIndex separately?
    // Current convention seems to be runId === branchName
    throw new Error(`Invalid runId format: ${runId}`);
  }
  return { taskId: info.taskId, runIndex: info.runIndex };
}

// Logs helper for server/CLI
export async function getLogsStream(runId: string, follow: boolean): Promise<Deno.ChildProcess> {
  const { taskId, runIndex } = parseRunId(runId);
  const ctx = getRunContext(taskId, runIndex);
  return Lifecycle.logs(ctx, follow);
}

export async function getLatestRunId(taskId: string): Promise<string | null> {
  return await Git.getLatestRunBranch(taskId);
}
