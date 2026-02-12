import { Args } from "@std/cli/parse-args";
import { resolve, join } from "@std/path";
import { exists } from "@std/fs/exists";
import { checkTaskExists } from "../utils/loadTask.ts";
import * as Git from "../utils/git.ts";
import * as GitWorktree from "../utils/git-worktree.ts";
import * as Docker from "../utils/docker.ts";
import * as Tasks from "../services/tasks.ts";
import { WORKTREES_DIR, getRunDir } from "../utils/paths.ts";
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
      // Check for run format <task>/<run>
      // e.g. "task-1/1" or "abc/1"
      const runMatch = target.match(/^([a-zA-Z0-9-]+)\/(\d+)$/);
      if (runMatch) {
        const taskId = runMatch[1];
        const runIndex = parseInt(runMatch[2], 10);
        await removeRun(taskId, runIndex, force);
        continue;
      }

      // Check for task format <task>
      const taskMatch = target.match(/^([a-zA-Z0-9-]+)$/);
      if (taskMatch) {
        await removeTask(taskMatch[1], force);
        continue;
      }

      console.error(`Invalid target format: ${target}`);
      hasError = true;
    } catch (e) {
      if (e instanceof Error) {
        console.error(e.message);
      } else {
        console.error(String(e));
      }
      hasError = true;
    }
  }

  if (hasError) {
    Deno.exit(1);
  }
}

async function sweep() {
  const worktreesDir = WORKTREES_DIR();
  if (!(await exists(worktreesDir))) {
    console.log("No worktrees found.");
    return;
  }

  console.log("Sweeping worktrees...");

  for await (const entry of Deno.readDir(worktreesDir)) {
    if (!entry.isDirectory) continue;
    
    const match = entry.name.match(/^task-(.+)-(\d+)$/);
    if (!match) continue;

    const taskId = match[1];
    const runIndex = parseInt(match[2], 10);
    const worktreePath = join(worktreesDir, entry.name);
    const runBranch = getRunBranchName(taskId, runIndex);

    // Get CID
    const cidFile = join(getRunDir(worktreePath), "hb.cid");
    let cid: string | undefined;
    if (await exists(cidFile)) {
      try {
        const content = (await Deno.readTextFile(cidFile)).trim();
        if (content) cid = content;
      } catch {}
    }

    // 1. Check Running Container
    if (cid) {
      try {
        const { status } = await Docker.getContainerStatus(cid);
        if (status.toLowerCase() === "running") {
          console.log(`Skipping ${entry.name}: Container is running (use 'hb rm ${taskId}/${runIndex} -f' to override).`);
          continue;
        }
      } catch {}
    }

    // 2. Check Dirty Status
    // If dirty, skip
    const isDirty = await GitWorktree.status(worktreePath);
    if (isDirty) {
      console.log(`Skipping ${entry.name}: Worktree is dirty (use 'hb rm ${taskId}/${runIndex} -f' to override).`);
      continue;
    }

    // 3. Check Missing/Merged Branch
    let safeToRemove = false;
    const branchExists = await Git.branchExists(runBranch);

    if (!branchExists) {
      // Dangling worktree -> Unsafe?
      // Wait, if branch is missing, it's just a worktree. 
      // If we don't have force, we should be careful.
      // But typically a dangling worktree without branch is just garbage.
      // The original code said: "Dangling worktree -> Unsafe (require force)"
      // So we should skip it.
    } else {
       // 4. Check Merged Status
       const baseBranch = await Git.resolveBaseBranch(taskId);
       const isMerged = await Git.isBranchMerged(runBranch, baseBranch);
       if (isMerged) {
         safeToRemove = true;
       }
    }

    if (!safeToRemove) {
      const reason = !branchExists 
        ? `Branch ${runBranch} not found (dangling worktree)`
        : `Branch ${runBranch} is not merged`;
      console.log(`Skipping ${entry.name}: ${reason} (use 'hb rm ${taskId}/${runIndex} -f' to override).`);
      continue;
    }

    // Execution
    console.log(`Removing ${entry.name}...`);

    // Remove Container
    if (cid) {
      try {
         await Docker.removeContainer(cid, true);
      } catch (e) {
         // Ignore container removal errors
      }
    }

    // Remove Worktree
    try {
      await GitWorktree.removeWorktree(worktreePath, true);
    } catch (e) {
      console.warn(`Warning: Failed to remove worktree via git: ${e}`);
      try {
         await Deno.remove(worktreePath, { recursive: true });
         // Prune worktrees immediately to allow branch deletion
         await GitWorktree.pruneWorktrees(); 
      } catch {}
    }

    // Remove Branch
    if (branchExists) {
      try {
        await Git.deleteBranch(runBranch, true);
      } catch (e) {
        console.warn(`Warning: Failed to delete branch ${runBranch}: ${e}`);
      }
    }
  }
  
  // Prune Git Worktrees
  try {
     await GitWorktree.pruneWorktrees();
  } catch {}
  
  console.log("Sweep complete.");
}

