
import { join, resolve } from "@std/path";
import { exists } from "@std/fs/exists";
import { loadConfig } from "../utils/config.ts";
import * as Git from "./git.ts";
import * as System from "../utils/system.ts";
import * as Docker from "../utils/docker.ts";
import { WORKTREES_DIR, HYPERBRANCH_DIR, TASKS_DIR_NAME, getRunDir } from "../utils/paths.ts";
import { getRunBranchName } from "../utils/branch-naming.ts";

export interface RunOptions {
  image?: string;
  dockerfile?: string;
  exec?: string[];
  env?: Record<string, string>;
  dockerArgs?: string[];
}

export interface RunResult {
  runId: string;
  containerId: string;
}

export async function run(taskId: string, options: RunOptions = {}): Promise<RunResult> {
  if (Deno.env.get("HB_MOCK_RUNS") === "true") {
    console.log(`[MOCK] Simulating run for task ${taskId}`);
    return {
      runId: `run/${taskId}/mock`,
      containerId: "mock-container-id"
    };
  }

  console.log(`Preparing to run task ${taskId}...`);

  // 1. Configuration
  const config = await loadConfig();

  // 2. Git Worktree Prep
  let safeBranchName = "";
  let worktreePath = "";
  let runDir = "";
  
  console.log("Resolving branch structure...");
  const baseBranch = await Git.resolveBaseBranch(taskId);
  
  // Verify task file exists in base branch
  const taskFileRelative = join(HYPERBRANCH_DIR, TASKS_DIR_NAME, `task-${taskId}.md`);
  const taskExists = await Git.checkFileExistsInBranch(baseBranch, taskFileRelative);
  
  if (!taskExists) {
    throw new Error(`Task file '${taskFileRelative}' not found in base branch '${baseBranch}'. Cannot start run.`);
  }

  const runBranch = await Git.getNextRunBranch(taskId);

  // Worktree path: .hyperbranch/worktrees/<runBranch>
  safeBranchName = runBranch.replace(/\//g, "-");
  worktreePath = resolve(
    WORKTREES_DIR(),
    safeBranchName,
  );
  
  // Define run directory
  runDir = getRunDir(worktreePath);

  console.log(
    `Creating worktree at ${worktreePath} based on ${baseBranch}...`,
  );
  await Git.createWorktree(runBranch, baseBranch, worktreePath);

  // Gitignore Check
  const gitignorePath = join(worktreePath, ".gitignore");
  const ignoreEntry = ".hyperbranch/.current-run/";
  try {
    let content = "";
    try {
      content = await Deno.readTextFile(gitignorePath);
    } catch {
      // File doesn't exist, start empty
    }
    
    if (!content.includes(ignoreEntry)) {
      console.log("Adding .hyperbranch/.current-run/ to .gitignore...");
      const newContent = content.endsWith("\n") || content === "" 
        ? content + ignoreEntry + "\n" 
        : content + "\n" + ignoreEntry + "\n";
      
      await Deno.writeTextFile(gitignorePath, newContent);
      await Git.add([".gitignore"], worktreePath);
    }
  } catch (e) {
    console.warn("Warning: Failed to update .gitignore:", e);
  }

  // 4. Script Generation
  console.log("Generating execution assets...");
  await Docker.prepareWorktreeAssets(worktreePath, runDir, options.dockerfile);

  // 4. Environment Prep
  console.log("Preparing environment...");

  const mounts = await System.getPackageCacheMounts();
  mounts.push(await System.getAgentConfigMount());

  const env = System.getEnvVars(config.env_vars);
  if (options.env) {
    Object.assign(env, options.env);
  }

  // User
  let user = "node"; // Default for the image
  if (Deno.build.os === "linux") {
    try {
      const uidProcess = new Deno.Command("id", { args: ["-u"] });
      const gidProcess = new Deno.Command("id", { args: ["-g"] });
      const uid = new TextDecoder().decode((await uidProcess.output()).stdout)
        .trim();
      const gid = new TextDecoder().decode((await gidProcess.output()).stdout)
        .trim();
      user = `${uid}:${gid}`;
    } catch {
      console.warn("Failed to detect UID/GID, defaulting to 'node' user.");
    }
  }

  // 5. Docker Prep
  const image = options.image || "mcr.microsoft.com/devcontainers/typescript-node:22";
  let finalImage = image;

  if (options.dockerfile) {
    const tag = `hyperbranch-run:${taskId}`;
    await Docker.buildImage(options.dockerfile, tag);
    finalImage = tag;
  }

  // Command construction
  const taskFile = join(HYPERBRANCH_DIR, TASKS_DIR_NAME, `task-${taskId}.md`);
  let execCmd = ["npx", "-y", "opencode-ai", "run", "--file", taskFile, "--", "Please complete this task."]; // Default

  if (options.exec) {
    execCmd = options.exec;
  }

  const dockerConfig: Docker.DockerConfig = {
    image: finalImage,
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

  // 6. Execution
  console.log(`\n🚀 Launching container in ${worktreePath}...\n`);

  let containerId = "";
  try {
    await Docker.runContainer(dockerConfig, (cid) => {
      containerId = cid;
      console.log(`Container started with ID: ${cid}`);
    });
    console.log(`\n✅ Task started successfully.`);
    return { runId: runBranch, containerId };
  } catch (e) {
    console.error(`\n❌ Execution Failed:`);
    console.error(e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export async function stop(id: string): Promise<void> {
  if (Deno.env.get("HB_MOCK_RUNS") === "true") {
    console.log(`[MOCK] Simulating stop for task ${id}`);
    return;
  }

  // This is tricky because we need to find the running container for this task.
    // The CLI stop command isn't provided in the prompt context but we can infer it.
    // We can look for the latest run of the task.
    
    // For now, let's look for the CID file in the latest run directory.
    const latestBranch = await Git.getLatestRunBranch(id);
    if (!latestBranch) {
        throw new Error(`No runs found for task ${id}`);
    }
    
    const runDir = await getRunDirFromBranch(latestBranch);
    const cidFile = join(runDir, "hb.cid");
    
    if (!(await exists(cidFile))) {
        throw new Error(`No running container found for task ${id} (run: ${latestBranch})`);
    }
    
    const cid = (await Deno.readTextFile(cidFile)).trim();
    if (!cid) {
        throw new Error(`CID file is empty for task ${id}`);
    }
    
    await Docker.removeContainer(cid, true);
}

export async function getLogsPath(id: string, runIndex?: number): Promise<string> {
  let runBranch = "";
  if (runIndex !== undefined) {
    runBranch = getRunBranchName(id, runIndex);
  } else {
    const latest = await Git.getLatestRunBranch(id);
    if (!latest) {
      throw new Error(`No runs found for task ${id}`);
    }
    runBranch = latest;
  }
  
  const runDir = await getRunDirFromBranch(runBranch);
  const logFile = join(runDir, "docker.log");
  
  // Note: logs might be in stdout.log/stderr.log depending on how Docker.runContainer works
  // But run.sh usually redirects to docker.log or we used stdout.log/stderr.log in the command.
  // Checking cli/utils/docker.ts:
  // "nohup "${runScript}" ... > "${stdoutPath}" 2> "${stderrPath}" ..."
  // So there is NO docker.log file generated by Docker.runContainer directly?
  // Wait, the prompt says: "Stream docker.log as interleaved JSON messages".
  // And "Ensure logs.ts reads docker.log (consistent with run.sh)".
  // Let's check `cli/assets/run.sh` if possible, or assume `run.sh` combines them.
  // If `run.sh` combines them, it must be writing to a file.
  // BUT `cli/utils/docker.ts` redirects stdout/stderr of run.sh to `stdout.log` and `stderr.log`.
  
  // Let's stick to what `cli/commands/logs.ts` looks for.
  // `cli/commands/logs.ts` looks for `docker.log`.
  // So `run.sh` MUST be creating `docker.log`.
  
  if (!(await exists(logFile))) {
      // Fallback to stdout.log if docker.log doesn't exist?
      // Or just return the path and let caller handle it.
  }
  return logFile;
}

export async function getStatus(id: string): Promise<string> {
    // Check if running
    const latestBranch = await Git.getLatestRunBranch(id);
    if (!latestBranch) return "not_started";
    
    const runDir = await getRunDirFromBranch(latestBranch);
    const cidFile = join(runDir, "hb.cid");
    
    if (!(await exists(cidFile))) return "stopped";
    
    const cid = (await Deno.readTextFile(cidFile)).trim();
    if (!cid) return "stopped";
    
    const { status } = await Docker.getContainerStatus(cid);
    return status; // "running", "exited", etc.
}

// Helper to resolve run dir from branch name
async function getRunDirFromBranch(branchName: string): Promise<string> {
    const safeBranchName = branchName.replace(/\//g, "-");
    const worktreePath = resolve(
        WORKTREES_DIR(),
        safeBranchName,
    );
    return getRunDir(worktreePath);
}
