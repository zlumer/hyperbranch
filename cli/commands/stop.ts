
import { Args } from "@std/cli/parse-args";
import * as Runs from "../services/runs.ts";

export async function stopCommand(args: Args) {
  const taskId = args._[1] as string;
  if (!taskId) {
    console.error("Error: Task ID is required.");
    console.error("Usage: hb stop <task-id>");
    Deno.exit(1);
  }

  try {
    console.log(`Stopping latest run for task ${taskId}...`);
    await Runs.stop(taskId);
    console.log("✅ Container stopped.");
  } catch (e) {
    console.error(`❌ Failed to stop container:`);
    console.error(e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  }
}
