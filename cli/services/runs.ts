import { join, resolve } from "@std/path"
import { exists } from "@std/fs/exists"
import * as Git from "../utils/git.ts"
import * as Docker from "../utils/docker.ts"
import * as System from "../utils/system.ts"
import * as Runs from "../utils/runs.ts"
import { loadConfig } from "../utils/config.ts"; // Assuming this is still needed for env vars
import { WORKTREES_DIR, HYPERBRANCH_DIR, TASKS_DIR_NAME, getRunDir as getRunDirFromWorktree } from "../utils/paths.ts"

export interface RunOptions {
  image?: string
  dockerfile?: string
  exec?: string[]
  env?: Record<string, string>
  dockerArgs?: string[]
}

export interface RunResult {
  runId: string
  containerId: string
}

export async function run(taskId: string, options: RunOptions = {}): Promise<RunResult> {
  // Mocking for tests
  if (Deno.env.get("HB_MOCK_RUNS") === "true") {
    return {
      runId: `run/${taskId}/mock`,
      containerId: "mock-container-id",
    }
  }

  // 1. Configuration
  const config = await loadConfig()

  // 2. Base Branch Resolution
  const baseBranch = await Git.resolveBaseBranch(taskId)
  
  // Verify task file exists in base branch
  const taskFileRelative = join(HYPERBRANCH_DIR, TASKS_DIR_NAME, `task-${taskId}.md`)
  const taskExists = await Git.checkFileExistsInBranch(baseBranch, taskFileRelative)
  
  if (!taskExists) {
    throw new Error(`Task file '${taskFileRelative}' not found in base branch '${baseBranch}'. Cannot start run.`)
  }

  // 3. Worktree Preparation
  const runBranch = await Git.getNextRunBranch(taskId)
  const safeBranchName = runBranch.replace(/\//g, "-")
  const worktreePath = resolve(WORKTREES_DIR(), safeBranchName)
  const runDir = getRunDirFromWorktree(worktreePath)

  await Git.createWorktree(runBranch, baseBranch, worktreePath)

  // Gitignore Check
  const gitignorePath = join(worktreePath, ".gitignore")
  const ignoreEntry = ".hyperbranch/.current-run/"
  try {
    let content = ""
    if (await exists(gitignorePath)) {
        content = await Deno.readTextFile(gitignorePath)
    }
    
    if (!content.includes(ignoreEntry)) {
      const newContent = content.endsWith("\n") || content === "" 
        ? content + ignoreEntry + "\n" 
        : content + "\n" + ignoreEntry + "\n"
      
      await Deno.writeTextFile(gitignorePath, newContent)
      // We don't commit this change, just have it in the worktree to prevent accidental commits of run artifacts
    }
  } catch (e) {
    console.warn("Warning: Failed to update .gitignore:", e)
  }

  // 4. Asset Preparation
  await Docker.prepareWorktreeAssets(worktreePath, runDir, options.dockerfile)

  // 5. Environment Setup
  const mounts = await System.getPackageCacheMounts()
  mounts.push(await System.getAgentConfigMount())

  const env = System.getEnvVars(config.env_vars || [])
  if (options.env) {
    Object.assign(env, options.env)
  }

  const user = await System.getUserId()

  // 6. Docker Image Setup
  let image = options.image || "mcr.microsoft.com/devcontainers/typescript-node:22"
  if (options.dockerfile) {
    const tag = `hyperbranch-run:${taskId}`
    await Docker.buildImage(options.dockerfile, tag)
    image = tag
  }

  // 7. Command Construction
  const taskFile = join(HYPERBRANCH_DIR, TASKS_DIR_NAME, `task-${taskId}.md`)
  // Default exec command
  let execCmd = ["npx", "-y", "opencode-ai", "run", "--file", taskFile, "--", "Please complete this task."]; 

  if (options.exec) {
    execCmd = options.exec
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
  }

  // 8. Launch Container
  let containerId = ""
  try {
    await Docker.runContainer(dockerConfig, (cid) => {
      containerId = cid
    })
    return { runId: runBranch, containerId }
  } catch (e) {
    throw e
  }
}

export async function stop(taskId: string): Promise<void> {
  if (Deno.env.get("HB_MOCK_RUNS") === "true") {
    return
  }
  const cid = await Runs.getContainerId(taskId)
  if (cid) {
    // Force remove (which stops it)
    await Docker.removeContainer(cid, true)
  } else {
      // If we can't find the CID, we can't stop it. 
      // Maybe throw or just return? The previous implementation threw error.
      // But Runs.getContainerId returns null if not found.
      // I'll throw to be informative.
      throw new Error(`No running container found for task ${taskId}`)
  }
}

export async function getLogsPath(taskId: string, runIndex?: number): Promise<string> {
  return await Runs.getLogsPath(taskId, runIndex)
}

export async function getStatus(taskId: string): Promise<string> {
  const cid = await Runs.getContainerId(taskId)
  if (!cid) {
    return "stopped"
  }
  const { status } = await Docker.getContainerStatus(cid)
  return status
}
