import fs from "node:fs";
const exists = async (p: string) => fs.promises.access(p).then(()=>true).catch(()=>false);
import * as Git from "../utils/git.js";
import * as Docker from "../utils/docker.js";
import * as Compose from "../utils/docker-compose.js";
import { getRunContext } from "../runtime/context.js";
import { RunId } from "../utils/id.js";
import { getOpencodeService } from "./opencode.js";
import { getHostPort } from "./runs.js";

export async function syncRun(run: RunId): Promise<void> {
  const ctx = getRunContext(run);

  if (!(await exists(ctx.clonePath))) {
    throw new Error(`Run clone not found at ${ctx.clonePath}`);
  }

  const baseBranch = await Git.resolveBaseBranch(run.task);

  // 1. Fetch and Push base branch to run's remote on host
  // To ensure the container has the latest base branch, we push from the main repo into the clone
  // The task specifies: "core: push the base branch commits to the git remote corresponding to the run branch"
  const runRemote = run.toDirectorySlug();
  await Git.git(["push", runRemote, `${baseBranch}:${baseBranch}`]);

  // 2. Get container ID
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

  // 3. Stash changes inside container
  const stashMessage = "hyperbranch-pre-sync";
  await Docker.execContainer(containerId, ["git", "stash", "push", "-m", stashMessage], { workdir: "/app" });

  try {
    // 4. Try fast-forward merge
    let ffSuccessful = false;
    try {
      await Docker.execContainer(containerId, ["git", "merge", "--ff-only", baseBranch], { workdir: "/app" });
      ffSuccessful = true;
    } catch (e) {
      // Fast-forward failed, we need a smart merge
      ffSuccessful = false;
    }

    if (ffSuccessful) {
      // 5a. Pop stash and handle stash conflicts
      try {
        await Docker.execContainer(containerId, ["git", "stash", "pop"], { workdir: "/app" });
      } catch (stashPopError) {
        // Stash pop had conflicts, trigger smart merge for stash
        await triggerSmartMerge(run, containerId, "Resolve git stash pop merge conflicts in the current directory. Follow project conventions and leave the files staged. Do not commit. If there are no conflicts, just leave everything staged.");
      }
    } else {
      // 5b. Smart Merge for branch conflicts
      // First, do a regular merge without ff to get conflicts in the working directory
      try {
        await Docker.execContainer(containerId, ["git", "merge", baseBranch], { workdir: "/app" });
      } catch (mergeError) {
        // This is expected to throw because of conflicts
      }

      // Then trigger opencode
      await triggerSmartMerge(run, containerId, `Resolve git merge conflicts between the current branch and ${baseBranch}. Follow project conventions and leave the resolved files staged. Do not commit. If there are no conflicts, just leave everything staged.`);
    }

  } catch (e) {
    throw new Error(`Failed to sync run: ${e}`);
  }
}

async function triggerSmartMerge(run: RunId, containerId: string, prompt: string) {
  const port = await getHostPort(run, 4096);
  const service = getOpencodeService(port);

  try {
    service.queueAction(async () => {
      const sessionId = await service.createSessionWithPrompt(prompt, { agentMode: "build" });
      console.log(`Started opencode smart merge session ${sessionId} for run ${run} on port ${port}`);
    });
  } catch (err: any) {
    console.error(`Failed to trigger opencode session: ${err.message}`);
    throw new Error("Failed to trigger smart merge using Opencode SDK.");
  }
}
