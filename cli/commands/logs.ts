import * as Git from "../utils/git.js";
import * as Runs from "../services/runs.js";
import { RunId, TaskId } from "../utils/id.js";
import { command, boolean, restPositionals, string, flag } from "cmd-ts";

export const logsCmd = command({
  name: "logs",
  description: "View logs for a task run",
  args: {
    follow: flag({ type: boolean, long: "follow", short: "f", defaultValue: () => false }),
    args: restPositionals({ type: string, displayName: "args" }),
  },
  handler: async ({ follow, args }) => {
    const taskArg = args[0];
    const runArg = args[1];

    if (!taskArg) {
      console.error("Error: Task ID is required.");
      console.error("Usage: hb logs <task-id>/<run-index>");
      process.exit(1);
    }

    const task = TaskId.from(taskArg);
    let run: RunId | null | undefined = RunId.fromTaskIdAndRunIdx(taskArg, runArg);

    if (!task) {
      console.error("Error: Task ID is required.");
      console.error("Usage: hb logs <task-id>/<run-index>");
      process.exit(1);
    }

    if (!run) {
      console.log(`No run index provided. Fetching latest run for task '${task}'...`);
      run = await Git.getLatestRunBranch(task);
      if (!run) {
        console.error(`No runs found for task '${task}'`);
        process.exit(1);
      }
      console.log(`Latest run found: ${run}`);
    }

    try {
      console.log(`Streaming logs for run ${run} ${follow ? "(follow)" : ""}...`);

      const logProcess = await Runs.getLogsStream(run, follow);

      // Handle signals to exit cleanly
      process.on("SIGINT", () => {
        try {
          if (typeof logProcess.kill === "function") {
            logProcess.kill();
          }
        } catch {
          // ignore if already dead
        }
        process.exit(0);
      });

      const status = await logProcess.status;

      if (!status.success) {
        console.error("Log stream exited with non-zero status.");
        process.exit(status.code);
      }

    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  },
});
