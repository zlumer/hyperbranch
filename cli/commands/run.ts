import { Args } from "@std/cli/parse-args";
import * as Runs from "../services/runs.ts";
import { parseArgsString } from "../utils/args.ts";

export async function runCommand(args: Args) {
  const taskId = args._[1] as string;
  if (!taskId) {
    console.error("Error: Task ID is required.");
    console.error("Usage: hb run <task-id> [options]");
    Deno.exit(1);
  }

  const options: Runs.RunOptions = {
    image: args["image"] as string,
    dockerfile: args["dockerfile"] as string,
    dockerArgs: (args["docker-args"] as string)?.split(" ").filter(Boolean),
  };

  if (args["exec"]) {
    options.exec = parseArgsString(args["exec"] as string);
  } else if (args["exec-file"]) {
    const file = args["exec-file"] as string;
    options.exec = ["./" + file];
  }

  try {
    const { runId } = await Runs.run(taskId, options);
    
    // Runs.run already logs success messages
    console.log(`Run ID: ${runId}`);
    
    // Attempt to show where logs are
    try {
        const logsPath = await Runs.getLogsPath(taskId);
        console.log(`Logs available in: ${logsPath}`);
    } catch {
        // Ignore if we can't find logs path immediately
    }
    
    console.log(`Use 'hb logs ${taskId}' to view output.`);

  } catch (e) {
    // Runs.run already logs error details to console.error?
    // Looking at Runs.run implementation:
    // console.error(`\n❌ Execution Failed:`);
    // console.error(e instanceof Error ? e.message : String(e));
    // throw e;
    
    // So we just need to exit.
    Deno.exit(1);
  }
}
