import { join, resolve } from "@std/path";
import { exists } from "@std/fs/exists";
import { getLatestRunBranch } from "./git.ts";
import { getRunBranchName } from "./branch-naming.ts";
import { WORKTREES_DIR, getRunDir as getRunDirFromWorktree } from "./paths.ts";

export async function getRunBranch(taskId: string, runIndex?: number): Promise<string> {
  if (runIndex !== undefined) {
    return getRunBranchName(taskId, runIndex);
  }
  const latest = await getLatestRunBranch(taskId);
  if (!latest) {
    throw new Error(`No runs found for task ${taskId}`);
  }
  return latest;
}

export async function getRunDir(taskId: string, runIndex?: number): Promise<string> {
  const branch = await getRunBranch(taskId, runIndex);
  // Replicate logic to match how worktree paths are constructed
  const safeBranchName = branch.replace(/\//g, "-");
  const worktreePath = resolve(
      WORKTREES_DIR(),
      safeBranchName,
  );
  return getRunDirFromWorktree(worktreePath);
}

export async function getContainerId(taskId: string): Promise<string | null> {
    try {
        const runDir = await getRunDir(taskId); // Gets latest by default
        const cidFile = join(runDir, "hb.cid");
        
        if (!(await exists(cidFile))) {
             return null;
        }
        
        const cid = (await Deno.readTextFile(cidFile)).trim();
        return cid || null;
    } catch {
        return null;
    }
}

export async function getLogsPath(taskId: string, runIndex?: number): Promise<string> {
    const runDir = await getRunDir(taskId, runIndex);
    return join(runDir, "docker.log");
}
