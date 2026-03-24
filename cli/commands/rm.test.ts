import { describe, it, expect, vi, afterEach } from "vitest";
import { execa } from "execa";
import { join } from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

import { rmCmd } from "./rm.ts";

vi.mock("execa");

function mockCmd(
  outputs: Record<
    string,
    { stdout?: string; stderr?: string; success: boolean; code?: number }
  >,
) {
  return vi.mocked(execa).mockImplementation((cmd: string, args?: readonly string[], options?: any) => {
    const commandName = cmd;

    if (commandName !== "git" && commandName !== "docker") {
      throw new Error(`Unexpected command: ${commandName}`);
    }

    const argsArr = args || [];
    const cwd = options?.cwd;
    const commandStr = `${commandName} ${argsArr.join(" ")}`;

    // 1. Try match with CWD prefix: "[cwd] command"
    let result = cwd ? outputs[`[${cwd}] ${commandStr}`] : undefined;

    // 2. Try exact match without CWD
    if (!result) result = outputs[commandStr];

    // 3. Fallback: try to find a key that is a prefix of commandStr (for dynamic paths in args)
    if (!result) {
      const key = Object.keys(outputs).find((k) =>
        commandStr.startsWith(k) && !k.startsWith("[")
      );
      if (key) result = outputs[key];
    }

    if (!result) {
      console.log(`[MockCmd] Unmocked: ${commandStr}`);
      return Promise.resolve({
        failed: true,
        exitCode: 1,
        stdout: "",
        stderr: `Unmocked: ${commandStr}`,
        isCanceled: false,
        isTerminated: false,
        command: commandStr,
        escapedCommand: commandStr
      }) as any;
    }

    const p = Promise.resolve({
      failed: !result.success,
      exitCode: result.code ?? (result.success ? 0 : 1),
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      isCanceled: false,
      isTerminated: false,
      command: commandStr,
      escapedCommand: commandStr
    });
    return p as any;
  });
}

async function setupTestEnv() {
  const cwd = await fs.mkdtemp(join(os.tmpdir(), "hb-test-"));
  const originalCwd = process.cwd();

  // Create .hyperbranch structure
  const hbDir = join(cwd, ".hyperbranch");
  const runsDir = join(hbDir, ".runs");
  const tasksDir = join(hbDir, "tasks");
  await fs.mkdir(runsDir, { recursive: true });
  await fs.mkdir(tasksDir, { recursive: true });

  // Set env var for tasks dir AND worktrees dir
  process.env.HB_TASKS_DIR = tasksDir;
  process.env.HB_RUNS_DIR = runsDir;

  // Helper to create run scaffold
  const createRun = async (taskId: string, runIndex: number) => {
    // Logic from branch-naming.ts: hb/<taskId>/<runIndex> -> hb-<taskId>-<runIndex>
    const branchName = `hb-${taskId}-${runIndex}`;
    const runDir = join(runsDir, branchName);
    await fs.mkdir(runDir, { recursive: true });
    const dotCurrentRun = join(runDir, ".hyperbranch", ".current-run");
    await fs.mkdir(dotCurrentRun, { recursive: true });
    await fs.writeFile(
      join(dotCurrentRun, "docker-compose.yml"),
      "version: '3'",
    );
    return { runDir, dotCurrentRun };
  };

  return {
    cwd,
    runsDir,
    tasksDir,
    createRun,
    teardown: async () => {
      try {
        await fs.rm(cwd, { recursive: true, force: true });
      } catch {}
    },
  };
}

