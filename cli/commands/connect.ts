import { detectDependencyCycle, detectParentCycle } from "../utils/cycles.js";
import { loadTask, checkTaskExists, saveTask } from "../utils/loadTask.js";
import { TaskId } from "../utils/id.js";
import { command, string, option, positional } from "cmd-ts";

export const connectCmd = command({
  name: "connect",
  description: "Connect a task to a parent or dependency",
  args: {
    dependsOnRaw: option({ type: string, long: "depends-on", defaultValue: () => "" }),
    childOfRaw: option({ type: string, long: "child-of", defaultValue: () => "" }),
    taskIdRaw: positional({ type: string, displayName: "task-id" }),
  },
  handler: async ({ dependsOnRaw, childOfRaw, taskIdRaw }) => {
    const taskId = taskIdRaw ? TaskId.from(taskIdRaw) : undefined;
    const dependsOn = dependsOnRaw ? TaskId.from(dependsOnRaw) : undefined;
    const childOf = childOfRaw ? TaskId.from(childOfRaw) : undefined;

    if (!taskId) {
      console.error("Error: Target task ID is required.");
      console.error("Usage: hb connect [--depends-on <id>] [--child-of <id>] <task-id>");
      process.exit(1);
    }

    if (!dependsOn && !childOf) {
      console.error("Error: Must specify either --depends-on or --child-of.");
      process.exit(1);
    }

    const task = await loadTask(taskId.id);
    let updated = false;

    if (dependsOn) {
      if (!(await checkTaskExists(dependsOn.id))) {
        console.error(`Error: Dependency task ${dependsOn} does not exist.`);
        process.exit(1);
      }

      // Check cycle
      try {
        await detectDependencyCycle(taskId.id, dependsOn.id);
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }

      if (!task.frontmatter.dependencies.includes(dependsOn.id)) {
        task.frontmatter.dependencies.push(dependsOn.id);
        updated = true;
        console.log(`Added dependency: ${dependsOn}`);
      } else {
        console.log(`Dependency ${dependsOn} already exists.`);
      }
    }

    if (childOf) {
      if (!(await checkTaskExists(childOf.id))) {
        console.error(`Error: Parent task ${childOf} does not exist.`);
        process.exit(1);
      }

      // Check cycle
      try {
        await detectParentCycle(taskId.id, childOf.id);
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }

      if (task.frontmatter.parent !== childOf.id) {
        task.frontmatter.parent = childOf.id;
        updated = true;
        console.log(`Set parent: ${childOf}`);
      } else {
        console.log(`Parent is already ${childOf}`);
      }
    }

    if (updated) {
      await saveTask(task);
    }
  },
});
