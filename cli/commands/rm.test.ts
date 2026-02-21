import { assertEquals, assertRejects, assert } from "@std/assert";
import { stub } from "@std/testing/mock";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { parseArgs } from "@std/cli/parse-args";

import { getRunDir } from "../utils/paths.ts";
import { rmCommand } from "./rm.ts";

// --- Mock Setup ---

function mockCmd(outputs: Record<string, { stdout?: string; stderr?: string; success: boolean; code?: number }>) {
  return stub(Deno, "Command", (cmd: unknown, options?: unknown) => {
    const commandName = cmd as string | URL;
    const opts = options as Deno.CommandOptions;

    if (commandName !== "git" && commandName !== "docker") throw new Error(`Unexpected command: ${commandName}`);
    
    const args = opts?.args || [];
    const cwd = opts?.cwd;
    const commandStr = `${commandName} ${args.join(" ")}`;
    
    // 1. Try match with CWD prefix: "[cwd] command"
    let result = cwd ? outputs[`[${cwd}] ${commandStr}`] : undefined;

    // 2. Try exact match without CWD
    if (!result) result = outputs[commandStr];

    // 3. Fallback: try to find a key that is a prefix of commandStr (for dynamic paths in args)
    if (!result) {
        const key = Object.keys(outputs).find(k => commandStr.startsWith(k) && !k.startsWith("["));
        if (key) result = outputs[key];
    }

    if (!result) {
      console.log(`[MockCmd] Unmocked: ${commandStr}`);
      return {
        output: () => Promise.resolve({
          success: false, 
          code: 1, 
          stdout: new Uint8Array(), 
          stderr: new TextEncoder().encode(`Unmocked: ${commandStr}`)
        })
      } as unknown as Deno.Command;
    }

    return {
      output: () => Promise.resolve({
        success: result.success,
        code: result.code ?? (result.success ? 0 : 1),
        stdout: new TextEncoder().encode(result.stdout || ""),
        stderr: new TextEncoder().encode(result.stderr || "")
      })
    } as unknown as Deno.Command;
  });
}

function setupTestEnv() {
  const cwd = Deno.makeTempDirSync();
  const originalCwd = Deno.cwd();
  
  // Create .hyperbranch structure
  const hbDir = join(cwd, ".hyperbranch");
  const runsDir = join(hbDir, ".runs");
  const tasksDir = join(hbDir, "tasks");
  Deno.mkdirSync(runsDir, { recursive: true });
  Deno.mkdirSync(tasksDir, { recursive: true });
  
  // Set env var for tasks dir AND worktrees dir
  Deno.env.set("HB_TASKS_DIR", tasksDir);
  Deno.env.set("HB_RUNS_DIR", runsDir);

  // Helper to create run scaffold
  const createRun = async (taskId: string, runIndex: number) => {
      // Logic from branch-naming.ts: hb/<taskId>/<runIndex> -> hb-<taskId>-<runIndex>
      const branchName = `hb-${taskId}-${runIndex}`;
      const runDir = join(runsDir, branchName);
      await ensureDir(runDir);
      const dotCurrentRun = join(runDir, ".hyperbranch", ".current-run");
      await ensureDir(dotCurrentRun);
      await Deno.writeTextFile(join(dotCurrentRun, "docker-compose.yml"), "version: '3'");
      return { runDir, dotCurrentRun };
  };

  return {
    cwd,
    runsDir,
    tasksDir,
    createRun,
    teardown: () => {
      try { Deno.removeSync(cwd, { recursive: true }); } catch {}
    }
  };
}

// --- Tests ---

Deno.test("hb rm <task>/<run> - remove inactive run", async () => {
  const env = setupTestEnv();
  const { runDir, dotCurrentRun } = await env.createRun("123", 1);
  
  const cmdStub = mockCmd({
    // Check Status (docker compose ps -q)
    [`docker compose -f ${join(dotCurrentRun, "docker-compose.yml")} -p hb-123-1 ps -q`]: 
        { success: true, stdout: "" }, // Empty = not running

    // Check Unmerged
    "git rev-parse --verify hb/123/1": { success: true },
    "git rev-parse --verify main": { success: true }, // Base branch
    "git log hb/123/1 ^main --oneline": { success: true, stdout: "" }, // Clean

    // Destroy: Down
    [`docker compose -f ${join(dotCurrentRun, "docker-compose.yml")} -p hb-123-1 down -v`]: 
        { success: true },

    // Destroy: Remove Clone Remote
    [`git remote remove hb-123-1`]: { success: true },
    "git fetch hb-123-1 hb/123/1:hb/123/1": { success: true },

    // Destroy: Delete Branch
    "git branch -D hb/123/1": { success: true },
    
    // Resolve base branch
    "git rev-parse --verify hb/123": { success: false }, 
  });

  try {
    const args = parseArgs(["rm", "123/1"]);
    await rmCommand(args);
  } finally {
    cmdStub.restore();
    env.teardown();
  }
});

