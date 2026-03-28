import * as Runs from "../services/runs.js";
import { parseTaskOrRunId, RunId } from "../utils/id.js";
import { command, string, restPositionals } from "cmd-ts";

export const stopCmd = command({
  name: "stop",
  description: "Stop a task run",
  args: {
    args: restPositionals({ type: string, displayName: "args" }),
  },
  handler: async ({ args }) => {
    const params = parseTaskOrRunId(args[0], args[1]);

    if (!params) {
      console.error("Error: Missing or invalid Task ID: " + args[0]);
      console.error("Usage: hb stop <task-id> [run-index]");
      process.exit(1);
    }

    const runId = RunId.from(params);
    if (!runId) {
      console.error("Error: Invalid Run Index. " + args[1]);
      console.error("Usage: hb stop <task-id> [run-index]");
      process.exit(1);
    }

    try {
      console.log(`Stopping run ${runId}...`);
      await Runs.stopRun(runId);
      console.log("✅ Run stopped.");
    } catch (e) {
      console.error(`❌ Failed to stop run:`);
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  },
});
