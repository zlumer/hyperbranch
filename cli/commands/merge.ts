import * as Runs from "../services/runs.ts";
import { RunId } from "../utils/id.ts";
import { command, boolean, string, option, restPositionals } from "cmd-ts";

export const mergeCmd = command({
  name: "merge",
  description: "Merge a task run",
  args: {
    strategy: option({ type: string, long: "strategy", defaultValue: () => "ff" }),
    cleanup: option({ type: boolean, long: "cleanup", defaultValue: () => false }),
    args: restPositionals({ type: string, displayName: "args" }),
  },
  handler: async ({ strategy, cleanup, args }) => {
    const runId = RunId.fromTaskIdAndRunIdx(args[0], args[1]);

    if (!runId) {
      console.error("Error: Task ID and Run Index are required.");
      console.error("Usage: hb merge <task-id>/<run-index> [--strategy <merge|squash|ff>] [--cleanup]");
      process.exit(1);
    }

    const strat = strategy as "merge" | "squash" | "ff";

    try {
      console.log(`Merging run ${runId} using strategy '${strat}'...`);
      const { cleanupSkipped } = await Runs.mergeRun(runId, strat, cleanup);
      console.log("✅ Merge successful.");
      if (cleanupSkipped) {
        console.log("⚠️ Cleanup skipped: Run has uncommitted changes.");
      }
    } catch (error: any) {
      console.error(`❌ Merge failed: ${error.message}`);
      process.exit(1);
    }
  },
});
