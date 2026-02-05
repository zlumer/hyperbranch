
import { Args } from "@std/cli/parse-args";
import { resolve, join } from "@std/path";
import { exists } from "@std/fs/exists";
import * as Git from "../utils/git.ts";
import { WORKTREES_DIR } from "../utils/paths.ts";

import { getRunBranchName } from "../utils/branch-naming.ts";

export async function logsCommand(args: Args) {
  const taskId = args._[1] as string;
  const runArg = args._[2];

  if (!taskId || !runArg) {
    console.error("Error: Task ID and Run Index are required.");
    console.error("Usage: hb logs <task-id> <run-index>");
    Deno.exit(1);
  }

  const runIndex = parseInt(String(runArg), 10);
  if (isNaN(runIndex)) {
    console.error(`Invalid run index: ${runArg}`);
    Deno.exit(1);
  }
  const runBranch = getRunBranchName(taskId, runIndex);
    
  // Check if the worktree exists for this specific run
  const safeBranchName = runBranch.replace(/\//g, "-");
  const worktreePath = resolve(
    WORKTREES_DIR(),
    safeBranchName,
  );
  
  if (!(await exists(worktreePath))) {
      console.error(`Run ${runIndex} not found for task ${taskId}`);
      console.error(`Expected worktree at: ${worktreePath}`);
      Deno.exit(1);
  }

  const logFile = join(worktreePath, "stdout.log");

  if (!(await exists(logFile))) {
      console.error(`Log file not found at ${logFile}`);
      console.error("The task might not have started yet or failed early.");
      Deno.exit(1);
  }

  console.log(`Tailing logs for ${runBranch}...`);
  
  // Use tail -f
  const cmd = new Deno.Command("tail", {
      args: ["-f", "-n", "100", logFile],
      stdout: "inherit",
      stderr: "inherit"
  });
  
  const process = cmd.spawn();
  
  // Handle signals to exit cleanly
  Deno.addSignalListener("SIGINT", () => {
      process.kill();
      Deno.exit(0);
  });

  await process.status;
}
