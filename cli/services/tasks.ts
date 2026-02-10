import { TaskFile, TaskFrontmatter } from "../types.ts";
import { generateTaskId, getTaskPath, scanTasks } from "../utils/tasks.ts";
import { checkTaskExists, loadTask, saveTask } from "../utils/loadTask.ts";
import { add, commit } from "../utils/git.ts";

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
  
  try {
    await add([task.path]);
    await commit(`chore: create task ${id}`, [task.path]);
  } catch (error) {
    // If git fails, we might want to clean up the file or just warn.
    // For now, we'll let the error propagate but the file is created.
    // Or maybe we should delete the file?
    // Let's propagate as it's a "service" and caller should handle.
    console.error("Failed to commit task creation:", error);
    throw error;
  }

  return task;
}

/**
 * List all tasks.
 * Scans the tasks directory and parses all task files.
 */
export async function list(): Promise<TaskFile[]> {
  const taskIds = await scanTasks();
  const tasks: TaskFile[] = [];

  for (const id of taskIds) {
    try {
      const task = await get(id);
      tasks.push(task);
    } catch (error) {
      console.warn(`Failed to load task ${id}:`, error);
    }
  }

  return tasks;
}

/**
 * Get a specific task by ID.
 */
export async function get(id: string): Promise<TaskFile> {
  return await loadTask(id);
}

/**
 * Update a task.
 * Modifies frontmatter/content and saves the file.
 */
export async function update(id: string, updates: Partial<TaskFile['frontmatter']> & { body?: string }): Promise<void> {
  const task = await loadTask(id);
  
  const { body, ...frontmatterUpdates } = updates;

  if (body !== undefined) {
    task.body = body;
  }

  Object.assign(task.frontmatter, frontmatterUpdates);

  await saveTask(task);
}

/**
 * Delete a task file.
 */
export async function remove(id: string): Promise<void> {
  const path = getTaskPath(id);
  // We use Deno.remove directly as per previous behavior, 
  // but we could use git rm if we wanted to be consistent with create.
  // Given instructions don't explicitly ask for git rm in remove, 
  // but do ask to import git utils in general for the file,
  // I'll stick to simple removal to match previous behavior 
  // unless I receive a specific error or requirement.
  
  // Actually, let's check if the file exists first to avoid error if already gone?
  // loadTask/checkTaskExists can help.
  if (await checkTaskExists(id)) {
      await Deno.remove(path);
  }
}
