import * as Tasks from "../services/tasks.ts";
import * as Runs from "../services/runs.ts";
import * as Cleanup from "../services/cleanup.ts";
import { TaskId, RunId, parseTaskOrRunId, stripHbPrefix } from "../utils/id.ts";
import { command, boolean, restPositionals, string, option } from "cmd-ts";

export const rmCmd = command({
  name: "rm",
  description: "Remove tasks or runs",
  args: {
    sweep: option({ type: boolean, long: "sweep", defaultValue: () => false }),
    force: option({ type: boolean, long: "force", short: "f", defaultValue: () => false }),
    targets: restPositionals({ type: string, displayName: "targets" }),
  },
  handler: async ({ sweep, force, targets: rawTargets }) => {
    const targets = rawTargets.map(stripHbPrefix);

    if (sweep) {
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
      process.exit(1);
    }
  },
});
