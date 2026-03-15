import * as Runs from "../services/runs.ts";
import { RunId } from "../utils/id.ts";
import { z } from "zod"

export async function mergeCommand(args: any) {
  const runId = RunId.fromTaskIdAndRunIdx(args._[1] as string, args._[2] as string);

  if (!runId) {
    console.error("Error: Task ID and Run Index are required.");
    console.error("Usage: hb merge <task-id>/<run-index> [--strategy <merge|squash|ff>] [--cleanup]");
    Deno.exit(1);
  }

  const strategy = (args.strategy as "merge" | "squash" | "ff") || "ff";
  const cleanup = z.stringbool().safeParse(args.cleanup).data || false;

  try {
    console.log(`Merging run ${runId} using strategy '${strategy}'...`);
    const { cleanupSkipped } = await Runs.mergeRun(runId, strategy, cleanup);
    console.log("✅ Merge successful.");
    if (cleanupSkipped) {
      console.log("⚠️ Cleanup skipped: Run has uncommitted changes.");
    }
  } catch (error: any) {
    console.error(`❌ Merge failed: ${error.message}`);
    Deno.exit(1);
  }
}
