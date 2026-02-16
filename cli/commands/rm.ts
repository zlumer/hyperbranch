import { Args } from "@std/cli/parse-args";
import * as Tasks from "../services/tasks.ts";
import * as Runs from "../services/runs.ts";
import * as Cleanup from "../services/cleanup.ts";

export async function rmCommand(args: Args) {
  const targets = args._.slice(1).map(String);
  const force = args.force || args.f || false;

  if (args.sweep) {
    if (force) {
      console.warn("Warning: --force is ignored when using --sweep. Use specific targets to force removal.");
    }
    await Cleanup.sweep();
    return;
  }

  if (targets.length === 0) {
    await Cleanup.listCandidates();
    return;
  }

  let hasError = false;

  for (const target of targets) {
    try {
      const runMatch = target.match(/^([a-zA-Z0-9-]+)\/(\d+)$/);
      if (runMatch) {
        const taskId = runMatch[1];
        const runIndex = parseInt(runMatch[2], 10);
        await Runs.removeRun(taskId, runIndex, force);
        continue;
      }

      const taskMatch = target.match(/^([a-zA-Z0-9-]+)$/);
      if (taskMatch) {
        await Tasks.remove(taskMatch[1], force);
        continue;
      }

      console.error(`Invalid target format: ${target}`);
      hasError = true;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      hasError = true;
    }
  }

  if (hasError) {
    Deno.exit(1);
  }
}
