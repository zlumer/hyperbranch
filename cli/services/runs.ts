import { exists } from "@std/fs/exists";
import * as Git from "../utils/git.ts";
import * as GitClones from "../utils/git-clones.ts";
import * as Lifecycle from "../runtime/lifecycle.ts";
import * as Docker from "../utils/docker.ts";
import * as Compose from "../utils/docker-compose.ts";
import { getRunContext } from "../runtime/context.ts";
import { RunId, TaskId } from "../utils/id.ts";
import { RUNS_DIR } from "../utils/paths.ts";

export interface RunOptions extends Lifecycle.PrepareOptions {}

export interface RunResult {
  runId: string;
  port: number;
}

export async function run(
  taskId: TaskId,
  options: RunOptions & { commit?: boolean } = {},
): Promise<RunResult> {

  // commit the dirty task file first if --commit is passed
  if (options.commit)
    await Git.commitDirtyTaskFile(taskId.id);

  // 1. Determine next run index
  // We need to look at existing branches to find the next index
  let nextRun = await Git.getNextRunBranch(taskId);

  let ctx = getRunContext(nextRun);

  let iterations = 0;
  while (await exists(ctx.clonePath)) {
    console.warn(`⚠️  Found stale run directory at ${ctx.clonePath}. Bumping run index to avoid conflicts.`);
    nextRun = nextRun.task.toRunId(nextRun.idx + 1);
    ctx = getRunContext(nextRun);
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

export async function stopRun(run: RunId): Promise<void> {
  const ctx = getRunContext(run);
  await Lifecycle.stop(ctx);
}

export async function destroyRun(run: RunId): Promise<void> {
  const ctx = getRunContext(run);
  await Lifecycle.destroy(ctx);
}

export async function removeRun(run: RunId, force: boolean): Promise<void> {
  // Safety checks
  if (!force) {
    const status = await getStatus(run);
    if (status.toLowerCase() === "working" || status.toLowerCase() === "starting") {
       throw new Error(`Run ${run.toString()} is active (${status}). Use --force to remove.`);
    }

    // Check Git Cleanliness
    const runBranch = run.toBranchName()
    if (await Git.branchExists(runBranch)) {
        const remoteName = run.toDirectorySlug();
        await Git.fetch(remoteName, `${runBranch}:${runBranch}`);
        const baseBranch = await Git.resolveBaseBranch(run.task);
        const unmerged = await Git.getUnmergedCommits(runBranch, baseBranch);
        if (unmerged.trim().length > 0) {
            throw new Error(`Run has unmerged commits:\n${unmerged}\nUse --force to delete anyway.`);
        }
    }
  }

  console.log(`Removing run ${run.toString()}...`);
  await destroyRun(run);
  console.log("✅ Run removed.");
}

export async function getStatus(runId: RunId): Promise<string> {
  const ctx = getRunContext(runId);
  const status = await Lifecycle.getRunState(ctx);
  return status;
}

export async function resumeRun(runId: RunId): Promise<void> {
  const ctx = getRunContext(runId);
  await Lifecycle.start(ctx);
}

export interface RunInfo {
  runId: RunId;
  branchName: string;
  status: string;
  logsPath: string; // Deprecated
  drift?: { ahead: number; behind: number; isFfAble: boolean };
}

async function findRunsByBranches(task: TaskId): Promise<RunId[]> {
  const branches = await Git.listTaskRunBranches(task);
  return branches.map((b) => RunId.fromString(b)).filter((r): r is RunId =>
    !!r
  );
}

async function findRunsByClones(task: TaskId): Promise<RunId[]> {
  const runsDir = RUNS_DIR();
  if (!(await exists(runsDir))) return [];
  const runs: RunId[] = [];
  const slugPrefix = task.toDirectorySlug() + "-";
  for await (const entry of Deno.readDir(runsDir)) {
    if (entry.isDirectory && entry.name.startsWith(slugPrefix)) {
      const runId = RunId.fromString(entry.name);
      if (runId && runId.task.id === task.id) {
        runs.push(runId);
      }
    }
  }
  return runs;
}

async function findRunsByContainers(task: TaskId): Promise<RunId[]> {
  const slugPrefix = task.toDirectorySlug() + "-";
  const containerNames = await Docker.findContainersByPartialName(slugPrefix);
  const runs = new Map<string, RunId>();

  const regex = new RegExp(`^(${task.toDirectorySlug()}-\\d+)`);

  for (const name of containerNames) {
    const match = name.match(regex);
    if (match) {
      const slug = match[1];
      const runId = RunId.fromString(slug);
      if (runId && runId.task.id === task.id) {
        runs.set(runId.toString(), runId);
      }
    }
  }
  return Array.from(runs.values());
}

export async function listRuns(task: TaskId): Promise<RunInfo[]> {
  const [branchRuns, cloneRuns, containerRuns] = await Promise.all([
    findRunsByBranches(task),
    findRunsByClones(task),
    findRunsByContainers(task),
  ]);

  const allRuns = new Map<string, RunId>();
  for (const r of [...branchRuns, ...cloneRuns, ...containerRuns]) {
    allRuns.set(r.toString(), r);
  }

  const runs: RunInfo[] = [];
  const baseBranch = await Git.resolveBaseBranch(task);

  for (const run of allRuns.values()) {
    const ctx = getRunContext(run);
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
      runId: run,
      branchName: run.toBranchName(),
      status,
      logsPath: "",
      drift,
    });
  }

  // Sort by index descending
  return runs.sort((a, b) => b.runId.idx - a.runId.idx);
}

