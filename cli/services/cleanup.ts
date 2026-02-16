import { join } from "@std/path";
import { exists } from "@std/fs/exists";
import * as Git from "../utils/git.ts";
import * as GitWorktree from "../utils/git-worktree.ts";
import * as Docker from "../utils/docker.ts";
import * as Runs from "./runs.ts";
import { WORKTREES_DIR } from "../utils/paths.ts";
import { getRunBranchName } from "../utils/branch-naming.ts";

export async function sweep() {
  const worktreesDir = WORKTREES_DIR();
  if (!(await exists(worktreesDir))) {
    console.log("No worktrees found.");
    return;
  }

  console.log("Sweeping worktrees...");

  for await (const entry of Deno.readDir(worktreesDir)) {
    if (!entry.isDirectory) continue;
    
    // Expect hb-<taskId>-<runIndex>
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

export async function deepSweep() {
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

export async function listCandidates() {
  const worktreesDir = WORKTREES_DIR();
  if (!(await exists(worktreesDir))) {
    console.log("No worktrees found.");
    return;
  }

  console.log("Candidates for removal (sweep):");
  let found = false;

  for await (const entry of Deno.readDir(worktreesDir)) {
    if (!entry.isDirectory)
      continue

    const candidate = await checkDir(entry.name, worktreesDir)
    if (!candidate)
      continue
    
    console.log(`- ${candidate.taskId}/${candidate.runIndex}`);
    found = true;
  }

  if (!found) {
    console.log("No candidates found.");
  } else {
    console.log("\nRun 'hb rm --sweep' to remove these items.");
  }
}

async function checkDir(dir: string, worktreesDir: string): Promise<{ taskId: string, runIndex: number } | undefined> {
  const match = dir.match(/^hb-(.+)-(\d+)$/);
  if (!match)
    return undefined

  const taskId = match[1];
  const runIndex = parseInt(match[2], 10);
  const runId = getRunBranchName(taskId, runIndex);

  // Check Active
  const status = await Runs.getStatus(runId);
  if (status.toLowerCase() === "running")
    return undefined

  // Check Dirty
  const worktreePath = join(worktreesDir, dir);
  const isDirty = await GitWorktree.status(worktreePath);
  if (isDirty)
    return undefined

  // Check Merged
  if (!await isMerged(runId, taskId))
    return undefined

  return { taskId, runIndex }
}

async function isMerged(runBranch: string, taskId: string) {
  if (!(await Git.branchExists(runBranch)))
    return false

  const baseBranch = await Git.resolveBaseBranch(taskId);
  return Git.isBranchMerged(runBranch, baseBranch);
}
