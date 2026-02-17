import { exists } from "@std/fs/exists";
import { join } from "@std/path";
import * as Git from "../utils/git.ts";
import * as GitWorktree from "../utils/git-worktree.ts";
import * as Docker from "../utils/docker.ts";
import * as Compose from "../utils/docker-compose.ts";
import { RunContext, RunState } from "./types.ts";
import { HYPERBRANCH_DIR, TASKS_DIR_NAME } from "../utils/paths.ts";

export interface PrepareOptions {
  prompt?: string;
  env?: Record<string, string>;
  image?: string;
  dockerfile?: string;
  exec?: string[];
}

/**
 * Phase 1: Prepare
 * Creates the worktree and scaffolds the run directory.
 */
export async function prepare(ctx: RunContext, options: PrepareOptions = {}): Promise<void> {
  // 1. Resolve Base Branch
  const baseBranch = await Git.resolveBaseBranch(ctx.taskId);

  // Verify task file exists in base branch
  const taskFileRelative = join(
    HYPERBRANCH_DIR,
    TASKS_DIR_NAME,
    `task-${ctx.taskId}.md`,
  );
  
  if (!(await Git.checkFileExistsInBranch(baseBranch, taskFileRelative))) {
    throw new Error(
      `Task file '${taskFileRelative}' not found in base branch '${baseBranch}'. Cannot start run.`,
    );
  }

  // 2. Create Worktree
  if (await exists(ctx.worktreePath)) {
    throw new Error(`Worktree for run already exists at '${ctx.worktreePath}'`);
  }

  await GitWorktree.createWorktree(ctx.branchName, baseBranch, ctx.worktreePath);

  // 3. Asset Preparation
  await Docker.prepareWorktreeAssets(ctx.paths.runDir, {
    dockerfile: options.dockerfile,
    // If we support custom compose files in future, pass here
  });

  // 4. Write .env.compose
  // We need to get the user ID to ensure file permissions are correct
  const userId = await Docker.getUserId();

  // Get git config for auto-commits
  const gitName = await Git.getConfig("user.name") || "";
  const gitEmail = await Git.getConfig("user.email") || "";
  
  const env: Record<string, string> = {
    HYPERBRANCH_TASK_ID: ctx.taskId,
    HYPERBRANCH_TASK_FILE: taskFileRelative,
    HYPERBRANCH_AGENT_MODE: "build",
    HYPERBRANCH_PROMPT: options.prompt || "",
    // Platform specific
    HB_USER: userId,
    HB_UID: userId.split(":")[0],
    HB_GID: userId.split(":")[1] || userId.split(":")[0],
    // Git Identity
    GIT_AUTHOR_NAME: gitName,
    GIT_AUTHOR_EMAIL: gitEmail,
    GIT_COMMITTER_NAME: gitName,
    GIT_COMMITTER_EMAIL: gitEmail,
    // Custom envs
    ...options.env,
  };

  await Docker.writeEnvComposeFile(ctx.paths.runDir, env);
}

/**
 * Phase 2: Start
 * Boots the container using Docker Compose.
 */
export async function start(ctx: RunContext): Promise<void> {
  if (!(await exists(ctx.paths.composeFile))) {
    throw new Error(`Compose file not found at ${ctx.paths.composeFile}. Did you run prepare()?`);
  }

  // Start with project name to isolate resources
  await Compose.up(ctx.paths.runDir, ctx.paths.composeFile, ctx.dockerProjectName);
}

/**
 * Phase 3: Inspect
 * Returns connection details for the running container.
 */
export async function inspect(ctx: RunContext): Promise<{ port: number; status: string }> {
  // Check status
  const isRunning = await Compose.isRunningAny(ctx.paths.runDir, ctx.paths.composeFile, ctx.dockerProjectName);
  const status = isRunning ? "running" : "stopped";
  
  // Get dynamic port (internal 4096 -> host ?)
  let port = 0;
  if (isRunning) {
    try {
      port = await Compose.getServiceHostPort(
        ctx.paths.runDir, 
        ctx.paths.composeFile, 
        "task", 
        4096,
        ctx.dockerProjectName
      );
    } catch {
      // Ignore if port lookup fails (container might be starting or dead)
    }
  }

  return { port, status };
}

