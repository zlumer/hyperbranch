
import { Args } from "@std/cli/parse-args";
import { resolve, join } from "@std/path";
import { exists } from "@std/fs/exists";
import * as Git from "../utils/git.ts";
import { WORKTREES_DIR } from "../utils/paths.ts";

export async function stopCommand(args: Args) {
  const taskId = args._[1] as string;
  if (!taskId) {
    console.error("Error: Task ID is required.");
    console.error("Usage: hb stop <task-id>");
    Deno.exit(1);
  }

  // Find latest run
  const runBranch = await Git.getLatestRunBranch(taskId);
  if (!runBranch) {
      console.error(`No active runs found for task ${taskId}`);
      Deno.exit(1);
  }

  const safeBranchName = runBranch.replace(/\//g, "-");
  const worktreePath = resolve(
    WORKTREES_DIR(),
    safeBranchName,
  );

  const cidFile = join(worktreePath, "hb.cid");

  if (!(await exists(cidFile))) {
      console.error(`CID file not found at ${cidFile}`);
      console.error("Container might not be running.");
      Deno.exit(1);
  }

  const cid = (await Deno.readTextFile(cidFile)).trim();
  if (!cid) {
      console.error("CID file is empty.");
      Deno.exit(1);
  }

  console.log(`Stopping container ${cid} for task ${taskId}...`);

  const cmd = new Deno.Command("docker", {
      args: ["stop", cid],
      stdout: "inherit",
      stderr: "inherit"
  });

  const output = await cmd.output();
  
  if (output.success) {
      console.log("✅ Container stopped.");
  } else {
      console.error("❌ Failed to stop container.");
      Deno.exit(1);
  }
}
