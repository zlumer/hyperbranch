import { git } from "./git.js";
import { access, rm } from "node:fs/promises";
import { RunId } from "./id.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function createClone(
  branch: string,
  base: string,
  clonePath: string,
  mainRepoPath?: string,
): Promise<void> {
  const cwd = mainRepoPath || process.cwd();

  // a) create the branch in the main repo: `git branch <branch> <base>`
  await git(["branch", branch, base], cwd);

  // b) clone using relative path: `git clone -b <branch> --single-branch --depth 1 . <clonePath>`
  await git(
    ["clone", "-b", branch, "--single-branch", "--depth", "1", ".", clonePath],
    cwd,
  );

  // c) add a remote to the main repo pointing to the clone: `git remote add hb-<task>-<run> <clonePath>`
  const branchInfo = RunId.fromString(branch)
  if (!branchInfo) {
    throw new Error(`Invalid branch name format for clone: ${branch}`);
  }
//   const { taskId, runIndex } = branchInfo;
  const remoteDir = branchInfo.toDirectorySlug()

  await git(["remote", "add", remoteDir, clonePath], cwd);
}

export async function removeClone(
  clonePath: string,
  branch: string,
  force = false,
  mainRepoPath?: string,
): Promise<void> {
  const cwd = mainRepoPath || process.cwd();

  // a) Try to remove the directory
  if (await exists(clonePath)) {
    try {
      await rm(clonePath, { recursive: true, force: true });
    } catch (e: unknown) {
      if (!force) throw e;
    }
  }

  // b) Remove the remote from the main repo
  const branchInfo = RunId.fromString(branch);
  if (branchInfo) {
    const remoteName = branchInfo.toDirectorySlug();
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
