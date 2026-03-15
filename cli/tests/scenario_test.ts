import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { stub } from "@std/testing/mock";
import { parseArgs } from "@std/cli/parse-args";

import { createCommand } from "../commands/create.ts";
import { runCommand } from "../commands/run.ts";
import { mergeCommand } from "../commands/merge.ts";

const originalCommand = Deno.Command;

class DockerState {
  containers = new Set<string>();
  networks = new Set<string>();
}

function createDockerMock(state: DockerState) {
  // @ts-ignore: Stub types are tricky
  return stub(Deno, "Command", (cmd: string | URL, options?: Deno.CommandOptions) => {
    if (cmd !== "docker") {
      // Delegate to original Deno.Command for non-docker commands (like git)
      return new originalCommand(cmd, options);
    }

    const args = options?.args || [];
    const command = args[0];

    let stdout = "";
    let stderr = "";
    let success = true;

    try {
      if (command === "build") {
        // verify Dockerfile exists
        // -f Dockerfile
        const fIndex = args.indexOf("-f");
        if (fIndex > -1 && fIndex + 1 < args.length) {
          const dockerfile = args[fIndex + 1];
          try {
            Deno.statSync(dockerfile); // throws if not found
          } catch {
            success = false;
            stderr = `Dockerfile not found: ${dockerfile}`;
          }
        }
      } else if (command === "inspect") {
        // format {{.Id}} name
        // format {{.State.Status}} cid
        const nameOrId = args[args.length - 1];
        if (args.includes("{{.Id}}")) {
            if (nameOrId.includes("test")) {
                stdout = "fake-container-id-123\n";
            } else {
                success = false;
            }
        } else if (args.includes("{{.State.Status}}")) {
            stdout = "running|2024-01-01T00:00:00Z|\n";
        }
      } else if (command === "ps") {
        // filter name=... format {{.Names}}
        stdout = "hb-run-test-task-1\n";
      } else if (command === "network") {
        const subcmd = args[1];
        if (subcmd === "ls") {
           stdout = "hb-network-test\n";
        } else if (subcmd === "rm") {
            // success
        }
      } else if (command === "rm") {
        // success
      } else if (command === "rmi") {
        // success
      } else if (command === "port") {
        stdout = "0.0.0.0:32768\n";
      } else if (command === "logs") {
        stdout = "";
      } else if (command === "stop" || command === "pause" || command === "unpause") {
         // success
      } else if (command === "exec") {
         // simulate success, maybe write a file if requested?
      } else if (command === "compose" || args.join(" ").includes("docker-compose")) {
          // Success
      } else {
        // Unhandled mock
        success = false;
        stderr = `Unmocked docker command: ${args.join(" ")}`;
      }
    } catch (e) {
      success = false;
      stderr = String(e);
    }

    return {
      output: () => Promise.resolve({
        success,
        code: success ? 0 : 1,
        stdout: new TextEncoder().encode(stdout),
        stderr: new TextEncoder().encode(stderr)
      })
    } as unknown as Deno.Command;
  });
}

async function runGit(args: string[], cwd: string) {
    const cmd = new originalCommand("git", { args, cwd, stdout: "inherit", stderr: "inherit" });
    const output = await cmd.output();
    if (!output.success) throw new Error(`Git command failed: ${args.join(" ")}`);
}

