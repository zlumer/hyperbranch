import { TaskFile, TaskFrontmatter } from "../types.ts"
import { generateTaskId, getTaskPath, scanTasks } from "../utils/tasks.ts"
import { checkTaskExists, loadTask, saveTask } from "../utils/loadTask.ts"
import { add, commit } from "../utils/git.ts"
import * as Git from "../utils/git.ts"
import * as Docker from "../utils/docker.ts"
import * as Runs from "./runs.ts"

/**
 * Create a new task.
 * Handles ID generation, file creation, and git commit.
 */
export async function create(title: string, parentId?: string): Promise<TaskFile> {
  if (parentId) {
    const parentExists = await checkTaskExists(parentId)
    if (!parentExists) {
      throw new Error(`Parent task ${parentId} does not exist.`)
    }
  }

  const id = generateTaskId()
  const taskPath = getTaskPath(id)

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
  }

  await saveTask(task)

  return task
}

/**
 * List all tasks.
 * Scans the tasks directory and parses all task files.
 */
export async function list(): Promise<TaskFile[]> {
  const taskIds = await scanTasks()
  const tasks: TaskFile[] = []

  for (const id of taskIds) {
    try {
      const task = await get(id)
      tasks.push(task)
    } catch (error) {
      console.warn(`Failed to load task ${id}:`, error)
    }
  }

  return tasks
}

/**
 * Get a specific task by ID.
 */
export async function get(id: string): Promise<TaskFile> {
  return await loadTask(id)
}

/**
 * Update a task.
 * Modifies frontmatter/content and saves the file.
 */
export async function update(id: string, updates: Partial<TaskFile['frontmatter']> & { body?: string }): Promise<void> {
  const task = await loadTask(id)
  
  const { body, ...frontmatterUpdates } = updates

  if (body !== undefined) {
    task.body = body
  }

  Object.assign(task.frontmatter, frontmatterUpdates)

  await saveTask(task)
}

/**
 * Delete a task file and associated resources.
 */
export async function remove(id: string, force = false): Promise<void> {
  console.log(`Analyzing task ${id}...`);
  
  const taskExists = await checkTaskExists(id);
  const runs = await Runs.listRuns(id);

  if (!taskExists && runs.length === 0) {
    console.log(`Task ${id} not found.`);
    return;
  }

  if (!force) {
    const errors: string[] = [];
    for (const run of runs) {
       if (run.status.toLowerCase() === "running") {
           errors.push(`Run ${run.runId} is active.`);
       }
       // Check unmerged
       const baseBranch = await Git.resolveBaseBranch(id);
       const unmerged = await Git.getUnmergedCommits(run.branchName, baseBranch);
       if (unmerged.trim().length > 0) {
           errors.push(`Run ${run.runId} has unmerged commits.`);
       }
    }

    if (errors.length > 0) {
      console.error("Cannot remove task due to unsafe runs:");
      errors.forEach((e) => console.error(`- ${e}`));
      console.error("Use --force to override.");
      throw new Error("Aborted due to unsafe runs");
    }
  }

  console.log(`Removing task ${id} and ${runs.length} runs...`);
  
  for (const run of runs) {
      await Runs.destroyRun(run.branchName); 
  }

  if (taskExists) {
      const path = getTaskPath(id);
      await Deno.remove(path);
      console.log(`Removed task: ${id}`);
  }

  const imageTag = `hyperbranch-run:${id}`;
  try {
    await Docker.removeImage(imageTag, force);
  } catch {}
  
  console.log(`✅ Task ${id} removed.`);
}
