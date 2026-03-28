import * as Tasks from "../services/tasks.js";
import { TaskStatus } from "../types.js";
import { TaskId } from "../utils/id.js";
import { command, string, option, positional } from "cmd-ts";

export const moveCmd = command({
  name: "move",
  description: "Move a task to a different status",
  args: {
    fromStatus: option({ type: string, long: "from-status", defaultValue: () => "" }),
    taskIdRaw: positional({ type: string, displayName: "task-id" }),
    target: positional({ type: string, displayName: "status" }),
  },
  handler: async ({ fromStatus, taskIdRaw, target }) => {
    const taskId = TaskId.from(taskIdRaw);

    const VALID_STATUSES = ["todo", "plan", "build", "review", "done", "cancelled"];

    if (!taskId || !target) {
      console.error("Error: Task ID and Target Status are required.");
      console.error(`Usage: hb move [--from-status <old-status>] <task-id> <status>`);
      console.error(`Valid statuses: ${VALID_STATUSES.join("|")}`);
      process.exit(1);
    }

    try {
      const task = await Tasks.get(taskId);

      if (fromStatus) {
        if (task.frontmatter.status !== fromStatus) {
          console.error(`Error: Race condition guarded. Expected status '${fromStatus}' but found '${task.frontmatter.status}'.`);
          process.exit(1);
        }
      }

      if (VALID_STATUSES.includes(target)) {
        // Status Update
        const newStatus = target as TaskStatus;
        if (task.frontmatter.status !== newStatus) {
          const old = task.frontmatter.status;
          await Tasks.update(taskId, { status: newStatus });
          console.log(`Task ${taskId} moved: ${old} -> ${newStatus}`);
        } else {
          console.log(`Task ${taskId} is already in status ${newStatus}`);
        }
      } else {
        console.error(`Error: Invalid target status '${target}'. Valid statuses are: ${VALID_STATUSES.join(", ")}`);
        process.exit(1);
      }
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  },
});
