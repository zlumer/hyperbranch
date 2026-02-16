import { Args } from "@std/cli/parse-args";
import * as Git from "../utils/git.ts";
import * as Runs from "../services/runs.ts";
import { getRunBranchName, splitRunBranchName } from "../utils/branch-naming.ts";

export async function logsCommand(args: Args) {
  const taskId = args._[1] as string;
  const runArg = args._[2];

  if (!taskId) {
    console.error("Error: Task ID is required.");
    console.error("Usage: hb logs <task-id> <run-index>");
    Deno.exit(1);
  }

  let runId: string;

  // Check if the first argument is already a full run ID (e.g. hb/task/1)
  const runInfo = splitRunBranchName(taskId);

  if (runInfo) {
    runId = taskId;
  } else if (runArg) {
    const runIndex = parseInt(String(runArg), 10);
    if (isNaN(runIndex)) {
      console.error(`Invalid run index: ${runArg}`);
      Deno.exit(1);
    }
    runId = getRunBranchName(taskId, runIndex);
  } else {
    // Determine latest run
    const latest = await Git.getLatestRunBranch(taskId);
    if (!latest) {
        console.error(`No runs found for task '${taskId}'`);
        Deno.exit(1);
    }
    runId = latest;
  }

  const follow = args.f || args.follow;
  
  try {
      console.log(`Streaming logs for run ${runId} ${follow ? "(follow)" : ""}...`);
      
      const process = await Runs.getLogsStream(runId, follow);
      
      // Handle signals to exit cleanly
      Deno.addSignalListener("SIGINT", () => {
          try {
             process.kill();
          } catch {
             // ignore if already dead
          }
          Deno.exit(0);
      });

      const status = await process.status;
      
      if (!status.success) {
          // Docker logs might fail if the container is already removed
          // But usually it exits with 0 if stream ends.
          // If it exits with non-zero, it means error (e.g. No such container)
          console.error("Log stream exited with non-zero status.");
          Deno.exit(status.code);
      }

  } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      Deno.exit(1);
  }
}
