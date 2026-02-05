
import { join, basename } from "@std/path";
import { exists } from "@std/fs/exists";
import { WORKTREES_DIR } from "../utils/paths.ts";
import * as Docker from "../utils/docker.ts";

interface TaskStatus {
  taskId: string;
  runBranch: string;
  cid: string;
  status: string;
  age: string;
}

function calculateAge(startedAt: string): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h`;
}

export async function psCommand() {
  const worktreesDir = WORKTREES_DIR();
  
  if (!(await exists(worktreesDir))) {
    console.log("No active runs found.");
    return;
  }

  const tasks: TaskStatus[] = [];

  for await (const entry of Deno.readDir(worktreesDir)) {
    if (entry.isDirectory) {
      const worktreePath = join(worktreesDir, entry.name);
      const cidFile = join(worktreePath, "hb.cid");

      if (await exists(cidFile)) {
        const cid = (await Deno.readTextFile(cidFile)).trim();
        if (cid) {
          const { status, startedAt } = await Docker.getContainerStatus(cid);
          
          // Infer task ID from branch name (folder name)
          // Folder name: task-<id>-run-<n> (roughly, flattened)
          // Actually, Git worktree path was created with safeBranchName = runBranch.replace(/\//g, "-");
          // runBranch format: task/<id>/<run-idx> -> task-<id>-<run-idx>
          // Let's try to extract ID.
          
          const parts = entry.name.split("-");
          // Expected: task, [id parts...], run, [index]
          // This is a bit loose because IDs are base36 with dashes.
          // Better approach: Regex or just display the Run Name.
          
          tasks.push({
            taskId: entry.name, // Using folder name as proxy for run identifier
            runBranch: entry.name,
            cid: cid.substring(0, 12),
            status: status.toUpperCase(),
            age: calculateAge(startedAt),
          });
        }
      }
    }
  }

  if (tasks.length === 0) {
    console.log("No active runs found.");
    return;
  }

  // Print Table
  console.log(
    "RUN".padEnd(30) +
    "CID".padEnd(15) +
    "STATUS".padEnd(15) +
    "AGE"
  );
  console.log("-".repeat(70));

  for (const t of tasks) {
    console.log(
      t.runBranch.padEnd(30) +
      t.cid.padEnd(15) +
      t.status.padEnd(15) +
      t.age
    );
  }
}
