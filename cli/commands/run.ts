import * as Runs from "../services/runs.ts";
import { parseArgsString } from "../utils/args.ts";
import { TaskId } from "../utils/id.ts";
import { command, boolean, restPositionals, string, option } from "cmd-ts";

export const runCmd = command({
  name: "run",
  description: "Run a task",
  args: {
    image: option({ type: string, long: "image", defaultValue: () => "" }),
    dockerfile: option({ type: string, long: "dockerfile", defaultValue: () => "" }),
    commit: option({ type: boolean, long: "commit", defaultValue: () => false }),
    exec: option({ type: string, long: "exec", defaultValue: () => "" }),
    execFile: option({ type: string, long: "exec-file", defaultValue: () => "" }),
    args: restPositionals({ type: string, displayName: "args" }),
  },
  handler: async ({ image, dockerfile, commit, exec, execFile, args }) => {
    const taskId = TaskId.from(args[0])
    
    if (!taskId) {
      console.error("Error: Task ID is required.");
      console.error("Usage: hb run <task-id> [options]");
      process.exit(1);
    }

    const options: Runs.RunOptions & { commit?: boolean } = {
      image: image || undefined,
      dockerfile: dockerfile || undefined,
      commit: commit,
    };

    if (exec) {
      options.exec = parseArgsString(exec);
    } else if (execFile) {
      options.exec = ["./" + execFile];
    }

    try {
      const { runId, port } = await Runs.run(taskId, options);
      
      console.log(`Run Started: ${runId}`);
      if (port > 0) {
        console.log(`Access URL: http://localhost:${port}`);
      }
      
      console.log(`Use 'hb logs ${runId}' to view output.`);

    } catch (e) {
      console.error(`\n❌ Execution Failed:`);
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  },
});