Deno.test("hb rm <task>/<run> - fail on active run", async () => {
  const env = setupTestEnv();
  const { dotCurrentRun } = await env.createRun("123", 1);
  const consoleError = stub(console, "error");
  const exitStub = stub(Deno, "exit", (code) => { throw new Error(`EXIT:${code}`); });

  const cmdStub = mockCmd({
    // Check Status (Running)
    [`docker compose -f ${join(dotCurrentRun, "docker-compose.yml")} -p hb-123-1 ps -q`]: 
        { success: true, stdout: "container_id_123" },
    "docker inspect --format {{.State.Status}}|{{.State.StartedAt}}|{{.State.ExitCode}} container_id_123": 
        { success: true, stdout: "running|2023-01-01|0" },
  });

  try {
    const args = parseArgs(["rm", "123/1"]);
    await assertRejects(() => rmCommand(args), Error, "EXIT:1");
    
    const calls = consoleError.calls.map(c => c.args.join(" ")).join("\n");
    assert(calls.includes("Run 123/1 is active"), "Should log active error");
  } finally {
    cmdStub.restore();
    consoleError.restore();
    exitStub.restore();
    env.teardown();
  }
});

Deno.test("hb rm <task>/<run> --force - remove active run", async () => {
  const env = setupTestEnv();
  const { runDir, dotCurrentRun } = await env.createRun("123", 1);

  const cmdStub = mockCmd({
    // Force skips status check and git check
    
    // Destroy: Down
    [`docker compose -f ${join(dotCurrentRun, "docker-compose.yml")} -p hb-123-1 down -v`]: 
        { success: true },

    // Destroy: Remove Clone Remote
    [`git remote remove hb-123-1`]: { success: true },
    "git fetch hb-123-1 hb/123/1:hb/123/1": { success: true },

    // Destroy: Delete Branch
    "git branch -D hb/123/1": { success: true },
  });

  try {
    const args = parseArgs(["rm", "123/1", "--force"]);
    await rmCommand(args);
  } finally {
    cmdStub.restore();
    env.teardown();
  }
});

Deno.test("hb rm --sweep - cleans inactive/merged runs", async () => {
  const env = setupTestEnv();
  const run1 = await env.createRun("123", 1);
  const run2 = await env.createRun("123", 2);

  const cmdStub = mockCmd({
    "git rev-parse --verify main": { success: true },

    // Run 1 Check:
    // Status (Inactive)
    [`docker compose -f ${join(run1.dotCurrentRun, "docker-compose.yml")} -p hb-123-1 ps -q`]: 
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
    [`docker compose -f ${join(run2.dotCurrentRun, "docker-compose.yml")} -p hb-123-2 ps -q`]: 
        { success: true, stdout: "" },
    // Clone Dirty
    [`[${run2.runDir}] git status --porcelain`]: { success: true, stdout: "M file.txt" },

    // Destroy Run 1
    [`docker compose -f ${join(run1.dotCurrentRun, "docker-compose.yml")} -p hb-123-1 down -v`]: 
        { success: true },
    [`git remote remove hb-123-1`]: { success: true },
    "git fetch hb-123-1 hb-123-1:hb-123-1": { success: true },
    "git branch -D hb/123/1": { success: true },
  });

  try {
    const args = parseArgs(["rm", "--sweep"]);
    await rmCommand(args);
  } finally {
    cmdStub.restore();
    env.teardown();
  }
});

Deno.test("hb rm <hb/task/run> - remove inactive run with prefix", async () => {
  const env = setupTestEnv();
  const { runDir, dotCurrentRun } = await env.createRun("123", 1);
  
  const cmdStub = mockCmd({
    // Check Status (docker compose ps -q)
    [`docker compose -f ${join(dotCurrentRun, "docker-compose.yml")} -p hb-123-1 ps -q`]: 
        { success: true, stdout: "" }, // Empty = not running

    // Check Unmerged
    "git rev-parse --verify hb/123/1": { success: true },
    "git rev-parse --verify main": { success: true }, // Base branch
    "git log hb/123/1 ^main --oneline": { success: true, stdout: "" }, // Clean

    // Destroy: Down
    [`docker compose -f ${join(dotCurrentRun, "docker-compose.yml")} -p hb-123-1 down -v`]: 
        { success: true },

    // Destroy: Remove Clone Remote
    [`git remote remove hb-123-1`]: { success: true },
    "git fetch hb-123-1 hb/123/1:hb/123/1": { success: true },

    // Destroy: Delete Branch
    "git branch -D hb/123/1": { success: true },
    
    // Resolve base branch
    "git rev-parse --verify hb/123": { success: false }, 
  });

  try {
    const args = parseArgs(["rm", "hb/123/1"]);
    await rmCommand(args);
  } finally {
    cmdStub.restore();
    env.teardown();
  }
});

