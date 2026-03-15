import { Args } from "@std/cli/parse-args";
import * as Git from "../utils/git.ts";
import * as Runs from "../services/runs.ts";
import { RunId, TaskId } from "../utils/id.ts";
import { z } from "zod";

const LogsArgsSchema = z.object({
	_: z.array(z.union([z.string(), z.number()])),
	f: z.boolean().optional(),
	follow: z.boolean().optional(),
});

export async function logsCommand(args: Args)
{
	const parsedArgs = LogsArgsSchema.parse(args);
	const taskArg = parsedArgs._[1] ? String(parsedArgs._[1]) : undefined;
	const runArg = parsedArgs._[2] ? String(parsedArgs._[2]) : undefined;
	if (!taskArg)
	{
		console.error("Error: Task ID and Run Index are required.");
		console.error("Usage: hb logs <task-id>/<run-index>");
		Deno.exit(1);
	}


	const task = TaskId.from(taskArg)
	let run: RunId | null | undefined = RunId.fromTaskIdAndRunIdx(taskArg, runArg)

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

	const follow = parsedArgs.f ?? parsedArgs.follow ?? false

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
