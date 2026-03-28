import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { parseArgs } from "node:util";

import { createCmd } from "../commands/create.js";
import { runCmd } from "../commands/run.js";
import { mergeCmd } from "../commands/merge.js";
import { execa } from "execa";

vi.mock("execa");
const originalExeca = await vi.importActual<typeof import("execa")>("execa");

describe.sequential("End-to-end Hyperbranch Scenario", () => {
  let tempDir: string;
  let originalCwd: string;
  let taskId = "";

  beforeAll(async () => {
    tempDir = await fsPromises.mkdtemp(join(process.cwd(), "hb-e2e-"));
    originalCwd = process.cwd();
    
    // @ts-ignore
    vi.mocked(execa).mockImplementation((cmd: string, args?: readonly string[], options?: any) => {
      if (cmd !== "docker") {
        return originalExeca.execa(cmd, args, options);
      }

      const command = args ? args[0] : "";
      let stdout = "";
      let stderr = "";
      let success = true;

      try {
        if (command === "build") {
          const fIndex = args!.indexOf("-f");
          if (fIndex > -1 && fIndex + 1 < args!.length) {
            const dockerfile = args![fIndex + 1];
            try {
              fs.statSync(dockerfile);
            } catch {
              success = false;
              stderr = `Dockerfile not found: ${dockerfile}`;
            }
          }
        } else if (command === "inspect") {
          const nameOrId = args![args!.length - 1];
          if (args!.includes("{{.Id}}")) {
              if (nameOrId.includes("test")) {
                  stdout = "fake-container-id-123\n";
              } else {
                  success = false;
              }
          } else if (args!.includes("{{.State.Status}}")) {
              stdout = "running|2024-01-01T00:00:00Z|\n";
          }
        } else if (command === "ps") {
          stdout = "hb-run-test-task-1\n";
        } else if (command === "network") {
          const subcmd = args![1];
          if (subcmd === "ls") {
             stdout = "hb-network-test\n";
          }
        } else if (command === "rm" || command === "rmi" || command === "stop" || command === "pause" || command === "unpause" || command === "exec" || command === "compose" || (args && args.join(" ").includes("docker-compose"))) {
          // success
        } else if (command === "port") {
          stdout = "0.0.0.0:32768\n";
        } else if (command === "logs") {
          stdout = "";
        } else {
          success = false;
          stderr = `Unmocked docker command: ${args ? args.join(" ") : ""}`;
        }
      } catch (e) {
        success = false;
        stderr = String(e);
      }

      if (!success) {
        return Promise.reject({ stdout, stderr, exitCode: 1, failed: true });
      }

      return Promise.resolve({ stdout, stderr, exitCode: 0, failed: false } as any);
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    if (tempDir) {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
  });

  async function runGit(args: string[], cwd: string) {
    const { failed } = await originalExeca.execa("git", args, { cwd, stdio: "inherit", reject: false });
    if (failed) throw new Error(`Git command failed: ${args.join(" ")}`);
  }

  it("Setup base repository", async () => {
    process.chdir(tempDir);
    await runGit(["init"], tempDir);
    await runGit(["config", "user.name", "Test User"], tempDir);
    await runGit(["config", "user.email", "test@example.com"], tempDir);
    
    await fsPromises.writeFile(join(tempDir, "README.md"), "# Base Project\n");
    await runGit(["add", "README.md"], tempDir);
    await runGit(["commit", "-m", "Initial commit"], tempDir);
    
    await fsPromises.mkdir(join(tempDir, ".hyperbranch", "tasks"), { recursive: true });
  });

  it("Create a task", async () => {
    process.env.HB_TASKS_DIR = join(tempDir, ".hyperbranch", "tasks");
    process.env.HB_RUNS_DIR = join(tempDir, ".hyperbranch", ".runs");

    await createCmd.handler({ parent: "", edit: false, titleParts: ["Add new feature"] });
    
    const tasksDir = join(tempDir, ".hyperbranch", "tasks");
    const entries = fs.readdirSync(tasksDir);
    expect(entries.length).toBe(1);
    
    const taskFile = entries[0];
    taskId = taskFile.replace("task-", "").replace(".md", "");
    
    await runGit(["add", ".hyperbranch/tasks/"], tempDir);
    await runGit(["commit", "-m", "Add task"], tempDir);

    const { stdout: statusText } = await originalExeca.execa("git", ["status", "--porcelain"], { cwd: tempDir });
    if (statusText.trim() !== "") {
      console.error("Git status:", statusText);
    }
    expect(statusText.trim()).toBe("");
  });

  it("Run the task (creates branch and clone)", async () => {
    await runCmd.handler({ image: "", dockerfile: "", commit: false, exec: "", execFile: "", args: [taskId] });
    
    const cloneDir = join(tempDir, ".hyperbranch", ".runs", `hb-${taskId}-1`);
    const stat = await fsPromises.stat(cloneDir);
    expect(stat.isDirectory()).toBe(true);
    
    const { stdout: currentBranch } = await originalExeca.execa("git", ["branch", "--show-current"], { cwd: cloneDir });
    expect(currentBranch.trim()).toBe(`hb/${taskId}/1`);
  });

  it("Developer works in clone", async () => {
    const cloneDir = join(tempDir, ".hyperbranch", ".runs", `hb-${taskId}-1`);
    
    await runGit(["config", "user.name", "Test User"], cloneDir);
    await runGit(["config", "user.email", "test@example.com"], cloneDir);

    await fsPromises.writeFile(join(cloneDir, "feature.ts"), "export const a = 1;\n");
    await runGit(["add", "feature.ts"], cloneDir);
    await runGit(["commit", "-m", "Implemented feature"], cloneDir);
  });

  it("Merge the task", async () => {
    await mergeCmd.handler({ strategy: "merge", cleanup: false, args: [taskId, "1"] });
    
    const stat = await fsPromises.stat(join(tempDir, "feature.ts"));
    expect(stat.isFile()).toBe(true);
    
    const { stdout: log } = await originalExeca.execa("git", ["log", "-1", "--oneline"], { cwd: tempDir });
    expect(log.includes("Implemented feature") || log.includes("Merge")).toBe(true);
  });
});
