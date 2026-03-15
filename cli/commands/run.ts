import { Args } from "@std/cli/parse-args";
import * as Runs from "../services/runs.ts";
import { parseArgsString } from "../utils/args.ts";
import { TaskId } from "../utils/id.ts";
import { z } from "zod";
import { parseZodArgs } from "../utils/zod.ts";

const RunArgsSchema = z.object({
  _: z.array(z.union([z.string(), z.number()])).transform((arr) => arr.map(String)),
  image: z.string().optional(),
  dockerfile: z.string().optional(),
  commit: z.boolean().optional(),
  exec: z.string().optional(),
  "exec-file": z.string().optional(),
})

export async function runCommand(rawArgs: Args) {
  const args = parseZodArgs(RunArgsSchema, rawArgs);
  const taskId = TaskId.from(args._[1])
  
  if (!taskId) {
    console.error("Error: Task ID is required.");
    console.error("Usage: hb run <task-id> [options]");
    Deno.exit(1);
  }

  const options: Runs.RunOptions & { commit?: boolean } = {
    image: args.image,
    dockerfile: args.dockerfile,
    commit: args.commit,
    // dockerArgs: (args["docker-args"] as string)?.split(" ").filter(Boolean), // Not supported in Compose mode easily
  };

  if (args.exec) {
    options.exec = parseArgsString(args.exec);
  } else if (args["exec-file"]) {
    const file = args["exec-file"];
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
