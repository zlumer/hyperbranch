import * as Runs from "../services/runs.ts";
import { RunId } from "../utils/id.ts";
import { command, string, positional } from "cmd-ts";

export const portCmd = command({
  name: "port",
  description: "Get the host port for a run",
  args: {
    runArg: positional({ type: string, displayName: "run-id" }),
    portArg: positional({ type: string, displayName: "port" }),
  },
  handler: async ({ runArg, portArg }) => {
    const run = RunId.fromString(runArg);

    if (!run || !portArg) {
      console.error("Error: Run ID and Port are required.");
      console.error("Usage: hb port <run-id> <port>");
      process.exit(1);
    }

    const port = parseInt(portArg, 10);
    if (isNaN(port)) {
      console.error(`Error: Invalid port number: ${portArg}`);
      process.exit(1);
    }

    try {
      const hostPort = await Runs.getHostPort(run, port);
      console.log(hostPort);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  },
});