Deno.test("End-to-end Hyperbranch Scenario", async (t) => {
  const tempDir = await Deno.makeTempDir({ prefix: "hb-e2e-" });
  const originalCwd = Deno.cwd();
  
  const state = new DockerState();
  const commandStub = createDockerMock(state);

  try {
    Deno.chdir(tempDir);

    await t.step("Setup base repository", async () => {
      await runGit(["init"], tempDir);
      await runGit(["config", "user.name", "Test User"], tempDir);
      await runGit(["config", "user.email", "test@example.com"], tempDir);
      
      await Deno.writeTextFile(join(tempDir, "README.md"), "# Base Project\n");
      await runGit(["add", "README.md"], tempDir);
      await runGit(["commit", "-m", "Initial commit"], tempDir);
      
      // Hyperbranch needs .hyperbranch/tasks dir
      await ensureDir(join(tempDir, ".hyperbranch", "tasks"));
    });

    let taskId = "";

    await t.step("Create a task", async () => {
      // Set env vars so TASKS_DIR() uses tempDir
      Deno.env.set("HB_TASKS_DIR", join(tempDir, ".hyperbranch", "tasks"));
      Deno.env.set("HB_RUNS_DIR", join(tempDir, ".hyperbranch", ".runs"));

      const args = parseArgs(["create", "Add new feature"]);
      await createCommand(args);
      
      // Find the created task ID
      const tasksDir = join(tempDir, ".hyperbranch", "tasks");
      const entries = Array.from(Deno.readDirSync(tasksDir));
      assertEquals(entries.length, 1);
      
      const taskFile = entries[0].name;
      taskId = taskFile.replace("task-", "").replace(".md", "");
      
      // We need to commit the newly created task file
      // Normally create command does this, but maybe in tests it needs to be explicit or createCommand does not do it yet
      // Ah wait, createCommand does not commit! Let's commit it.
      await runGit(["add", ".hyperbranch/tasks/"], tempDir);
      await runGit(["commit", "-m", "Add task"], tempDir);

      // Ensure it was committed to base repo
      const statusCmd = new originalCommand("git", { args: ["status", "--porcelain"], cwd: tempDir, stdout: "piped" });
      const statusOut = await statusCmd.output();
      const statusText = new TextDecoder().decode(statusOut.stdout).trim();
      if (statusText !== "") {
        console.error("Git status:", statusText);
      }
      assertEquals(statusText, "");
    });

    await t.step("Run the task (creates branch and clone)", async () => {
      const args = parseArgs(["run", taskId]);
      await runCommand(args);
      
      // Verify clone exists
      const cloneDir = join(tempDir, ".hyperbranch", ".runs", `hb-${taskId}-1`);
      const stat = await Deno.stat(cloneDir);
      assertEquals(stat.isDirectory, true);
      
      // Verify branch exists in clone
      const branchCmd = new originalCommand("git", { args: ["branch", "--show-current"], cwd: cloneDir, stdout: "piped" });
      const branchOut = await branchCmd.output();
      const currentBranch = new TextDecoder().decode(branchOut.stdout).trim();
      assertEquals(currentBranch, `hb/${taskId}/1`);
    });

    await t.step("Developer works in clone", async () => {
      const cloneDir = join(tempDir, ".hyperbranch", ".runs", `hb-${taskId}-1`);
      
      // Setup git config in clone (since it's a new repo technically, though it might inherit global)
      await runGit(["config", "user.name", "Test User"], cloneDir);
      await runGit(["config", "user.email", "test@example.com"], cloneDir);

      // Add a file
      await Deno.writeTextFile(join(cloneDir, "feature.ts"), "export const a = 1;\n");
      await runGit(["add", "feature.ts"], cloneDir);
      await runGit(["commit", "-m", "Implemented feature"], cloneDir);
    });

    await t.step("Merge the task", async () => {
      const args = parseArgs(["merge", taskId, "1", "--strategy", "merge"]);
      await mergeCommand(args);
      
      // Verify file is in base repo now
      const stat = await Deno.stat(join(tempDir, "feature.ts"));
      assertEquals(stat.isFile, true);
      
      // Verify branch was merged
      const logCmd = new originalCommand("git", { args: ["log", "-1", "--oneline"], cwd: tempDir, stdout: "piped" });
      const logOut = await logCmd.output();
      const log = new TextDecoder().decode(logOut.stdout);
      // It should contain the commit message or merge commit
      assertEquals(log.includes("Implemented feature") || log.includes("Merge"), true);
    });

  } finally {
    commandStub.restore();
    Deno.chdir(originalCwd);
    await Deno.remove(tempDir, { recursive: true });
  }
});
