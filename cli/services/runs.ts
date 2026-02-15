import { join, resolve } from "@std/path";
import { exists } from "@std/fs/exists";
import * as GitWorktree from "../utils/git-worktree.ts";
import * as Git from "../utils/git.ts";
import * as Docker from "../utils/docker.ts";
import * as Compose from "../utils/docker-compose.ts";
import * as System from "../utils/system.ts";
import * as Runs from "../utils/runs.ts";
import { parseRunNumber, splitRunBranchName } from "../utils/branch-naming.ts";
import { loadConfig } from "../utils/config.ts"; // Assuming this is still needed for env vars
import {
  getRunDir as getRunDirFromWorktree,
  HYPERBRANCH_DIR,
  TASKS_DIR_NAME,
  WORKTREES_DIR,
} from "../utils/paths.ts";

export interface RunOptions {
  image?: string;
  dockerfile?: string;
  exec?: string[];
  env?: Record<string, string>;
  dockerArgs?: string[];
  prompt?: string;
}

export interface RunResult {
  runId: string;
}

export async function prepareRun(taskId: string, options: RunOptions = {}): Promise<string> {
  // 1. Resolve Base Branch
  const baseBranch = await Git.resolveBaseBranch(taskId);

  // Verify task file exists in base branch
  const taskFileRelative = join(
    HYPERBRANCH_DIR,
    TASKS_DIR_NAME,
    `task-${taskId}.md`,
  );
  const taskExists = await Git.checkFileExistsInBranch(
    baseBranch,
    taskFileRelative,
  );

  if (!taskExists) {
    throw new Error(
      `Task file '${taskFileRelative}' not found in base branch '${baseBranch}'. Cannot start run.`,
    );
  }

  // 2. Worktree Preparation
  const runBranch = await Git.getNextRunBranch(taskId);
  const safeBranchName = runBranch.replace(/\//g, "-");
  const worktreePath = resolve(WORKTREES_DIR(), safeBranchName);
  const runDir = getRunDirFromWorktree(worktreePath);

  // check if worktree already exists
  if (await exists(worktreePath)) {
    throw new Error(`Worktree for run already exists at '${worktreePath}'`)
  }

  await GitWorktree.createWorktree(runBranch, baseBranch, worktreePath);

  // 3. Asset Preparation
  await Docker.prepareWorktreeAssets(runDir);

  // 4. Write .env.compose
  const taskFile = join(HYPERBRANCH_DIR, TASKS_DIR_NAME, `task-${taskId}.md`);
  await Docker.writeEnvComposeFile(runDir, {
    HYPERBRANCH_TASK_ID: taskId,
    HYPERBRANCH_TASK_FILE: taskFile,
    HYPERBRANCH_AGENT_MODE: "build",
    HYPERBRANCH_PROMPT: options.prompt || "",
  });

  return runBranch;
}

async function runIsAlreadyRunning(runId: string): Promise<boolean> {
  const worktreePath = await GitWorktree.getWorktreePath(runId);
  if (!worktreePath)
    return false;

  const runDir = getRunDirFromWorktree(worktreePath);
  const composeFile = join(runDir, "docker-compose.yml");
  if (!(await exists(composeFile)))
    return false;

  return await Compose.isRunningAny(worktreePath, composeFile);
}

export async function startRunIdempotent(runId: string): Promise<RunResult> {
  // if run is already started (CID file exists), we can skip starting and just return existing CID
  const isRunning = await runIsAlreadyRunning(runId);
  if (isRunning)
    return { runId }

  // AI! we need to move this to the `prepare` stage
  /*
  // 2. Configuration & Env
  const config = await loadConfig();
  const mounts = await System.getPackageCacheMounts();
  mounts.push(await System.getAgentConfigMount());

  const env = System.getEnvVars(config.env_vars || []);
  if (options.env) {
    Object.assign(env, options.env);
  }
  */

  // 1. Find worktree
  const worktreePath = await GitWorktree.getWorktreePath(runId);
  if (!worktreePath)
    throw new Error(`Worktree not found for runId: ${runId}`);
  
  const runDir = getRunDirFromWorktree(worktreePath);

  // 3. Start the container using docker compose
  await Compose.up(worktreePath, join(runDir, "docker-compose.yml"))

  return { runId }
}

async function getRunCid(runId: string): Promise<string> {
  const runInfo = splitRunBranchName(runId)
  if (!runInfo)
    throw new Error(`Invalid runId format: ${runId}`)

  const { taskId, runIndex } = runInfo
  const cid = await Runs.getContainerId(taskId, runIndex)
  if (!cid)
    throw new Error(`No container ID found for run '${runId}'`)

  return cid
}

async function getRunContainer(runId: string): Promise<Docker.DockerContainerProcess> {
  return Docker.DockerContainerProcess.fromCid(await getRunCid(runId))
}

export async function getRunPort(runId: string): Promise<number> {
  const container = await getRunContainer(runId);
  const port = await container.getContainerPort(4096);
  if (port === null) {
    throw new Error(`Could not determine public port for run ${runId}`);
  }
  return port;
}

export async function getRunStatus(runId: string): Promise<string> {
  try {
    const container = await getRunContainer(runId);
    const { status } = await container.getContainerStatus();
    return status;
  } catch {
    return "not found";
  }
}

export async function getRunLogs(runId: string): Promise<string> {
  const container = await getRunContainer(runId);
  return await container.getContainerLogs();
}

export async function pauseRun(runId: string): Promise<void> {
  const container = await getRunContainer(runId);
  await container.pause();
}

export async function resumeRun(runId: string): Promise<void> {
  const container = await getRunContainer(runId);
  await container.unpause();
}

export async function stopRun(runId: string): Promise<void> {
  const container = await getRunContainer(runId);
  await container.stop();
}

export async function destroyRun(runId: string): Promise<void> {
  try {
    const container = await getRunContainer(runId)
    // Stop and remove container
    await container.stop()
    // Docker.removeContainer removes it (stops if forced)
    await container.rm(true)
  } catch (e) {
    // Container might not exist or CID file missing. 
    // We proceed to cleanup worktree/branch.
  }

  const worktreePath = await GitWorktree.getWorktreePath(runId);
  if (worktreePath) {
    await GitWorktree.removeWorktree(worktreePath, true);
  }
  
  // Also clean up the branch if it exists
  if (await Git.branchExists(runId)) {
    await Git.deleteBranch(runId, true);
  }
}

export async function rmCleanRun(runId: string): Promise<void> {
  const worktreePath = await GitWorktree.getWorktreePath(runId);
  if (!worktreePath) {
    throw new Error(`Worktree not found for runId: ${runId}`);
  }
}


export async function run(
  taskId: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const runId = await prepareRun(taskId, options);
  return startRunIdempotent(runId);
}

export function getLogsPath(taskId: string): string
export function getLogsPath(taskId: string, runIndex: number): string
export function getLogsPath(taskId: string, runIndex?: number): string
{
  if (runIndex === undefined)
    runIndex = parseRunNumber(taskId) ?? die(`Cannot parse run index from taskId '${taskId}' and no runIndex provided`)
  return Runs.getLogsPath(taskId, runIndex);
}
export async function getStatus(taskId: string): Promise<string> {
  const container = await getRunContainer(taskId);
  if (!container) {
    return "stopped";
  }
  const { status } = await container.getContainerStatus()
  return status;
}

export function getLogsPathFromBranch(
  taskId: string,
  branchName: string,
): string {
  const runIdx = parseRunNumber(branchName);
  if (runIdx === null) {
    throw new Error(`Cannot determine run index from branch '${branchName}'`);
  }
  return getLogsPath(taskId, runIdx);
}

export interface RunInfo {
  runId: string;
  branchName: string;
  status: string;
  logsPath: string;
}

function die(...ctorArgs: ConstructorParameters<typeof Error>): never {
  throw new Error(...ctorArgs)
}

export async function listRuns(taskId: string): Promise<RunInfo[]> {
  const branches = await Git.listTaskRunBranches(taskId);
  const runs: RunInfo[] = [];

  for (const branch of branches) {
    const runIdx = splitRunBranchName(branch)?.runIndex ?? die(`Invalid run branch name: ${branch}`);
    runs.push({
      runId: runIdx !== null ? String(runIdx) : branch,
      branchName: branch,
      status: "unknown",
      logsPath: getLogsPath(taskId, runIdx),
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
    const worktreePath = await GitWorktree.getWorktreePath(runId);
    if (worktreePath) {
      await GitWorktree.removeWorktree(worktreePath, true);
    }
    await Git.deleteBranch(runId, true);
  }
}
