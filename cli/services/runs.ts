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

export async function run(
  taskId: string,
  options: RunOptions = {},
): Promise<RunResult> {
  // Mocking for tests
  if (Deno.env.get("HB_MOCK_RUNS") === "true") {
    return {
      runId: `run/${taskId}/mock`,
      containerId: "mock-container-id",
    };
  }

  // 1. Configuration
  const config = await loadConfig();

  // 2. Base Branch Resolution
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

  // 3. Worktree Preparation
  const runBranch = await Git.getNextRunBranch(taskId);
  const safeBranchName = runBranch.replace(/\//g, "-");
  const worktreePath = resolve(WORKTREES_DIR(), safeBranchName);
  const runDir = getRunDirFromWorktree(worktreePath);

  await GitWorktree.createWorktree(runBranch, baseBranch, worktreePath);

  // 4. Asset Preparation
  await Docker.prepareWorktreeAssets(runDir);

  // 5. Environment Setup
  const mounts = await System.getPackageCacheMounts();
  mounts.push(await System.getAgentConfigMount());

  const env = System.getEnvVars(config.env_vars || []);
  if (options.env) {
    Object.assign(env, options.env);
  }

  const user = await System.getUserId();

  // 6. Docker Image Setup
  let image = options.image ||
    "mcr.microsoft.com/devcontainers/typescript-node:22";
  if (options.dockerfile) {
    // We define the image tag here so that Docker Compose can tag the built image.
    // The actual build happens in Docker.runContainer via 'docker compose run --build'.
    image = `hyperbranch-run:${taskId}`;
  }

  // 7. Command Construction
  const taskFile = join(HYPERBRANCH_DIR, TASKS_DIR_NAME, `task-${taskId}.md`);
  Docker.writeEnvComposeFile(runDir, {
    HYPERBRANCH_TASK_ID: taskId,
    HYPERBRANCH_TASK_FILE: taskFile,
    HYPERBRANCH_AGENT_MODE: "build", // hardcoded "build" for now, could be extended to "plan" later
    HYPERBRANCH_PROMPT: options.prompt || "",
  });

  // Default exec command
  // we don't do join() here because it's used inside linux container
  // all arguments are passed as envs in the docker-compose:
  // HYPERBRANCH_TASK_ID, HYPERBRANCH_TASK_FILE, HYPERBRANCH_AGENT_MODE
  let execCmd = [ `./${HYPERBRANCH_DIR}/.current-run/entrypoint.sh` ]
  if (options.exec) {
    execCmd = options.exec;
  }

  const dockerConfig: Docker.DockerConfig = {
    image,
    name: `hb-${taskId}-${safeBranchName.split("-").pop()}`, // hb-<task>-<runIdx>
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

  // 8. Launch Container
  let containerId = "";
  try {
    await Docker.runContainer(dockerConfig, (cid) => {
      containerId = cid;
    });
    return { runId: runBranch, containerId };
  } catch (e) {
    throw e;
  }
}

export async function stop(taskId: string): Promise<void> {
  if (Deno.env.get("HB_MOCK_RUNS") === "true") {
    return;
  }
  const cid = await Runs.getContainerId(taskId);
  if (cid) {
    // Force remove (which stops it)
    await Docker.removeContainer(cid, true);
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
  const cid = await Runs.getContainerId(taskId);
  if (!cid) {
    return "stopped";
  }
  const { status } = await Docker.getContainerStatus(cid);
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
