export type RunState =
  | "unknown"    // No trace of the run found
  | "initial"    // User wants to create it (conceptual state, not derived from disk)
  | "preparing"  // Git branch/worktree exists, container missing
  | "starting"   // Container created/starting
  | "working"    // Container running
  | "completed"  // Container exited (0) or signaled completion
  | "failed"     // Container exited (non-0)
  | "merged"     // Merged but not cleaned up
  | "finished";  // Cleanup done, summary exists

export interface RunContext {
  taskId: string;
  runIndex: number;
  branchName: string;
  worktreePath: string;
  dockerProjectName: string;
  summaryPath: string; // Path to the summary file (persisted)
  paths: {
    runDir: string;
    composeFile: string;
    envFile: string;
    entrypoint: string;
    dockerfile: string;
  };
}
