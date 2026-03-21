import { TaskFile, TaskFrontmatter, TaskStatus } from "../types.ts"
import { generateTaskId, getTaskPath, scanTasks } from "../utils/tasks.ts"
import { checkTaskExists, loadTask, saveTask } from "../utils/loadTask.ts"
import * as Git from "../utils/git.ts"
import * as Docker from "../utils/docker.ts"
import * as Runs from "./runs.ts"
import { TaskId } from "../utils/id.ts";

/**
 * Create a new task.
 * Handles ID generation, file creation, and git commit.
 */
export async function create(title: string, parentId?: string, description?: string, status?: string): Promise<TaskFile> {
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
      status: (status as TaskStatus) || "todo",
      parent: parentId || null,
      dependencies: [],
    },
    body: `# ${title}\n\n${description || ""}`,
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
  
  const tasks = await Promise.all(
    taskIds.map(async (id) => {
      try {
        return await get(id)
      } catch (error) {
        console.warn(`Failed to load task ${id}:`, error)
        return null
      }
    })
  )

  return tasks.filter((t): t is TaskFile => t !== null)
}

/**
 * Get a specific task by ID.
 */
export async function get(taskId: TaskId): Promise<TaskFile> {
  const task = await loadTask(taskId.id)
  task.runsCount = await Runs.getRunCount(taskId)
  return task
}

/**
 * Update a task.
 * Modifies frontmatter/content and saves the file.
 */
export async function update(task: TaskId, updates: Partial<TaskFile['frontmatter']> & { body?: string }): Promise<void> {
  const taskFile = await loadTask(task.id)
  
  const { body, ...frontmatterUpdates } = updates

  if (body !== undefined) {
    taskFile.body = body
  }

  for (const [key, value] of Object.entries(frontmatterUpdates)) {
    if (value !== undefined) {
      // @ts-ignore: dynamically updating frontmatter
      taskFile.frontmatter[key as keyof TaskFrontmatter] = value
    }
  }

  await saveTask(taskFile)
}

/**
 * Delete a task file and associated resources.
 */
export async function remove(task: TaskId, force = false): Promise<void> {
  console.log(`Analyzing task ${task}...`);
  
  const taskExists = await checkTaskExists(task.id);
  const runs = await Runs.listRuns(task);

  if (!taskExists && runs.length === 0) {
    console.log(`Task ${task} not found.`);
    return;
  }

  if (!force) {
    const errors: string[] = [];
    for (const run of runs) {
       if (run.status.toLowerCase() === "running") {
           errors.push(`Run ${run.runId} is active.`);
       }
       // Check unmerged
       const baseBranch = await Git.resolveBaseBranch(task);
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

  console.log(`Removing task ${task} and ${runs.length} runs...`);
  
  for (const run of runs) {
      await Runs.destroyRun(run.runId); 
  }

  if (taskExists) {
      const path = getTaskPath(task.id);
      await Deno.remove(path);
      console.log(`Removed task: ${task}`);
  }

  const imageTag = `hyperbranch-run:${task.id}`;
  try {
    await Docker.removeImage(imageTag, force);
  } catch {}
  
  console.log(`✅ Task ${task} removed.`);
}
