import { join } from "node:path";
import fs from "node:fs";
const exists = async (p: string) => fs.promises.access(p).then(()=>true).catch(()=>false);
import * as Git from "../utils/git.ts";
import * as GitClones from "../utils/git-clones.ts";
import * as Docker from "../utils/docker.ts";
import * as Runs from "./runs.ts";
import { RUNS_DIR } from "../utils/paths.ts";
import { TaskId, RunId } from "../utils/id.ts";

export async function sweep() {
  const runsDir = RUNS_DIR();
  if (!(await exists(runsDir))) {
    console.log("No runs found.");
    return;
  }

  console.log("Sweeping runs...");

  for (const entry of await fs.promises.readdir(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    
    // Expect hb-<taskId>-<runIndex>
    const match = entry.name.match(/^(hb|task)-(.+)-(\d+)$/);
    if (!match) continue;

    const taskId = new TaskId(match[1]);
    const runIndex = parseInt(match[2], 10);
    const runId = taskId.toRunId(runIndex);

    // Check Active
    const status = await Runs.getStatus(runId);
    if (status.toLowerCase() === "running") {
      console.log(`Skipping ${taskId}/${runIndex}: Run is active.`);
      continue;
    }

    // Check Dirty
    const clonePath = join(runsDir, entry.name);
    const isDirty = await GitClones.status(clonePath);
    if (isDirty) {
      console.log(`Skipping ${taskId}/${runIndex}: Clone is dirty.`);
      continue;
    }

    // Check Merged
    const runBranch = runId.toBranchName();
    if (await Git.branchExists(runBranch)) {
       const baseBranch = await Git.resolveBaseBranch(taskId);
       const isMerged = await Git.isBranchMerged(runBranch, baseBranch);
       if (!isMerged) {
         console.log(`Skipping ${taskId}/${runIndex}: Branch not merged.`);
         continue;
       }
    }

    console.log(`Removing ${taskId}/${runIndex}...`);
    await Runs.destroyRun(runId);
  }
  
  await deepSweep();
  console.log("Sweep complete.");
}

export async function deepSweep() {
  console.log("Performing deep sweep of Docker resources...");
  
  // 1. Collect active project names from runs
  const activeProjects = new Set<string>();
  const runsDir = RUNS_DIR();
  
  if (await exists(runsDir)) {
    for (const entry of await fs.promises.readdir(runsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // We accept any directory starting with hb- as a valid project to preserve
      if (entry.name.startsWith("hb-")) {
        activeProjects.add(entry.name);
      }
    }
  }

  // 2. Scan for orphaned containers
  const containers = await Docker.findContainersByPartialName("hb-");
  for (const name of containers) {
    let isOrphan = true;
    for (const project of activeProjects) {
      if (name.startsWith(project)) {
        isOrphan = false;
        break;
      }
    }

    if (isOrphan) {
      console.log(`Removing orphaned container: ${name}`);
      await Docker.removeContainer(name, true);
    }
  }

  // 3. Scan for orphaned networks
  const networks = await Docker.findNetworksByPartialName("hb-");
  for (const name of networks) {
    let isOrphan = true;
    for (const project of activeProjects) {
      if (name.startsWith(project)) {
        isOrphan = false;
        break;
      }
    }

    if (isOrphan) {
       console.log(`Removing orphaned network: ${name}`);
       await Docker.removeNetwork(name);
    }
  }
}

export async function listCandidates() {
  const runsDir = RUNS_DIR();
  if (!(await exists(runsDir))) {
    console.log("No runs found.");
    return;
  }

  console.log("Candidates for removal (sweep):");
  let found = false;

  for (const entry of await fs.promises.readdir(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory())
      continue

    const candidate = await checkDir(entry.name, runsDir)
    if (candidate.type !== "ready")
      continue
    
    console.log(`- ${candidate.taskId}/${candidate.runIndex}`);
    found = true;
  }

  if (!found) {
    console.log("No candidates found.");
  } else {
    console.log("\nRun 'hb rm --sweep' to remove these items.");
  }
}

type Candidate = { taskId: string, runIndex: number, runId: RunId }
type DirStatus = { type: "invalid_name" }
  | { type: "active" } & Candidate
  | { type: "dirty" } & Candidate
  | { type: "not_merged" } & Candidate
  | { type: "ready" } & Candidate

async function checkDir(dir: string, runsDir: string): Promise<DirStatus> {
  const match = dir.match(/^hb-(.+)-(\d+)$/);
  if (!match)
    return { type: "invalid_name" }

  const taskId = new TaskId(match[1]);
  const runIndex = parseInt(match[2], 10);
  const runId = taskId.toRunId(runIndex);

  // Check Active
  const status = await Runs.getStatus(runId);
  if (status.toLowerCase() === "running")
    return { type: "active", taskId: taskId.id, runIndex, runId }

  // Check Dirty
  const clonePath = join(runsDir, dir);
  const isDirty = await GitClones.status(clonePath);
  if (isDirty)
    return { type: "dirty", taskId: taskId.id, runIndex, runId }

  // Check Merged
  if (!await isMerged(runId))
    return { type: "not_merged", taskId: taskId.id, runIndex, runId }

  return { type: "ready", taskId: taskId.id, runIndex, runId }
}

async function isMerged(runId: RunId) {
  if (!(await Git.branchExists(runId.toBranchName())))
    return false

  const baseBranch = await Git.resolveBaseBranch(runId.task);
  return Git.isBranchMerged(runId.toBranchName(), baseBranch);
}