async function listCandidates(args: Args) {
  const worktreesDir = WORKTREES_DIR();
  if (!(await exists(worktreesDir))) {
    console.log("No worktrees found.");
    return;
  }

  const candidates: string[] = [];

  for await (const entry of Deno.readDir(worktreesDir)) {
    if (!entry.isDirectory) continue;

    // Parse folder name: task-<id>-<idx>
    // e.g. task-123-1
    const match = entry.name.match(/^task-(.+)-(\d+)$/);
    if (!match) continue;

    const taskId = match[1];
    const runIndex = parseInt(match[2], 10);
    const worktreePath = join(worktreesDir, entry.name);
    const runBranch = getRunBranchName(taskId, runIndex);

    // 1. Check Active (Skip if active)
    let isActive = false;
    const cidFile = join(getRunDir(worktreePath), "hb.cid");
    if (await exists(cidFile)) {
      try {
        const cid = (await Deno.readTextFile(cidFile)).trim();
        if (cid) {
          const { status } = await Docker.getContainerStatus(cid);
          if (status.toLowerCase() === "running") {
            isActive = true;
          }
        }
      } catch {}
    }
    if (isActive) continue;

    // 2. Check Cleanliness (Skip if dirty)
    try {
       // We need base branch.
       // If we can't find it, assume dirty/unsafe?
       const baseBranch = await Git.resolveBaseBranch(taskId);
       const unmerged = await Git.getUnmergedCommits(runBranch, baseBranch);
       if (unmerged.trim().length > 0) {
         continue; // Dirty
       }
    } catch {
       continue; // Error checking -> assume unsafe
    }

    candidates.push(`${taskId}/${runIndex}`);
  }

  console.log("The following runs are clean and inactive (safe to remove):");
  for (const c of candidates) {
    console.log(c);
  }
  console.log("\nRun 'hb rm <task>/<run>' to remove specific runs.");
  console.log("Run 'hb rm --sweep' to remove all clean inactive runs.");
}

async function removeTask(taskId: string, force: boolean) {
  console.log(`Analyzing task ${taskId}...`);
  
  // 0. Check Existence
  const taskExists = await checkTaskExists(taskId);

  let runIndices = new Set<number>();

  // 1. Identify all runs from Branches
  runIndices = runIndices.union(await identifyBranchRuns(taskId))

  // 2. Identify all runs from Worktrees
  runIndices = runIndices.union(await identifyWorktreeRuns(taskId))

  // 3. Identify all runs from Containers
  runIndices = runIndices.union(await identifyContainerRuns(taskId))

  const uniqueIndices = Array.from(runIndices).sort((a, b) => a - b);

  if (!taskExists && uniqueIndices.length === 0) {
    console.log(`Task ${taskId} not found.`);
    return;
  }

  // 4. Safety Checks (Atomic)
  if (!force) {
    const errors: string[] = [];
    
    for (const idx of uniqueIndices) {
       const runErrors = await checkRunSafety(taskId, idx);
       errors.push(...runErrors);
    }

    if (errors.length > 0) {
      console.error("Cannot remove task due to unsafe runs:");
      errors.forEach(e => console.error(`- ${e}`));
      console.error("Use --force to override.");
      throw new Error("Aborted due to unsafe runs");
    }
  }

  // 5. Execution
  console.log(`Removing task ${taskId} and ${uniqueIndices.length} runs...`);
  
  // Remove runs
  for (const idx of uniqueIndices) {
      await removeRun(taskId, idx, true); 
  }

  // Remove Task File
  await Tasks.remove(taskId);
  console.log(`Removed task: ${taskId}`);

  // Remove Docker Image
  const imageTag = `hyperbranch-run:${taskId}`;
  try {
    await Docker.removeImage(imageTag, force);
  } catch (e) {
    // Ignore errors (image might not exist)
  }
  
  console.log(`✅ Task ${taskId} removed.`);
}

