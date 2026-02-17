import { Args } from "@std/cli/parse-args";
import * as Runs from "../services/runs.ts";
import { parseArgsString } from "../utils/args.ts";
import { stripHbPrefix } from "../utils/branch-naming.ts";

export async function runCommand(args: Args) {
  const taskId = stripHbPrefix(args._[1] as string);
  if (!taskId) {
    console.error("Error: Task ID is required.");
    console.error("Usage: hb run <task-id> [options]");
    Deno.exit(1);
  }

  const options: Runs.RunOptions = {
    image: args["image"] as string,
    dockerfile: args["dockerfile"] as string,
    // dockerArgs: (args["docker-args"] as string)?.split(" ").filter(Boolean), // Not supported in Compose mode easily
  };

  if (args["exec"]) {
    options.exec = parseArgsString(args["exec"] as string);
  } else if (args["exec-file"]) {
    const file = args["exec-file"] as string;
    options.exec = ["./" + file];
  }

  try {
    const { runId, port } = await Runs.run(taskId, options);
    
    console.log(`Run Started: ${runId}`);
    if (port > 0) {
      console.log(`Access URL: http://localhost:${port}`);
    }
    
    console.log(`Use 'hb logs ${runId}' to view output.`);

  } catch (e) {
    console.error(`\n❌ Execution Failed:`);
    console.error(e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  }
}
