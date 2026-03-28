import { RunId } from "../utils/id.js";
import { syncRun } from "../services/sync-run.js";
import { command, string, positional } from "cmd-ts";

export const syncCmd = command({
  name: "sync",
  description: "Sync a task run",
  args: {
    runIdStr: positional({ type: string, displayName: "run-id" }),
  },
  handler: async ({ runIdStr }) => {
    if (!runIdStr) {
      console.error("Error: Run ID is required.");
      console.error("Usage: hb sync <task-id>/<run-index>");
      process.exit(1);
    }

    const runId = RunId.fromString(runIdStr);
    if (!runId) {
      console.error(`Error: Invalid run ID format '${runIdStr}'. Expected format: task-id/run-index`);
      process.exit(1);
    }

    try {
      console.log(`Starting sync for run ${runId.toString()}...`);
      await syncRun(runId);
      console.log(`✅ Sync completed or smart merge session started successfully.`);
    } catch (e) {
      console.error(`\n❌ Sync Failed:`);
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  },
});
