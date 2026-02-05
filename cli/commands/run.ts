import { Args } from "@std/cli/parse-args";
import { ensureDir } from "@std/fs/ensure-dir";
import { copy } from "@std/fs/copy";
import { isAbsolute, join, resolve } from "@std/path";
import { loadConfig } from "../utils/config.ts";
import * as Git from "../utils/git.ts";
import * as System from "../utils/system.ts";
import * as Docker from "../utils/docker.ts";
import { getTaskPath } from "../utils/tasks.ts";

export async function runCommand(args: Args) {
  const taskId = args._[1] as string;
  if (!taskId) {
    console.error("Error: Task ID is required.");
    console.error("Usage: hb run <task-id> [options]");
    Deno.exit(1);
  }

  console.log(`Preparing to run task ${taskId}...`);

  // 1. Configuration
  const config = await loadConfig();

  // 2. Git Worktree Prep
  let worktreePath = "";
  try {
    const isDirty = await Git.isGitDirty();
    let stashHash: string | null = null;

    if (isDirty) {
      console.log("Creating stash for tracked files...");
      stashHash = await Git.createStash();
    }

    console.log("Resolving branch structure...");
    const baseBranch = await Git.resolveBaseBranch(taskId);
    const runBranch = await Git.getNextRunBranch(taskId);

    // Worktree path: .hyperbranch/worktrees/<runBranch>
    // Note: runBranch contains slashes (task/123/run-1), so we need to flatten or nest
    // Git worktree path usually creates directories.
    // Let's use a flat folder name to avoid deep nesting issues if branch has many slashes?
    // Spec says: .hyperbranch/worktrees/<branch-name>
    const safeBranchName = runBranch.replace(/\//g, "-");
    worktreePath = resolve(
      Deno.cwd(),
      ".hyperbranch/worktrees",
      safeBranchName,
    );

    console.log(
      `Creating worktree at ${worktreePath} based on ${baseBranch}...`,
    );
    await Git.createWorktree(runBranch, baseBranch, worktreePath);

    if (stashHash) {
      console.log(`Applying stash ${stashHash}...`);
      await Git.applyStash(worktreePath, stashHash);
    }

    // 3. File Synchronization
    console.log("Synchronizing untracked files...");
    await Git.copyUntrackedFiles(worktreePath);

    if (config.copy.include.length > 0 || config.copy.includeDirs.length > 0) {
      console.log(`Copying ignored files...`);
      await Git.copyIgnoredFiles(worktreePath, config.copy);
    }

    // 4. Script Generation
    console.log("Generating execution assets...");
    await Docker.prepareWorktreeAssets(worktreePath, args["dockerfile"] as string);

  } catch (e) {
    console.error("\n❌ Setup Failed:");
    console.error(e instanceof Error ? e.message : String(e));
    if (worktreePath) {
      console.log(`\nPartial worktree may exist at: ${worktreePath}`);
    }
    Deno.exit(1);
  }

  // 4. Environment Prep
  console.log("Preparing environment...");

  const mounts = await System.getPackageCacheMounts();
  mounts.push(await System.getAgentConfigMount());

  const env = System.getEnvVars(config.env_vars);

  // User
  // For Linux, we need current UID:GID to avoid permission issues
  // Deno doesn't give GID easily.
  // We can use `id -u` and `id -g` via command.
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
  const image = (args["image"] as string) ||
    "mcr.microsoft.com/devcontainers/typescript-node:22";
  const dockerfile = args["dockerfile"] as string;

  let finalImage = image;

  if (dockerfile) {
    const tag = `hyperbranch-run:${taskId}`;
    await Docker.buildImage(dockerfile, tag);
    finalImage = tag;
  }

  // Command construction
  let execCmd = ["npx", "-y", "opencode-ai", `task-${taskId}.md`]; // Default

  if (args["exec"]) {
    execCmd = (args["exec"] as string).split(" ");
  } else if (args["exec-file"]) {
    // Run a specific file
    // Need to know how to run it. Assume node for .ts/.js, or executable
    const file = args["exec-file"] as string;
    execCmd = ["./" + file]; // Simple execution
  }

  const dockerArgsString = (args["docker-args"] as string) || "";
  const extraDockerArgs = dockerArgsString.split(" ").filter(Boolean);

  const dockerConfig: Docker.DockerConfig = {
    image: finalImage,
    dockerfile,
    exec: execCmd,
    workdir: "/app",
    hostWorkdir: worktreePath,
    mounts,
    env,
    user,
    dockerArgs: extraDockerArgs,
  };

  // 6. Execution
  console.log(`\n🚀 Launching container in ${worktreePath}...\n`);

  try {
    await Docker.runContainer(dockerConfig, worktreePath, (cid) => {
      // Detached mode: Container ID is received when confirmed running
      console.log(`Container started with ID: ${cid}`);
    });
    console.log(`\n✅ Task started successfully.`);
    console.log(`Logs available in: ${worktreePath}`);
    console.log(`Use 'hb logs ${taskId}' to view output.`);
  } catch (e) {
    console.error(`\n❌ Execution Failed:`);
    console.error(e instanceof Error ? e.message : String(e));
    console.log(`Logs available in: ${worktreePath}`);
    Deno.exit(1);
  }
}
