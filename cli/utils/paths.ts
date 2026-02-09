import { join } from "@std/path";

export const HYPERBRANCH_DIR = ".hyperbranch";
export const WORKTREES_DIR_NAME = ".worktrees";
export const TASKS_DIR_NAME = "tasks";

// Absolute paths for file system operations
export const WORKTREES_DIR = (cwd = Deno.cwd()) => join(cwd, HYPERBRANCH_DIR, WORKTREES_DIR_NAME);
export const TASKS_DIR = (cwd = Deno.cwd()) => join(cwd, HYPERBRANCH_DIR, TASKS_DIR_NAME);

// Git paths (forward slash, relative) for filtering ls-files
export const GIT_WORKTREES_PATH = `${HYPERBRANCH_DIR}/${WORKTREES_DIR_NAME}`;
export const GIT_LEGACY_WORKTREES_PATH = `${HYPERBRANCH_DIR}/worktrees`;

export const RUN_DIR_NAME = ".current-run";

/**
 * Returns the directory where run-specific files (Dockerfile, run.sh, logs) are stored within a worktree.
 * @param worktreePath The root path of the worktree
 */
export function getRunDir(worktreePath: string): string {
  return join(worktreePath, HYPERBRANCH_DIR, RUN_DIR_NAME);
}
