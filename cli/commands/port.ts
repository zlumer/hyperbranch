import { Args } from "@std/cli/parse-args";
import * as Runs from "../services/runs.ts";
import { stripHbPrefix } from "../utils/branch-naming.ts";

export async function portCommand(args: Args) {
  let runId = args._[1] as string;
  const portStr = args._[2] as string;

  if (!runId || !portStr) {
    console.error("Error: Run ID and Port are required.");
    console.error("Usage: hb port <run-id> <port>");
    Deno.exit(1);
  }

  const port = parseInt(portStr, 10);
  if (isNaN(port)) {
    console.error(`Error: Invalid port number: ${portStr}`);
    Deno.exit(1);
  }

  // Normalize runId if needed (e.g. if user passes without hb/ prefix)
  // But wait, the service expects hb/ prefix because parseRunId expects it.
  // stripHbPrefix removes it.
  // We want to ADD it if missing?
  // Or should we support "task-id/run-index" without hb/?
  // If runId is "task-1/1", parseRunId fails.
  // If runId is "hb/task-1/1", parseRunId works.
  
  if (!runId.startsWith("hb/")) {
    runId = "hb/" + runId;
  }

  try {
    const hostPort = await Runs.getHostPort(runId, port);
    console.log(hostPort);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  }
}
