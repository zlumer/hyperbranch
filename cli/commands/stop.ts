import { Args } from "@std/cli/parse-args";
import * as Runs from "../services/runs.ts";
import { parseTaskOrRunId, RunId } from "../utils/id.ts";
import { z } from "zod";
import { parseZodArgs } from "../utils/zod.ts";

const StopArgsSchema = z.object({
  _: z.array(z.union([z.string(), z.number()])).transform((arr) => arr.map(String)),
})

export async function stopCommand(rawArgs: Args) {
  const args = parseZodArgs(StopArgsSchema, rawArgs);
  const params = parseTaskOrRunId(args._[1], args._[2])

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
