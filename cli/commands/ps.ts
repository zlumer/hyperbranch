
import * as Tasks from "../services/tasks.ts";
import * as Runs from "../services/runs.ts";

export async function psCommand() {
  const tasks = await Tasks.list();

  if (tasks.length === 0) {
    console.log("No tasks found.");
    return;
  }

  // Header
  console.log(
    "ID".padEnd(20) +
    "STATUS".padEnd(12) +
    "RUNNING".padEnd(12) +
    "TITLE"
  );
  console.log("-".repeat(80));

  for (const task of tasks) {
    const runStatus = await Runs.getStatus(task.id);
    
    const titleMatch = task.body.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "(No Title)";

    console.log(
      task.id.padEnd(20) +
      task.frontmatter.status.padEnd(12) +
      runStatus.padEnd(12) +
      title
    );
  }
}
