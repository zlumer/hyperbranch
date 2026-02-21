import { git } from "./git.ts";
import { splitRunBranchName } from "./branch-naming.ts";
import { exists } from "@std/fs/exists";

export async function createClone(
  branch: string,
  base: string,
  clonePath: string,
  mainRepoPath?: string,
): Promise<void> {
  const cwd = mainRepoPath || Deno.cwd();

  // a) create the branch in the main repo: `git branch <branch> <base>`
  await git(["branch", branch, base], cwd);

  // b) clone using relative path: `git clone -b <branch> --single-branch --depth 1 . <clonePath>`
  await git(
    ["clone", "-b", branch, "--single-branch", "--depth", "1", ".", clonePath],
    cwd,
  );

  // c) add a remote to the main repo pointing to the clone: `git remote add hb-<task>-<run> <clonePath>`
  const branchInfo = splitRunBranchName(branch);
  if (!branchInfo) {
    throw new Error(`Invalid branch name format for clone: ${branch}`);
  }
  const { taskId, runIndex } = branchInfo;
  const remoteName = `hb-${taskId}-${runIndex}`;

  await git(["remote", "add", remoteName, clonePath], cwd);
}

export async function removeClone(
  clonePath: string,
  branch: string,
  force = false,
  mainRepoPath?: string,
): Promise<void> {
  const cwd = mainRepoPath || Deno.cwd();

  // a) Try to remove the directory Deno.remove(clonePath, { recursive: true })
  if (await exists(clonePath)) {
    try {
      await Deno.remove(clonePath, { recursive: true });
    } catch (e: unknown) {
      if (!force) throw e;
    }
  }

  // b) Remove the remote from the main repo: `git remote remove hb-<task>-<run>`. Ignore errors if remote is already gone.
  const branchInfo = splitRunBranchName(branch);
  if (branchInfo) {
    const { taskId, runIndex } = branchInfo;
    const remoteName = `hb-${taskId}-${runIndex}`;
    try {
      await git(["remote", "remove", remoteName], cwd);
    } catch {
      // Ignore errors if remote is already gone
    }
  }
}

export async function status(clonePath: string): Promise<boolean> {
  try {
    const output = await git(["status", "--porcelain"], clonePath);
    return output.trim().length > 0;
  } catch {
    return true;
  }
}
