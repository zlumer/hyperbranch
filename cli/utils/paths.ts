import { join } from "@std/path";

export const HYPERBRANCH_DIR = ".hyperbranch";
export const RUNS_DIR_NAME = ".runs";
export const TASKS_DIR_NAME = "tasks";

// Absolute paths for file system operations
export const RUNS_DIR = (cwd = Deno.cwd()) => Deno.env.get("HB_RUNS_DIR") || join(cwd, HYPERBRANCH_DIR, RUNS_DIR_NAME);
export const TASKS_DIR = (cwd = Deno.cwd()) => Deno.env.get("HB_TASKS_DIR") || join(cwd, HYPERBRANCH_DIR, TASKS_DIR_NAME);

// Git paths (forward slash, relative) for filtering ls-files
export const GIT_RUNS_PATH = `${HYPERBRANCH_DIR}/${RUNS_DIR_NAME}`;
export const GIT_LEGACY_WORKTREES_PATH = `${HYPERBRANCH_DIR}/worktrees`;

export const RUN_DIR_NAME = ".current-run";

/**
 * Returns the directory where run-specific files (Dockerfile, run.sh, logs) are stored within a clone.
 * @param clonePath The root path of the clone
 */
export function getRunDir(clonePath: string): string {
  return join(clonePath, HYPERBRANCH_DIR, RUN_DIR_NAME);
}
