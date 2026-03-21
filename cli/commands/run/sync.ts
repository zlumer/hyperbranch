import { Command } from "@std/cli/command";
import { getTaskFromArgs } from "../utils/args.ts";
import { RunId } from "../../utils/id.ts";
import { syncRun } from "../../services/sync-run.ts";

export const syncCommand = new Command()
  .description("Syncs a run with the base branch (reverse-merge)")
  .arguments("<task:string>")
  .action(async (_options, taskArg) => {
    const { task, runId } = await getTaskFromArgs(taskArg);
    
    if (!runId) {
      console.error("Error: Run ID is required (e.g., hb run sync 'task-id/1')");
      Deno.exit(1);
    }
    
    console.log(`Starting sync for run ${runId.toString()}...`);
    
    try {
      await syncRun(runId);
      console.log(`✅ Sync completed or smart merge session started successfully.`);
    } catch (e: any) {
      console.error(`❌ Sync failed: ${e.message}`);
      Deno.exit(1);
    }
  });