/**
 * Phase 4: Stop
 * Stops the container but preserves artifacts.
 */
export async function stop(ctx: RunContext): Promise<void> {
  if (await exists(ctx.paths.composeFile)) {
    await Compose.stop(ctx.paths.runDir, ctx.paths.composeFile, ctx.dockerProjectName);
  }
}

/**
 * Phase 5: Destroy
 * deeply cleans up all artifacts (Containers -> Worktree -> Branch).
 */
export async function destroy(ctx: RunContext): Promise<void> {
  // 1. Docker Cleanup (Down -v to remove volumes/networks)
  if (await exists(ctx.paths.composeFile)) {
    try {
      await Compose.down(ctx.paths.runDir, ctx.paths.composeFile, ctx.dockerProjectName);
    } catch (e) {
      console.warn(`Warning: Docker cleanup failed: ${e}`);
    }
  } else {
    // If compose file is gone, try to kill by project name just in case?
    // Usually 'down' requires the file.
    // We could use `docker compose -p project down` without file? 
    // No, compose usually needs the file to know what to down, unless we use standard naming.
    // Fallback: manually kill containers by label/name?
    // For now, assume if file is gone, maybe worktree is half-deleted.
  }

  // 2. Worktree Cleanup
  if (await exists(ctx.worktreePath)) {
     // Check if dirty? For force destroy we don't care.
     await GitWorktree.removeWorktree(ctx.worktreePath, true);
  } else {
     // It might be registered but directory missing
     // Try to prune
     await GitWorktree.pruneWorktrees();
  }

  // 3. Branch Cleanup
  if (await Git.branchExists(ctx.branchName)) {
    await Git.deleteBranch(ctx.branchName, true);
  }
}

/**
 * Logs
 * Streams logs from the container.
 */
export async function logs(ctx: RunContext, follow: boolean = false): Promise<Deno.ChildProcess> {
   // We use docker compose logs
   // This returns the process so the caller can pipe stdout/stderr
   return Compose.logs(ctx.paths.runDir, ctx.paths.composeFile, ctx.dockerProjectName, follow);
}


export async function getHostPort(ctx: RunContext, containerPort: number): Promise<number> {
  const isRunning = await Compose.isRunningAny(ctx.paths.runDir, ctx.paths.composeFile, ctx.dockerProjectName);
  if (!isRunning) {
    throw new Error(`Run '${ctx.branchName}' is not running`);
  }

  try {
    return await Compose.getServiceHostPort(
      ctx.paths.runDir, 
      ctx.paths.composeFile, 
      "task", 
      containerPort,
      ctx.dockerProjectName
    );
  } catch (e) {
    throw new Error(`Port ${containerPort} is not opened`);
  }
}


export async function getRunState(ctx: RunContext): Promise<RunState> {
  const branchExists = await Git.branchExists(ctx.branchName);
  const worktreeExists = await exists(ctx.worktreePath);
  const composeFileExists = await exists(ctx.paths.composeFile);

  // Helper to find container
  let containerId: string | null = null;
  if (composeFileExists) {
    containerId = await Compose.getServiceContainerId(
      ctx.paths.runDir,
      ctx.paths.composeFile,
      "task",
      ctx.dockerProjectName
    );
  } else {
    // Fallback: try to find by predictable name if compose file is gone
    // Docker Compose V2 usually names: project-service-index
    const name = `${ctx.dockerProjectName}-task-1`;
    containerId = await Docker.getContainerIdByName(name);
  }

  // 2. Check Traces
  if (!branchExists && !worktreeExists && !containerId) {
    return "unknown";
  }

  // 3. Analyze Container Status
  if (containerId) {
    const { status, exitCode } = await Docker.getContainerStatus(containerId);

    if (status === "created" || status === "restarting") {
        return "starting";
    }

    if (status === "running") {
        return "working";
    }

    if (status === "exited") {
        if (exitCode === 0) {
            return "completed";
        }
        return "failed";
    }
    
    // Fallback for weird states (dead, paused, removing)
    return "failed";
  }

  // 4. No container, but artifacts exist
  return "preparing";
}
