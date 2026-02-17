export const HB_PREFIX = "hb"

/**
 * Removes the hb/ prefix from a task or run ID if present.
 * @param id The ID to strip
 */
export function stripHbPrefix(id: string): string {
  if (id.startsWith(`${HB_PREFIX}/`)) {
    return id.slice(HB_PREFIX.length + 1);
  }
  return id;
}

/**
 * Returns the git branch name for a given task ID.
 * @param taskId The ID of the task
 */
export function getTaskBranchName(taskId: string): string {
  return `${HB_PREFIX}/${taskId}`;
}

/**
 * Returns the prefix for run branches associated with a task.
 * @param taskId The ID of the task
 */
export function getRunBranchPrefix(taskId: string): string {
  return `${getTaskBranchName(taskId)}/`;
}
export function getRunBranchName(taskId: string, runIndex: number): string {
  return `${getRunBranchPrefix(taskId)}${runIndex}`;
}

export function splitRunBranchName(branchName: string): { taskId: string; runIndex: number } | null {
  const prefix = `${HB_PREFIX}/`;
  if (!branchName.startsWith(prefix))
	return null;
  const match = branchName.slice(prefix.length).match(/^(.+)\/(\d+)$/)
  if (!match)
	return null;
  const [, taskId, runIndexStr] = match;
  const runIndex = parseInt(runIndexStr, 10);
  if (isNaN(runIndex))
	return null;
  return { taskId, runIndex };
}

/**
 * Parses the run number from a branch name.
 * Expected format: hb/<taskId>/<index>
 * @param branchName The full branch name
 * @returns The run index or null if parsing fails
 */
export function parseRunNumber(branchName: string): number | null {
  // Matches digits at the end of the string
  const match = branchName.match(/\/(\d+)$/);
  if (match) {
    const idx = parseInt(match[1], 10);
    return isNaN(idx) ? null : idx;
  }
  return null;
}
