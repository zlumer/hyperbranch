import { RunId } from "../utils/id.ts"

export type RunState =
  | "unknown"    // No trace of the run found
  | "initial"    // User wants to create it (conceptual state, not derived from disk)
  | "preparing"  // Git branch/clone exists, container missing
  | "starting"   // Container created/starting
  | "working"    // Container running
  | "paused"     // Container exists but is paused/exited
  | "stopped"    // Container missing but artifacts exist
  | "completed"  // Container exited (0) or signaled completion
  | "failed"     // Container exited (non-0)
  | "merged"     // Merged but not cleaned up
  | "finished";  // Cleanup done, summary exists

export interface RunContext {
  runId: RunId;
  branchName: string;
  clonePath: string;
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
