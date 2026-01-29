#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env

import { parseArgs } from "jsr:@std/cli/parse-args";
import { parse as parseYaml, stringify as stringifyYaml } from "jsr:@std/yaml";
import { join, dirname } from "jsr:@std/path";
import { ensureDir, exists } from "jsr:@std/fs";

// --- Configuration ---
const TASKS_DIR = join(Deno.cwd(), ".hyperbranch/tasks");

// --- Types ---
type TaskStatus = "todo" | "in_progress" | "review" | "done" | "cancelled";

interface TaskFrontmatter {
  id: string;
  status: TaskStatus;
  parent: string | null;
  dependencies: string[];
  [key: string]: unknown;
}

interface TaskFile {
  id: string;
  path: string;
  frontmatter: TaskFrontmatter;
  body: string;
}

// --- ID Generation ---
function generateTaskId(): string {
  const now = Date.now();
  // 0-9 random
  const rnd = Math.floor(Math.random() * 10);
  // mathematical addition to end
  const numId = now * 10 + rnd;
  // base36, pad 9, dash format
  const base36 = numId.toString(36).padStart(9, "0");
  return base36.replace(/.{3}(?!$)/g, "$&-");
}

function getTaskPath(id: string): string {
  return join(TASKS_DIR, `task-${id}.md`);
}

// --- File I/O ---

async function ensureRepo() {
  await ensureDir(TASKS_DIR);
}

async function loadTask(id: string): Promise<TaskFile> {
  const path = getTaskPath(id);
  if (!(await exists(path))) {
    console.error(`Error: Task ${id} not found at ${path}`);
    Deno.exit(1);
  }

  const content = await Deno.readTextFile(path);
  
  // Robust frontmatter extraction
  const match = content.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
  
  if (!match) {
    // Fallback if file is malformed (missing frontmatter), return basic structure
    console.warn(`Warning: Malformed task file ${path}, parsing best effort.`);
    return {
      id,
      path,
      frontmatter: { id, status: "todo", parent: null, dependencies: [] },
      body: content
    };
  }

  const rawYaml = match[1];
  const body = match[2];
  
  try {
    const frontmatter = parseYaml(rawYaml) as TaskFrontmatter;
    return { id, path, frontmatter, body };
  } catch (e) {
    console.error(`Error parsing YAML for task ${id}: ${e}`);
    Deno.exit(1);
  }
}

async function saveTask(task: TaskFile) {
  const yaml = stringifyYaml(task.frontmatter);
  const content = `---\n${yaml}---\n${task.body}`;
  await Deno.writeTextFile(task.path, content);
}

async function checkTaskExists(id: string): Promise<boolean> {
  return await exists(getTaskPath(id));
}

// --- Cycle Detection ---

async function detectDependencyCycle(sourceId: string, targetDependencyId: string) {
  // We are adding targetDependencyId to sourceId.
  // Check if sourceId exists in targetDependencyId's dependency tree.
  const visited = new Set<string>();

  async function visit(currentId: string) {
    if (currentId === sourceId) {
      console.error(`Error: Circular dependency detected. Task ${sourceId} is already a dependency of ${targetDependencyId} (or its chain).`);
      Deno.exit(1);
    }
    if (visited.has(currentId)) return;
    visited.add(currentId);

    const task = await loadTask(currentId);
    for (const depId of (task.frontmatter.dependencies || [])) {
      await visit(depId);
    }
  }

  await visit(targetDependencyId);
}

async function detectParentCycle(childId: string, potentialParentId: string) {
  // We are setting childId.parent = potentialParentId.
  // Check if childId is an ancestor of potentialParentId.
  let curr = potentialParentId;
  while (curr) {
    if (curr === childId) {
      console.error(`Error: Circular parentage detected. Task ${childId} is an ancestor of ${potentialParentId}.`);
      Deno.exit(1);
    }
    const task = await loadTask(curr);
    if (!task.frontmatter.parent) break;
    curr = task.frontmatter.parent;
  }
}

// --- Commands ---

