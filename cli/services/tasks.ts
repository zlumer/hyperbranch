
import { join, basename } from "@std/path";
import { exists } from "@std/fs/exists";
import { TaskFile, TaskFrontmatter, TaskStatus } from "../types.ts";
import { TASKS_DIR, getTaskPath, generateTaskId } from "../utils/tasks.ts";
import { loadTask, saveTask, checkTaskExists } from "../utils/loadTask.ts";
import { add, commit } from "./git.ts";

/**
 * Create a new task.
 * Handles ID generation, file creation, and git commit.
 */
export async function create(title: string, parentId?: string): Promise<TaskFile> {
  if (parentId) {
    const parentExists = await checkTaskExists(parentId);
    if (!parentExists) {
      throw new Error(`Parent task ${parentId} does not exist.`);
    }
  }

  const id = generateTaskId();
  const taskPath = getTaskPath(id);

  const task: TaskFile = {
    id,
    path: taskPath,
    frontmatter: {
      id,
      status: "todo",
      parent: parentId || null,
      dependencies: [],
    },
    body: `# ${title}\n\n`,
  };

  await saveTask(task);
  await add([task.path]);
  await commit(`chore: create task ${id}`, [task.path]);

  return task;
}

/**
 * List all tasks.
 * Scans the tasks directory and parses all task files.
 */
export async function list(): Promise<TaskFile[]> {
  const tasksDir = TASKS_DIR();
  if (!(await exists(tasksDir))) {
    return [];
  }

  const tasks: TaskFile[] = [];

  for await (const entry of Deno.readDir(tasksDir)) {
    if (entry.isFile && entry.name.startsWith("task-") && entry.name.endsWith(".md")) {
      // Extract ID from filename: task-<id>.md
      const idMatch = entry.name.match(/^task-(.+)\.md$/);
      if (idMatch) {
        const id = idMatch[1];
        try {
          const task = await get(id);
          tasks.push(task);
        } catch (error) {
          console.warn(`Failed to load task ${id}:`, error);
        }
      }
    }
  }

  return tasks;
}

/**
 * Get a specific task by ID.
 */
export async function get(id: string): Promise<TaskFile> {
  // loadTask already handles existence check and parsing, but exits on failure.
  // We want to throw instead of exit.
  // Since loadTask calls Deno.exit(1), we might need to implement our own loading logic
  // to adhere to the "Replace Deno.exit() with standard throw new Error(...)" requirement.
  
  // Checking implementation of loadTask:
  // It calls Deno.exit(1) if not found or if parsing fails.
  // So strictly speaking, using loadTask violates the requirement of the service function throwing Error.
  // I should re-implement load logic here to be safe and compliant.
  
  const path = getTaskPath(id);
  if (!(await exists(path))) {
    throw new Error(`Task ${id} not found at ${path}`);
  }

  const content = await Deno.readTextFile(path);
  const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);

  if (!match) {
    throw new Error(`Task ${id} is malformed: missing frontmatter at ${path}`);
  }

  const rawYaml = match[1];
  const body = match[2];

  try {
    // Dynamic import for yaml parsing to match project style if needed, 
    // but utils/loadTask.ts uses named imports.
    const { parse } = await import("@std/yaml");
    const frontmatter = parse(rawYaml) as TaskFrontmatter;
    return { id, path, frontmatter, body };
  } catch (e) {
    throw new Error(`Error parsing YAML for task ${id}: ${e}`);
  }
}

/**
 * Update a task.
 * Modifies frontmatter/content and saves the file.
 */
export async function update(id: string, updates: Partial<TaskFile['frontmatter']> & { body?: string }): Promise<void> {
  const task = await get(id);
  
  // Separate body update from frontmatter updates
  const { body, ...frontmatterUpdates } = updates;

  if (body !== undefined) {
    task.body = body;
  }

  // Apply frontmatter updates
  Object.assign(task.frontmatter, frontmatterUpdates);

  // Re-implement save logic to avoid dependency on utils that might change
  // and to ensure consistency.
  const { stringify } = await import("@std/yaml");
  const yaml = stringify(task.frontmatter);
  const content = `---\n${yaml}---\n${task.body}`;
  
  await Deno.writeTextFile(task.path, content);
}

/**
 * Delete a task file.
 */
export async function delete_task(id: string): Promise<void> {
  const path = getTaskPath(id);
  if (await exists(path)) {
    await Deno.remove(path);
  } else {
     // Optional: throw if not found? 
     // Usually delete is idempotent, so if it's gone, it's fine.
     // But strictly, if the user asked to delete X and X doesn't exist, maybe warn?
     // I'll leave it as idempotent success.
  }
}

// Alias delete_task to delete since delete is a reserved word? 
// Actually 'delete' is a reserved word in JS/TS.
// So I should name it 'remove' or use 'delete' as a property name if exporting an object.
// But the requirement said: "delete(id: string): Promise<void>".
// In a module export, `export function delete` is invalid.
// I will export it as `remove` and maybe alias it in import if needed, 
// or export a `Service` object. 
// "It must be a functional module with exported functions"
// I'll name it `remove` as `delete` is a reserved keyword.
export { delete_task as remove };
