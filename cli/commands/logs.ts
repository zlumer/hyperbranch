
import { Args } from "@std/cli/parse-args";
import { exists } from "@std/fs/exists";
import { join } from "@std/path";
import * as RunsUtils from "../utils/runs.ts";

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
      const runDir = await RunsUtils.getRunDir(taskId, runIndex);
      const cidPath = join(runDir, "hb.cid");

      if (!(await exists(cidPath))) {
          console.error(`Container ID file not found at ${cidPath}`);
          console.error("The task might not have started yet, or the run directory is missing.");
          Deno.exit(1);
      }

      const cid = (await Deno.readTextFile(cidPath)).trim();
      
      if (!cid) {
          console.error("Container ID file is empty.");
          Deno.exit(1);
      }

      const follow = args.f || args.follow;
      const dockerArgs = ["logs"];
      if (follow) {
          dockerArgs.push("-f");
          console.log(`Streaming logs from container ${cid} (follow mode)...`);
      } else {
          console.log(`Fetching logs from container ${cid}...`);
      }
      dockerArgs.push(cid);

      const cmd = new Deno.Command("docker", {
          args: dockerArgs,
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

      const status = await process.status;
      
      if (!status.success) {
          // Docker logs might fail if the container is already removed
          // But usually it exits with 0 if stream ends.
          // If it exits with non-zero, it means error (e.g. No such container)
          console.error("Process exited with non-zero status.");
          console.error("The container might have been cleaned up if the task finished.");
          Deno.exit(status.code);
      }

  } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      Deno.exit(1);
  }
}
