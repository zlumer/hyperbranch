import * as Tasks from "../services/tasks.ts";
import { execa } from "execa";
import { command, string, option, boolean, restPositionals } from "cmd-ts";

export const createCmd = command({
  name: "create",
  description: "Create a new task",
  args: {
    parent: option({ type: string, long: "parent", short: "p", defaultValue: () => "" }),
    edit: option({ type: boolean, long: "edit", defaultValue: () => false }),
    titleParts: restPositionals({ type: string, displayName: "Task Title" }),
  },
  handler: async ({ parent, edit, titleParts }) => {
    const parentId = parent || undefined;

    if (titleParts.length === 0) {
      console.error("Error: Task title is required.");
      console.error('Usage: hb create [--parent <id>] [--edit] "Task Title"');
      process.exit(1);
    }
    const title = titleParts.join(" ");

    try {
      const task = await Tasks.create(title, parentId);

      console.log(`Task created: ${task.id}`);
      console.log(`Path: ${task.path}`);

      if (edit) {
        const editor = process.env.EDITOR || "vim";
        await execa(editor, [task.path], { stdio: "inherit" });
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  },
});
