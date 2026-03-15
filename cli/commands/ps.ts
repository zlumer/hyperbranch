import * as Tasks from "../services/tasks.ts";
import * as Runs from "../services/runs.ts";
import { TaskId } from "../utils/id.ts";

export async function psCommand() {
  const tasks = await Tasks.list();

  if (tasks.length === 0) {
    console.log("No tasks found.");
    return;
  }

  // Header
  console.log(
    "ID".padEnd(25) +
    "STATUS".padEnd(12) +
    "RUNNING".padEnd(12) +
    "TITLE"
  );
  console.log("-".repeat(85));

  let hasRuns = false;

  for (const task of tasks) {
    const titleMatch = task.body.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "(No Title)";

	const taskId = TaskId.from(task.id)
	if (!taskId) continue;

    const runs = await Runs.listRuns(taskId);
    if (runs.length === 0) continue;
    
    hasRuns = true;

    for (const run of runs) {
      console.log(
        run.runId.toString().padEnd(25) +
        task.frontmatter.status.padEnd(12) +
        run.status.padEnd(12) +
        title
      );
    }
  }

  if (!hasRuns) {
    console.log("No active runs found.");
  }
}
