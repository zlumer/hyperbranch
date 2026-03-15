import { Args } from "@std/cli/parse-args";
import * as Runs from "../services/runs.ts";
import { RunId } from "../utils/id.ts";

export async function portCommand(args: Args) {
  const run = RunId.fromString(args._[1] as string)
  const portStr = args._[2] as string;

  if (!run || !portStr) {
    console.error("Error: Run ID and Port are required.");
    console.error("Usage: hb port <run-id> <port>");
    Deno.exit(1);
  }

  const port = parseInt(portStr, 10);
  if (isNaN(port)) {
    console.error(`Error: Invalid port number: ${portStr}`);
    Deno.exit(1);
  }

  try {
    const hostPort = await Runs.getHostPort(run, port);
    console.log(hostPort);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  }
}
