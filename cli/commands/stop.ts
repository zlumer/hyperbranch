import { Args } from "@std/cli/parse-args";
import * as Runs from "../services/runs.ts";
import { parseTaskOrRunId, RunId } from "../utils/id.ts";

export async function stopCommand(args: Args) {
  const params = parseTaskOrRunId(args._[1] as string, args._[2])

  if (!params) {
    console.error("Error: Missing or invalid Task ID: " + args._[1]);
    console.error("Usage: hb stop <task-id> [run-index]");
    Deno.exit(1);
  }

  const runId = RunId.from(params)
  if (!runId) {
	console.error("Error: Invalid Run Index. " + args._[2]);
	console.error("Usage: hb stop <task-id> [run-index]");
	Deno.exit(1);
  }

  try {
    console.log(`Stopping run ${runId}...`);
    await Runs.stopRun(runId);
    console.log("✅ Run stopped.");
  } catch (e) {
    console.error(`❌ Failed to stop run:`);
    console.error(e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  }
}
