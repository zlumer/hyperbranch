import { Args } from "@std/cli/parse-args";
import { resolve, join } from "@std/path";
import { exists } from "@std/fs/exists";
import { checkTaskExists } from "../utils/loadTask.ts";
import * as Git from "../utils/git.ts";
import * as GitWorktree from "../utils/git-worktree.ts";
import * as Docker from "../utils/docker.ts";
import * as Tasks from "../services/tasks.ts";
import * as Runs from "../services/runs.ts";
import { WORKTREES_DIR } from "../utils/paths.ts";
import { getRunBranchName, getRunBranchPrefix } from "../utils/branch-naming.ts";

export async function rmCommand(args: Args) {
  const targets = args._.slice(1).map(String);
  const force = args.force || args.f || false;

  if (args.sweep) {
    if (force) {
      console.warn("Warning: --force is ignored when using --sweep. Use specific targets to force removal.");
    }
    await sweep();
    return;
  }

  if (targets.length === 0) {
    await listCandidates(args);
    return;
  }

  let hasError = false;

  for (const target of targets) {
    try {
      const runMatch = target.match(/^([a-zA-Z0-9-]+)\/(\d+)$/);
      if (runMatch) {
        const taskId = runMatch[1];
        const runIndex = parseInt(runMatch[2], 10);
        await removeRun(taskId, runIndex, force);
        continue;
      }

      const taskMatch = target.match(/^([a-zA-Z0-9-]+)$/);
      if (taskMatch) {
        await removeTask(taskMatch[1], force);
        continue;
      }

      console.error(`Invalid target format: ${target}`);
      hasError = true;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      hasError = true;
    }
  }

  if (hasError) {
    Deno.exit(1);
  }
}

// AI! move to service and break into shorter functions if needed
async function removeRun(taskId: string, runIndex: number, force: boolean) {
  const runId = getRunBranchName(taskId, runIndex);
  
  // Safety checks
  if (!force) {
    const status = await Runs.getStatus(runId);
    if (status.toLowerCase() === "running") {
       throw new Error(`Run ${taskId}/${runIndex} is active (${status}). Use --force to remove.`);
    }

    // Check Git Cleanliness
    // We need to construct context or use Git utils directly
    const runBranch = runId;
    if (await Git.branchExists(runBranch)) {
        const baseBranch = await Git.resolveBaseBranch(taskId);
        const unmerged = await Git.getUnmergedCommits(runBranch, baseBranch);
        if (unmerged.trim().length > 0) {
            throw new Error(`Run has unmerged commits:\n${unmerged}\nUse --force to delete anyway.`);
        }
    }
  }

  console.log(`Removing run ${taskId}/${runIndex}...`);
  await Runs.destroyRun(runId);
  console.log("✅ Run removed.");
}

// AI! move to service and break into shorter functions if needed
async function sweep() {
  const worktreesDir = WORKTREES_DIR();
  if (!(await exists(worktreesDir))) {
    console.log("No worktrees found.");
    return;
  }

  console.log("Sweeping worktrees...");

  for await (const entry of Deno.readDir(worktreesDir)) {
    if (!entry.isDirectory) continue;
    
    // Expect hb-<taskId>-<runIndex>
    // But taskId might contain dashes, so we look for hb- prefix and digits at end
    const match = entry.name.match(/^hb-(.+)-(\d+)$/);
    if (!match) continue;

    const taskId = match[1];
    const runIndex = parseInt(match[2], 10);
    const runId = getRunBranchName(taskId, runIndex);

    // Check Active
    const status = await Runs.getStatus(runId);
    if (status.toLowerCase() === "running") {
      console.log(`Skipping ${taskId}/${runIndex}: Run is active.`);
      continue;
    }

    // Check Dirty
    const worktreePath = join(worktreesDir, entry.name);
    const isDirty = await GitWorktree.status(worktreePath);
    if (isDirty) {
      console.log(`Skipping ${taskId}/${runIndex}: Worktree is dirty.`);
      continue;
    }

    // Check Merged
    const runBranch = runId;
    if (await Git.branchExists(runBranch)) {
       const baseBranch = await Git.resolveBaseBranch(taskId);
       const isMerged = await Git.isBranchMerged(runBranch, baseBranch);
       if (!isMerged) {
         console.log(`Skipping ${taskId}/${runIndex}: Branch not merged.`);
         continue;
       }
    }

    console.log(`Removing ${taskId}/${runIndex}...`);
    await Runs.destroyRun(runId);
  }
  
  await deepSweep();
  console.log("Sweep complete.");
}

