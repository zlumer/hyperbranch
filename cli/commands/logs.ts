
import { Args } from "@std/cli/parse-args";
import { exists } from "@std/fs/exists";
import * as Runs from "../services/runs.ts";

export async function logsCommand(args: Args) {
  const taskId = args._[1] as string;
  const runArg = args._[2];

  if (!taskId) {
    console.error("Error: Task ID is required.");
    console.error("Usage: hb logs <task-id> [run-index]");
    Deno.exit(1);
  }

  let runIndex: number | undefined;
  if (runArg) {
      runIndex = parseInt(String(runArg), 10);
      if (isNaN(runIndex)) {
        console.error(`Invalid run index: ${runArg}`);
        Deno.exit(1);
      }
  }

  try {
      const logFile = await Runs.getLogsPath(taskId, runIndex);
      
      if (!(await exists(logFile))) {
          console.error(`Log file not found at ${logFile}`);
          console.error("The task might not have started yet or failed early.");
          Deno.exit(1);
      }

      console.log(`Tailing logs from ${logFile}...`);
      
      // Use tail -f
      const cmd = new Deno.Command("tail", {
          args: ["-f", "-n", "100", logFile],
          stdout: "inherit",
          stderr: "inherit"
      });
      
      const process = cmd.spawn();
      
      // Handle signals to exit cleanly
      Deno.addSignalListener("SIGINT", () => {
          try {
             process.kill();
          } catch {
             // ignore if already dead
          }
          Deno.exit(0);
      });

      await process.status;

  } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      Deno.exit(1);
  }
}
