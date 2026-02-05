/**
 * Returns the git branch name for a given task ID.
 * @param taskId The ID of the task
 */
export function getTaskBranchName(taskId: string): string {
  return `task/${taskId}`;
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

/**
 * Parses the run number from a branch name.
 * Expected format: task/<taskId>/<index>
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