// AI! move to service and break into shorter functions if needed
async function deepSweep() {
  console.log("Performing deep sweep of Docker resources...");
  
  // 1. Collect active project names from worktrees
  const activeProjects = new Set<string>();
  const worktreesDir = WORKTREES_DIR();
  
  if (await exists(worktreesDir)) {
    for await (const entry of Deno.readDir(worktreesDir)) {
      if (!entry.isDirectory) continue;
      // We accept any directory starting with hb- as a valid project to preserve
      if (entry.name.startsWith("hb-")) {
        activeProjects.add(entry.name);
      }
    }
  }

  // 2. Scan for orphaned containers
  const containers = await Docker.findContainersByPartialName("hb-");
  for (const name of containers) {
    let isOrphan = true;
    for (const project of activeProjects) {
      if (name.startsWith(project)) {
        isOrphan = false;
        break;
      }
    }

    if (isOrphan) {
      console.log(`Removing orphaned container: ${name}`);
      await Docker.removeContainer(name, true);
    }
  }

  // 3. Scan for orphaned networks
  const networks = await Docker.findNetworksByPartialName("hb-");
  for (const name of networks) {
    let isOrphan = true;
    for (const project of activeProjects) {
      if (name.startsWith(project)) {
        isOrphan = false;
        break;
      }
    }

    if (isOrphan) {
       console.log(`Removing orphaned network: ${name}`);
       await Docker.removeNetwork(name);
    }
  }
}

//AI: implement
async function listCandidates(args: Args) {
  // Logic to list candidates based on same criteria as sweep
  // Simplified for brevity, reuse sweep logic or iterate similar to sweep
  console.log("Listing candidates (implied by sweep logic)...");
  // ... (Can be implemented similarly to sweep but just printing)
}

//AI! move to service
async function removeTask(taskId: string, force: boolean) {
  console.log(`Analyzing task ${taskId}...`);
  
  const taskExists = await checkTaskExists(taskId);
  const runs = await Runs.listRuns(taskId); // Returns RunInfo[]

  if (!taskExists && runs.length === 0) {
    console.log(`Task ${taskId} not found.`);
    return;
  }

  if (!force) {
    const errors: string[] = [];
    for (const run of runs) {
       if (run.status.toLowerCase() === "running") {
           errors.push(`Run ${run.runId} is active.`);
       }
       // Check unmerged
       const baseBranch = await Git.resolveBaseBranch(taskId);
       const unmerged = await Git.getUnmergedCommits(run.branchName, baseBranch);
       if (unmerged.trim().length > 0) {
           errors.push(`Run ${run.runId} has unmerged commits.`);
       }
    }

    if (errors.length > 0) {
      console.error("Cannot remove task due to unsafe runs:");
      errors.forEach(e => console.error(`- ${e}`));
      console.error("Use --force to override.");
      throw new Error("Aborted due to unsafe runs");
    }
  }

  console.log(`Removing task ${taskId} and ${runs.length} runs...`);
  
  for (const run of runs) {
      await Runs.destroyRun(run.branchName); 
  }

  if (taskExists) {
      await Tasks.remove(taskId);
      console.log(`Removed task: ${taskId}`);
  }

  const imageTag = `hyperbranch-run:${taskId}`;
  try {
    await Docker.removeImage(imageTag, force);
  } catch {}
  
  console.log(`✅ Task ${taskId} removed.`);
}
