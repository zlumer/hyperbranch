import { Args } from "@std/cli/parse-args";
import { parseZodArgs } from "../utils/zod.ts";
import { z } from "zod";
import { RunId } from "../utils/id.ts";
import { syncRun } from "../services/sync-run.ts";

const SyncArgsSchema = z.object({
  _: z.array(z.union([z.string(), z.number()])).transform((arr) => arr.map(String)),
});

export async function syncCommand(rawArgs: Args) {
  const args = parseZodArgs(SyncArgsSchema, rawArgs);
  const runIdStr = args._[1];
  
  if (!runIdStr) {
    console.error("Error: Run ID is required.");
    console.error("Usage: hb sync <task-id>/<run-index>");
    Deno.exit(1);
  }

  const runId = RunId.fromString(runIdStr);
  if (!runId) {
    console.error(`Error: Invalid run ID format '${runIdStr}'. Expected format: task-id/run-index`);
    Deno.exit(1);
  }

  try {
    console.log(`Starting sync for run ${runId.toString()}...`);
    await syncRun(runId);
    console.log(`✅ Sync completed or smart merge session started successfully.`);
  } catch (e) {
    console.error(`\n❌ Sync Failed:`);
    console.error(e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  }
}