async function checkRunSafety(taskId: string, idx: number) {
  const errors: string[] = [];
  const runBranch = getRunBranchName(taskId, idx);
  const safeBranchName = runBranch.replace(/\//g, "-");
  const worktreePath = resolve(WORKTREES_DIR(), safeBranchName);

  if (await exists(worktreePath)) {
    // Check Active
    const cidFile = join(getRunDir(worktreePath), "hb.cid");
    if (await exists(cidFile)) {
      try {
        const cid = (await Deno.readTextFile(cidFile)).trim();
        if (cid) {
          const { status } = await Docker.getContainerStatus(cid);
          if (status.toLowerCase() === "running") {
            errors.push(`Run ${idx} is active.`);
          }
        }
      } catch { }
    }
  } else {
    // Check container by name if worktree missing?
    const containerName = `hb-${taskId}-${idx}`;
    if (await Docker.containerExists(containerName)) {
      const { status } = await Docker.getContainerStatus(containerName);
      if (status.toLowerCase() === "running") {
        errors.push(`Run ${idx} is active (orphan container).`);
      }
    }
  }

  // Check Dirty
  try {
    const baseBranch = await Git.resolveBaseBranch(taskId);
    // Only check if branch exists
    if (await Git.branchExists(runBranch)) {
      const unmerged = await Git.getUnmergedCommits(runBranch, baseBranch);
      if (unmerged.trim().length > 0) {
        errors.push(`Run ${idx} has unmerged commits.`);
      }
    }
  } catch { }
  return errors
}

async function identifyContainerRuns(taskId: string) {
  const runIndices = new Set<number>()
  const containers = await Docker.findContainersByPartialName(`hb-${taskId}-`);
  for (const name of containers) {
    const match = name.match(/^hb-(.+)-(\d+)$/);
    if (match && match[1] === taskId) {
      runIndices.add(parseInt(match[2], 10));
    }
  }
  return runIndices
}

async function identifyWorktreeRuns(taskId: string) {
  const runIndices = new Set<number>()
  const worktreesDir = WORKTREES_DIR();
  if (await exists(worktreesDir)) {
    for await (const entry of Deno.readDir(worktreesDir)) {
      if (!entry.isDirectory) continue;
      const match = entry.name.match(/^task-(.+)-(\d+)$/);
      if (match && match[1] === taskId) {
        runIndices.add(parseInt(match[2], 10));
      }
    }
  }
  return runIndices
}

async function identifyBranchRuns(taskId: string) {
  const runIndices = new Set<number>()
  const prefix = getRunBranchPrefix(taskId);
  try {
    const output = await Git.git(["branch", "--list", `${prefix}*`]);
    output.split("\n")
      .map(b => b.trim().replace(/^[\*\+]\s+/, ""))
      .filter(Boolean)
      .forEach(b => {
        const idxStr = b.split("/").pop();
        if (idxStr) runIndices.add(parseInt(idxStr, 10));
      });
  } catch {
    // No branches found
  }
  return runIndices
}

async function removeRun(taskId: string, runIndex: number, force: boolean) {
  const runBranch = getRunBranchName(taskId, runIndex);
  const safeBranchName = runBranch.replace(/\//g, "-");
  const worktreePath = resolve(WORKTREES_DIR(), safeBranchName);
  const containerName = `hb-${taskId}-${runIndex}`;

  // 0. Check Existence
  const worktreeExists = await exists(worktreePath);
  const branchExists = await Git.branchExists(runBranch);
  const containerExists = await Docker.containerExists(containerName);

  if (!worktreeExists && !branchExists && !containerExists) {
    console.log(`Run ${taskId}/${runIndex} not found.`);
    return;
  }

  // 1. Check existence
  if (!worktreeExists && !containerExists) {
    if (!force) {
       console.warn(`Warning: Worktree not found at ${worktreePath}`);
       // We proceed to check branch/git status
    }
  }

  // Try to get CID from file first
  let cid = await getCidFromWorktree(worktreePath, worktreeExists, "");
  
  // If no CID from file, but container exists by name, use name as CID (commands support name too)
  if (!cid && containerExists) {
    cid = containerName;
  }

  // 2. Safety Checks (skip if force)
  if (!force) {
    // A. Check Active
    if (cid) {
      try {
        const { status } = await Docker.getContainerStatus(cid);
        if (status.toLowerCase() === "running") {
          throw new Error(`Run is currently active (Container ${cid.substring(0,8)} is ${status}). Use --force to remove.`);
        }
      } catch (e) {
         if (e instanceof Error && e.message.includes("Run is currently active")) throw e;
      }
    }

    // B. Check Git Cleanliness
    try {
      if (branchExists) {
          const baseBranch = await Git.resolveBaseBranch(taskId);
          const unmerged = await Git.getUnmergedCommits(runBranch, baseBranch);
          if (unmerged.trim().length > 0) {
            throw new Error(`Run has unmerged commits:\n${unmerged}\nUse --force to delete anyway.`);
          }
      }
    } catch (e) {
       if (e instanceof Error && e.message.includes("Run has unmerged commits")) throw e;
    }
  }

  // 3. Execution
  console.log(`Removing run ${taskId}/${runIndex}...`);

  // Remove Container
  if (cid) {
    try {
       await Docker.removeContainer(cid, force);
    } catch (e) {
       console.warn(`Warning: Failed to remove container ${cid}: ${e}`);
    }
  }

  try {
    if (await exists(worktreePath)) {
      await GitWorktree.removeWorktree(worktreePath, force);
    }
  } catch (e) {
    if (!force) throw e;
    console.error(`Failed to remove worktree: ${e}`);
    console.log("Attempting to force delete directory...");
    await Deno.remove(worktreePath, { recursive: true });
    // Prune worktrees immediately to allow branch deletion
    await GitWorktree.pruneWorktrees();
  }

  try {
    if (branchExists) {
        await Git.deleteBranch(runBranch, force);
    }
  } catch (e) {
    console.error(`Failed to delete branch ${runBranch}: ${e}`);
    if (!force) throw new Error("Failed to delete branch");
  }

  console.log("✅ Run removed.");
}

async function getCidFromWorktree(worktreePath: string, worktreeExists: boolean, cid: string) {
  const cidFile = join(getRunDir(worktreePath), "hb.cid");
  if (worktreeExists && await exists(cidFile)) {
    try {
      cid = (await Deno.readTextFile(cidFile)).trim();
    } catch { }
  }
  return cid;
}
