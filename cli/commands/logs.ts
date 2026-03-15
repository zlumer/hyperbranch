import { Args } from "@std/cli/parse-args";
import * as Git from "../utils/git.ts";
import * as Runs from "../services/runs.ts";
import { RunId, TaskId } from "../utils/id.ts";

export async function logsCommand(args: Args)
{
	const task = TaskId.from(args._[1] as string);
	let run: RunId | null | undefined = RunId.fromTaskIdAndRunIdx(args._[1] as string, args._[2] as string);

	if (!task)
	{
		console.error("Error: Task ID and Run Index are required.");
		console.error("Usage: hb logs <task-id>/<run-index>");
		Deno.exit(1);
	}

	if (!run)
	{
		console.log(`No run index provided. Fetching latest run for task '${task}'...`);
		run = await Git.getLatestRunBranch(task)
		if (!run)
		{
			console.error(`No runs found for task '${task}'`);
			Deno.exit(1);
		}
		console.log(`Latest run found: ${run}`);
	}

	const follow = args.f || args.follow;

	try
	{
		console.log(`Streaming logs for run ${run} ${follow ? "(follow)" : ""}...`);

		const process = await Runs.getLogsStream(run, follow);

		// Handle signals to exit cleanly
		Deno.addSignalListener("SIGINT", () =>
		{
			try
			{
				process.kill();
			} catch
			{
				// ignore if already dead
			}
			Deno.exit(0);
		});

		const status = await process.status;

		if (!status.success)
		{
			// Docker logs might fail if the container is already removed
			// But usually it exits with 0 if stream ends.
			// If it exits with non-zero, it means error (e.g. No such container)
			console.error("Log stream exited with non-zero status.");
			Deno.exit(status.code);
		}

	} catch (e)
	{
		console.error(e instanceof Error ? e.message : String(e));
		Deno.exit(1);
	}
}