async function createCommand(args: ReturnType<typeof parseArgs>) {
  const edit = args.edit || false;
  const parentId = args.parent as string | undefined;
  
  // Title is the rest of the arguments joined
  // args._[0] is 'create', so slice 1
  const titleParts = args._.slice(1);
  if (titleParts.length === 0) {
    console.error("Error: Task title is required.");
    console.error("Usage: ./hb.ts create [--parent <id>] [--edit] \"Task Title\"");
    Deno.exit(1);
  }
  const title = titleParts.join(" ");

  if (parentId) {
    if (!(await checkTaskExists(parentId))) {
      console.error(`Error: Parent task ${parentId} does not exist.`);
      Deno.exit(1);
    }
  }

  const id = generateTaskId();
  const task: TaskFile = {
    id,
    path: getTaskPath(id),
    frontmatter: {
      id,
      status: "todo",
      parent: parentId || null,
      dependencies: []
    },
    body: `# ${title}\n\n`
  };

  await saveTask(task);
  console.log(`Task created: ${id}`);
  console.log(`Path: ${task.path}`);

  if (edit) {
    const editor = Deno.env.get("EDITOR") || "vim";
    const p = new Deno.Command(editor, {
      args: [task.path],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await p.output();
  }
}

async function connectCommand(args: ReturnType<typeof parseArgs>) {
  const taskId = args._[1] as string;
  const dependsOn = args["depends-on"] as string | undefined;
  const childOf = args["child-of"] as string | undefined;

  if (!taskId) {
    console.error("Error: Target task ID is required.");
    console.error("Usage: ./hb.ts connect [--depends-on <id>] [--child-of <id>] <task-id>");
    Deno.exit(1);
  }

  if (!dependsOn && !childOf) {
    console.error("Error: Must specify either --depends-on or --child-of.");
    Deno.exit(1);
  }

  const task = await loadTask(taskId);
  let updated = false;

  if (dependsOn) {
    if (!(await checkTaskExists(dependsOn))) {
      console.error(`Error: Dependency task ${dependsOn} does not exist.`);
      Deno.exit(1);
    }
    
    // Check cycle
    await detectDependencyCycle(taskId, dependsOn);

    if (!task.frontmatter.dependencies.includes(dependsOn)) {
      task.frontmatter.dependencies.push(dependsOn);
      updated = true;
      console.log(`Added dependency: ${dependsOn}`);
    } else {
      console.log(`Dependency ${dependsOn} already exists.`);
    }
  }

  if (childOf) {
    if (!(await checkTaskExists(childOf))) {
      console.error(`Error: Parent task ${childOf} does not exist.`);
      Deno.exit(1);
    }

    // Check cycle
    await detectParentCycle(taskId, childOf);

    if (task.frontmatter.parent !== childOf) {
      task.frontmatter.parent = childOf;
      updated = true;
      console.log(`Set parent: ${childOf}`);
    } else {
      console.log(`Parent is already ${childOf}`);
    }
  }

  if (updated) {
    await saveTask(task);
  }
}

async function moveCommand(args: ReturnType<typeof parseArgs>) {
  const taskId = args._[1] as string;
  const newStatus = args._[2] as TaskStatus;
  const fromStatus = args["from-status"] as string | undefined;

  const VALID_STATUSES = ["todo", "in_progress", "review", "done", "cancelled"];

  if (!taskId || !newStatus) {
    console.error("Error: Task ID and New Status are required.");
    console.error(`Usage: ./hb.ts move [--from-status <old-status>] <task-id> <new-status>`);
    console.error(`Valid statuses: ${VALID_STATUSES.join("|")}`);
    Deno.exit(1);
  }

  if (!VALID_STATUSES.includes(newStatus)) {
    console.error(`Error: Invalid status '${newStatus}'.`);
    console.error(`Valid statuses: ${VALID_STATUSES.join("|")}`);
    Deno.exit(1);
  }

  const task = await loadTask(taskId);

  if (fromStatus) {
    if (task.frontmatter.status !== fromStatus) {
      console.error(`Error: Race condition guarded. Expected status '${fromStatus}' but found '${task.frontmatter.status}'.`);
      Deno.exit(1);
    }
  }

  if (task.frontmatter.status !== newStatus) {
    const old = task.frontmatter.status;
    task.frontmatter.status = newStatus;
    await saveTask(task);
    console.log(`Task ${taskId} moved: ${old} -> ${newStatus}`);
  } else {
    console.log(`Task ${taskId} is already in status ${newStatus}`);
  }
}

// --- Main ---

async function main() {
  await ensureRepo();

  const args = parseArgs(Deno.args, {
    boolean: ["edit"],
    string: ["parent", "depends-on", "child-of", "from-status"],
  });

  const command = args._[0];

  switch (command) {
    case "create":
      await createCommand(args);
      break;
    case "connect":
      await connectCommand(args);
      break;
    case "move":
      await moveCommand(args);
      break;
    default:
      console.log("Hyperbranch CLI Scaffolding");
      console.log("Commands:");
      console.log("  create [--parent <id>] [--edit] <title>");
      console.log("  connect [--depends-on <id>] [--child-of <id>] <task-id>");
      console.log("  move [--from-status <old>] <task-id> <new-status>");
      break;
  }
}

if (import.meta.main) {
  main();
}