export async function getRunCount(task: TaskId): Promise<number> {
  const [branchRuns, cloneRuns, containerRuns] = await Promise.all([
    findRunsByBranches(task),
    findRunsByClones(task),
    findRunsByContainers(task),
  ]);

  const allRuns = new Set<string>();
  for (const r of [...branchRuns, ...cloneRuns, ...containerRuns]) {
    allRuns.add(r.toString());
  }

  return allRuns.size;
}

export async function getRunFiles(
  branch: string,
  path: string = "",
): Promise<
  { type: "file"; content: string } | { type: "dir"; files: Git.GitFile[] }
> {
  // This remains Git-based, so it's fine
  const type = await Git.getType(branch, path);
  if (type === "blob") {
    const content = await Git.readFile(branch, path);
    return { type: "file", content };
  } else if (type === "tree") {
    const files = await Git.listFilesDetailed(branch, path);
    return { type: "dir", files };
  }
  throw new Error(`Path '${path}' not found in run '${branch}'`);
}

export async function mergeRun(
  run: RunId,
  strategy: "merge" | "squash" | "ff",
  cleanup: boolean = false,
): Promise<{ cleanupSkipped: boolean }> {
  const baseBranch = await Git.resolveBaseBranch(run.task);
  const currentBranch = await Git.getCurrentBranch();

  if (baseBranch !== currentBranch) {
    throw new Error(
      `Cannot merge run. Current branch is '${currentBranch}', but run base branch is '${baseBranch}'. Please checkout '${baseBranch}' first.`,
    );
  }

//   const branchInfo = splitRunBranchName(runId);
//   const remoteName = branchInfo ? `hb-${branchInfo?.taskId}-${branchInfo.runIndex}` : runId;
  await Git.fetch(run.toDirectorySlug(), `${run.toBranchName()}:${run.toBranchName()}`);
  await Git.merge(run.toBranchName(), strategy);

  if (!cleanup)
    return { cleanupSkipped: false }

  const ctx = getRunContext(run);
  const isDirty = await GitClones.status(ctx.clonePath);
  if (isDirty)
    return { cleanupSkipped: true }

  await destroyRun(run);
  
  return { cleanupSkipped: false };
}

export async function pullRun(
  run: RunId,
  strategy: "merge" | "rebase" = "rebase",
): Promise<void> {
  const ctx = getRunContext(run);

  if (!(await exists(ctx.clonePath))) {
    throw new Error(`Run clone not found at ${ctx.clonePath}`);
  }

  const baseBranch = await Git.resolveBaseBranch(run.task);

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
    throw new Error(`Container for run ${run} not found or not running`);
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

export const _deps = {
  Git,
  Lifecycle
};

// Logs helper for server/CLI
export async function getLogsStream(run: RunId, follow: boolean): Promise<Deno.ChildProcess> {
  const ctx = getRunContext(run);
  return Lifecycle.logs(ctx, follow);
}

export async function getLatestRunId(taskId: TaskId): Promise<RunId | null> {
  return await Git.getLatestRunBranch(taskId);
}

export async function getHostPort(run: RunId, containerPort: number): Promise<number> {
  const ctx = getRunContext(run);

  // Check if branch exists
  if (!(await Git.branchExists(ctx.branchName))) {
    throw new Error(`Run ID '${run}' does not exist`);
  }

  return await Lifecycle.getHostPort(ctx, containerPort);
}