describe("rm command", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hb rm <task>/<run> - remove inactive run", async () => {
    const env = await setupTestEnv();
    const { dotCurrentRun } = await env.createRun("123", 1);

    mockCmd({
      // Check Status (docker compose ps -q)
      [`docker compose -f /tmp/.*/docker-compose.yml -p hb-123-1 ps -q -a task`]:
        { success: true, stdout: "" }, // Empty = not running

      // Check Unmerged
      "git rev-parse --verify hb/123/1": { success: true },
      "git rev-parse --verify main": { success: true }, // Base branch
      "git log hb/123/1 ^main --oneline": { success: true, stdout: "" }, // Clean

      // Destroy: Down
      [`docker compose -f ${join(dotCurrentRun, "docker-compose.yml")} -p hb-123-1 down -v`]: { success: true },

      // Destroy: Remove Clone Remote
      [`git remote remove hb-123-1`]: { success: true },
      "git fetch hb-123-1 hb/123/1:hb/123/1": { success: true },

      // Destroy: Delete Branch
      "git branch -D hb/123/1": { success: true },

      // Resolve base branch
      "git rev-parse --verify hb/123": { success: false },
    });

    try {
      await rmCmd.handler({ sweep: false, force: false, targets: ["123/1"] });
    } finally {
      await env.teardown();
    }
  });

  it("hb rm <task>/<run> - fail on active run", async () => {
    const env = await setupTestEnv();
    const { dotCurrentRun } = await env.createRun("123", 1);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitStub = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`EXIT:${code}`);
    });

    mockCmd({
      // Check Status (Running)
      [`docker compose -f ${join(dotCurrentRun, "docker-compose.yml")} -p hb-123-1 ps -q -a task`]: { success: true, stdout: "hb-123-1-task-1" },
      "docker inspect --format {{.State.Status}}|{{.State.StartedAt}}|{{.State.ExitCode}} hb-123-1-task-1":
        { success: true, stdout: "running|2023-01-01|0" },
      "git rev-parse --verify hb/123/1": { success: true },
    });

    try {
      await expect(rmCmd.handler({ sweep: false, force: false, targets: ["123/1"] })).rejects.toThrow("EXIT:1");

      const calls = consoleError.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(calls).toContain("is active");
    } finally {
      await env.teardown();
    }
  });

  it("hb rm <task>/<run> --force - remove active run", async () => {
    const env = await setupTestEnv();
    const { dotCurrentRun } = await env.createRun("123", 1);

    mockCmd({
      // Destroy: Down
      [`docker compose -f ${join(dotCurrentRun, "docker-compose.yml")} -p hb-123-1 down -v`]: { success: true },

      // Destroy: Remove Clone Remote
      [`git remote remove hb-123-1`]: { success: true },
      "git fetch hb-123-1 hb/123/1:hb/123/1": { success: true },

      // Destroy: Delete Branch
      "git branch -D hb/123/1": { success: true },
    });

    try {
      await rmCmd.handler({ sweep: false, force: true, targets: ["123/1"] });
    } finally {
      await env.teardown();
    }
  });

  it("hb rm --sweep - cleans inactive/merged runs", async () => {
    const env = await setupTestEnv();
    const run1 = await env.createRun("123", 1);
    const run2 = await env.createRun("123", 2);

    mockCmd({
      "git rev-parse --verify main": { success: true },

      // Run 1 Check:
      // Status (Inactive)
      [`docker compose -f /tmp/.*/docker-compose.yml -p hb-123-1 ps -q -a task`]:
        { success: true, stdout: "" },
      // Clone Clean
      [`git status --porcelain`]: { success: true, stdout: "" },
      [`[${run1.runDir}] git status --porcelain`]: { success: true, stdout: "" },
      // Merged
      "git rev-parse --verify hb/123/1": { success: true },
      "git rev-parse --verify hb/123": { success: false }, // Base
      "git branch --merged main": { success: true, stdout: "  main\n+ hb/123/1" },

      // Run 2 Check:
      // Status (Inactive)
      [`docker compose -f ${join(run2.dotCurrentRun, "docker-compose.yml")} -p hb-123-2 ps -q`]: { success: true, stdout: "" },
      // Clone Dirty
      [`[${run2.runDir}] git status --porcelain`]: {
        success: true,
        stdout: "M file.txt",
      },

      // Destroy Run 1
      [`docker compose -f ${join(run1.dotCurrentRun, "docker-compose.yml")} -p hb-123-1 down -v`]: { success: true },
      [`git remote remove hb-123-1`]: { success: true },
      "git fetch hb-123-1 hb-123-1:hb-123-1": { success: true },
      "git branch -D hb/123/1": { success: true },
    });

    try {
      await rmCmd.handler({ sweep: true, force: false, targets: [] });
    } finally {
      await env.teardown();
    }
  });

  it("hb rm <hb/task/run> - remove inactive run with prefix", async () => {
    const env = await setupTestEnv();
    const { dotCurrentRun } = await env.createRun("123", 1);

    mockCmd({
      // Check Status (docker compose ps -q)
      [`docker compose -f /tmp/.*/docker-compose.yml -p hb-123-1 ps -q -a task`]:
        { success: true, stdout: "" }, // Empty = not running

      // Check Unmerged
      "git rev-parse --verify hb/123/1": { success: true },
      "git rev-parse --verify main": { success: true }, // Base branch
      "git log hb/123/1 ^main --oneline": { success: true, stdout: "" }, // Clean

      // Destroy: Down
      [`docker compose -f ${join(dotCurrentRun, "docker-compose.yml")} -p hb-123-1 down -v`]: { success: true },

      // Destroy: Remove Clone Remote
      [`git remote remove hb-123-1`]: { success: true },
      "git fetch hb-123-1 hb/123/1:hb/123/1": { success: true },

      // Destroy: Delete Branch
      "git branch -D hb/123/1": { success: true },

      // Resolve base branch
      "git rev-parse --verify hb/123": { success: false },
    });

    try {
      await rmCmd.handler({ sweep: false, force: false, targets: ["hb/123/1"] });
    } finally {
      await env.teardown();
    }
  });
});
