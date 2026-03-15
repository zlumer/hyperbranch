import * as Runs from "../services/runs.ts";
import { RunId } from "../utils/id.ts";
import { z } from "zod"
import { parseZodArgs } from "../utils/zod.ts";
import { Args } from "@std/cli/parse-args";

const MergeArgsSchema = z.object({
  _: z.array(z.union([z.string(), z.number()])).transform((arr) => arr.map(String)),
  strategy: z.enum(["merge", "squash", "ff"]).optional().default("ff"),
  cleanup: z.union([z.boolean(), z.stringbool()]).optional().default(false),
})

export async function mergeCommand(rawArgs: Args) {
  const args = parseZodArgs(MergeArgsSchema, rawArgs);
  const runId = RunId.fromTaskIdAndRunIdx(args._[1], args._[2]);

  if (!runId) {
    console.error("Error: Task ID and Run Index are required.");
    console.error("Usage: hb merge <task-id>/<run-index> [--strategy <merge|squash|ff>] [--cleanup]");
    Deno.exit(1);
  }

  const strategy = args.strategy;
  const cleanup = args.cleanup

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
