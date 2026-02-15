import { join, resolve } from "@std/path";
import { exists } from "@std/fs/exists";
import * as GitWorktree from "../utils/git-worktree.ts";
import * as Git from "../utils/git.ts";
import * as Docker from "../utils/docker.ts";
import * as System from "../utils/system.ts";
import * as Runs from "../utils/runs.ts";
import { parseRunNumber } from "../utils/branch-naming.ts";
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
  containerId: string;
}

export async function prepareRun(taskId: string, options: RunOptions = {}): Promise<string> {
  if (Deno.env.get("HB_MOCK_RUNS") === "true") {
    return `run/${taskId}/mock`;
  }

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

export async function startRun(runId: string, options: RunOptions = {}): Promise<RunResult> {
  if (Deno.env.get("HB_MOCK_RUNS") === "true") {
    return {
      runId,
      containerId: "mock-container-id",
    };
  }

  // 1. Find worktree
  const worktreePath = await GitWorktree.getWorktreePath(runId);
  if (!worktreePath) {
    throw new Error(`Worktree not found for runId: ${runId}`);
  }
  const runDir = getRunDirFromWorktree(worktreePath);

  // 2. Configuration & Env
  const config = await loadConfig();
  const mounts = await System.getPackageCacheMounts();
  mounts.push(await System.getAgentConfigMount());

  const env = System.getEnvVars(config.env_vars || []);
  if (options.env) {
    Object.assign(env, options.env);
  }

  const user = await System.getUserId();

  // Extract taskId from runId (format: run/<taskId>/<runNum>)
  const parts = runId.split("/");
  const taskId = parts.length >= 2 ? parts[1] : "unknown";

  // 3. Docker Image Setup
  let image = options.image ||
    "mcr.microsoft.com/devcontainers/typescript-node:22";
  if (options.dockerfile) {
    image = `hyperbranch-run:${taskId}`;
  }

  // 4. Command Construction
  let execCmd = [ `./${HYPERBRANCH_DIR}/.current-run/entrypoint.sh` ];
  if (options.exec) {
    execCmd = options.exec;
  }

  const safeBranchName = runId.replace(/\//g, "-");
  const dockerConfig: Docker.DockerConfig = {
    image,
    name: `hb-${taskId}-${safeBranchName.split("-").pop()}`,
    dockerfile: options.dockerfile,
    exec: execCmd,
    workdir: "/app",
    hostWorkdir: worktreePath,
    runDir,
    mounts,
    env: {
      ...env,
      HB_TASK_ID: taskId,
    },
    user,
    dockerArgs: options.dockerArgs || [],
  };

  // 5. Launch Container
  const containerId = await Docker.runContainer(dockerConfig);

  // 6. Write CID to hb.cid
  await Deno.writeTextFile(join(runDir, "hb.cid"), containerId);

  return { runId, containerId };
}

async function getRunCid(runId: string): Promise<string> {
  const worktreePath = await GitWorktree.getWorktreePath(runId);
  if (!worktreePath) {
    throw new Error(`Worktree not found for run '${runId}'`);
  }
  const runDir = getRunDirFromWorktree(worktreePath);
  const cidPath = join(runDir, "hb.cid");
  if (!(await exists(cidPath))) {
    throw new Error(`Container ID file not found for run '${runId}'`);
  }
  return (await Deno.readTextFile(cidPath)).trim();
}
async function getRunContainer(runId: string): Promise<Docker.DockerContainerProcess> {
  const cid = await getRunCid(runId)
  if (!cid) {
	throw new Error(`No container ID found for run '${runId}'`);
  }
  return Docker.DockerContainerProcess.fromCid(cid);
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
    const container = await getRunContainer(runId);
    // Stop and remove container
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


export async function run(
  taskId: string,
  options: RunOptions = {},
): Promise<RunResult> {
  const runId = await prepareRun(taskId, options);
  return await startRun(runId, options);
}

export async function stop(taskId: string): Promise<void> {
  if (Deno.env.get("HB_MOCK_RUNS") === "true") {
    return;
  }
  const container = await getRunContainer(taskId);
  if (container) {
    // Force remove (which stops it)
    await container.rm(true);
  } else {
    // If we can't find the CID, we can't stop it.
    // Maybe throw or just return? The previous implementation threw error.
    // But Runs.getContainerId returns null if not found.
    // I'll throw to be informative.
    throw new Error(`No running container found for task ${taskId}`);
  }
}

export async function getLogsPath(
  taskId: string,
  runIndex?: number,
): Promise<string> {
  return await Runs.getLogsPath(taskId, runIndex);
}
export async function getStatus(taskId: string): Promise<string> {
  const container = await getRunContainer(taskId);
  if (!container) {
    return "stopped";
  }
  const { status } = await container.getContainerStatus()
  return status;
}

export async function getLogsPathFromBranch(
  taskId: string,
  branchName: string,
): Promise<string> {
  const runIdx = parseRunNumber(branchName);
  if (runIdx === null) {
    throw new Error(`Cannot determine run index from branch '${branchName}'`);
  }
  return await getLogsPath(taskId, runIdx);
}

export interface RunInfo {
  runId: string;
  branchName: string;
  status: string;
  logsPath: string;
}

export async function listRuns(taskId: string): Promise<RunInfo[]> {
  const branches = await Git.listTaskRunBranches(taskId);
  const runs: RunInfo[] = [];

  for (const branch of branches) {
    const runIdx = parseRunNumber(branch);
    runs.push({
      runId: runIdx !== null ? String(runIdx) : branch,
      branchName: branch,
      status: "unknown",
      logsPath: await getLogsPath(taskId, runIdx || undefined),
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
