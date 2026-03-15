import { Args } from "@std/cli/parse-args";
import * as Runs from "../services/runs.ts";
import { RunId } from "../utils/id.ts";
import { z } from "zod";
import { parseZodArgs } from "../utils/zod.ts";

const PortArgsSchema = z.object({
  _: z.array(z.union([z.string(), z.number()])).transform((arr) => arr.map(String)),
})

export async function portCommand(rawArgs: Args) {
  const args = parseZodArgs(PortArgsSchema, rawArgs);
  const portStr = args._[2];
  const run = RunId.fromString(args._[1]);

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
