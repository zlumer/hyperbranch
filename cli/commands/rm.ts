import { Args } from "@std/cli/parse-args";
import { resolve, join } from "@std/path";
import { exists } from "@std/fs/exists";
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
  
  // 1. Identify all runs
  const prefix = getRunBranchPrefix(taskId);
  let branches: string[] = [];
  try {
    const output = await Git.git(["branch", "--list", `${prefix}*`]);
    branches = output.split("\n")
      .map(b => b.trim().replace(/^[\*\+]\s+/, ""))
      .filter(Boolean);
  } catch {
    // No branches found
  }

  // 2. Safety Checks (Atomic)
  if (!force) {
    const errors: string[] = [];
    
    // Check Runs
    for (const branch of branches) {
       // branch: task/<id>/<idx>
       const idxStr = branch.split("/").pop();
       if (!idxStr) continue;
       
       const safeBranchName = branch.replace(/\//g, "-");
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
                   errors.push(`Run ${idxStr} is active.`);
                 }
               }
             } catch {}
          }
       }
       
       // Check Dirty
       try {
         const baseBranch = await Git.resolveBaseBranch(taskId);
         const unmerged = await Git.getUnmergedCommits(branch, baseBranch);
         if (unmerged.trim().length > 0) {
           errors.push(`Run ${idxStr} has unmerged commits.`);
         }
       } catch {}
    }

    if (errors.length > 0) {
      console.error("Cannot remove task due to unsafe runs:");
      errors.forEach(e => console.error(`- ${e}`));
      console.error("Use --force to override.");
      throw new Error("Aborted due to unsafe runs");
    }
  }

  // 3. Execution
  console.log(`Removing task ${taskId} and ${branches.length} runs...`);
  
  // Remove runs
  for (const branch of branches) {
      const idxStr = branch.split("/").pop();
      if (!idxStr) continue;
      const idx = parseInt(idxStr, 10);
      
      await removeRun(taskId, idx, true); 
  }

  // Remove Task File
  // REPLACED: Use Tasks.remove(id)
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

async function removeRun(taskId: string, runIndex: number, force: boolean) {
  const runBranch = getRunBranchName(taskId, runIndex);
  const safeBranchName = runBranch.replace(/\//g, "-");
  const worktreePath = resolve(WORKTREES_DIR(), safeBranchName);

  // 1. Check existence
  if (!(await exists(worktreePath))) {
    if (!force) {
       console.warn(`Warning: Worktree not found at ${worktreePath}`);
       // We proceed to check branch/git status, but can't check local container ID
    }
  }

  const cidFile = join(getRunDir(worktreePath), "hb.cid");
  let cid = "";
  if (await exists(cidFile)) {
    try {
      cid = (await Deno.readTextFile(cidFile)).trim();
    } catch {}
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
         // Warning logged below? Or just ignore validation error and proceed to cleanup?
      }
    }

    // B. Check Git Cleanliness
    try {
      // We need to know what the base branch was. 
      // If we can't find it, we can't verify merge status.
      // resolveBaseBranch guesses based on parent.
      const baseBranch = await Git.resolveBaseBranch(taskId);
      const unmerged = await Git.getUnmergedCommits(runBranch, baseBranch);
      if (unmerged.trim().length > 0) {
        throw new Error(`Run has unmerged commits:\n${unmerged}\nUse --force to delete anyway.`);
      }
    } catch (e) {
       // If branch lookup fails, it's unsafe to delete
       if (e instanceof Error && e.message.includes("Run has unmerged commits")) throw e;
       // If branch doesn't exist, we can't delete it anyway (will fail later), so it's safe to proceed.
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
    await Git.deleteBranch(runBranch, force);
  } catch (e) {
    console.error(`Failed to delete branch ${runBranch}: ${e}`);
    if (!force) throw new Error("Failed to delete branch");
  }

  console.log("✅ Run removed.");
}
