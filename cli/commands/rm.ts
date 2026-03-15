import { Args } from "@std/cli/parse-args";
import * as Tasks from "../services/tasks.ts";
import * as Runs from "../services/runs.ts";
import * as Cleanup from "../services/cleanup.ts";
import { TaskId, RunId, parseTaskOrRunId, stripHbPrefix } from "../utils/id.ts";
import { z } from "zod";
import { parseZodArgs } from "../utils/zod.ts";

const RmArgsSchema = z.object({
  _: z.array(z.union([z.string(), z.number()])).transform((arr) => arr.map(String)),
  sweep: z.boolean().optional(),
  force: z.boolean().optional(),
  f: z.boolean().optional(),
})

export async function rmCommand(rawArgs: Args) {
  const args = parseZodArgs(RmArgsSchema, rawArgs);
  const targets = args._.slice(1).map(stripHbPrefix);
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
      const parsed = parseTaskOrRunId(target);
      if (parsed) {
        if (parsed.hasRunIndex && parsed.runIndex !== undefined) {
          const runId = RunId.from(parsed);
          if (runId) {
            await Runs.removeRun(runId, force);
            continue;
          }
        }
        const taskId = TaskId.from(parsed.taskId);
        if (taskId) {
          await Tasks.remove(taskId, force);
          continue;
        }
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
