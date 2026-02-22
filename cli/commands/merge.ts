import * as Runs from "../services/runs.ts";
import { stripHbPrefix, getRunBranchName } from "../utils/branch-naming.ts";

export async function mergeCommand(args: any) {
  const taskId = stripHbPrefix(args._[1] as string);
  const runIndexStr = args._[2] as string;

  if (!taskId || !runIndexStr) {
    console.error("Error: Task ID and Run Index are required.");
    console.error("Usage: hb merge <task-id> <run-index> [--strategy <merge|squash|rebase>] [--cleanup]");
    Deno.exit(1);
  }

  const runIndex = parseInt(runIndexStr, 10);
  if (isNaN(runIndex)) {
    console.error(`Error: Invalid run index '${runIndexStr}'`);
    Deno.exit(1);
  }

  const runId = getRunBranchName(taskId, runIndex);
  const strategy = (args.strategy as "merge" | "squash" | "rebase") || "rebase";
  const cleanup = args.cleanup || false;

  try {
    console.log(`Merging run ${runId} using strategy '${strategy}'...`);
    await Runs.mergeRun(taskId, runId, strategy, cleanup);
    console.log("✅ Merge successful.");
  } catch (error: any) {
    console.error(`❌ Merge failed: ${error.message}`);
    Deno.exit(1);
  }
}
