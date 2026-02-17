import { Args } from "@std/cli/parse-args";
import * as Runs from "../services/runs.ts";
import * as Git from "../utils/git.ts";
import { getRunBranchName, stripHbPrefix } from "../utils/branch-naming.ts";

export async function stopCommand(args: Args) {
  const taskId = stripHbPrefix(args._[1] as string);
  const runArg = args._[2];

  if (!taskId) {
    console.error("Error: Task ID is required.");
    console.error("Usage: hb stop <task-id> [run-index]");
    Deno.exit(1);
  }

  let runId: string;
  if (runArg) {
    const runIndex = parseInt(String(runArg), 10);
    if (isNaN(runIndex)) {
      console.error(`Invalid run index: ${runArg}`);
      Deno.exit(1);
    }
    runId = getRunBranchName(taskId, runIndex);
  } else {
    const latest = await Runs.getLatestRunId(taskId);
    if (!latest) {
      console.error(`No runs found for task '${taskId}'`);
      Deno.exit(1);
    }
    runId = latest;
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
