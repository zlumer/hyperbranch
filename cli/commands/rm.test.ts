import { assertEquals, assertRejects, assert } from "@std/assert";
import { stub, Spy } from "@std/testing/mock";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { parseArgs } from "@std/cli/parse-args";

import { getRunDir } from "../utils/paths.ts";

// We will import this once implemented
import { rmCommand } from "./rm.ts";

// --- Mock Setup ---

function mockGit(outputs: Record<string, { stdout?: string; stderr?: string; success: boolean }>) {
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
      console.log(`[MockGit] Unmocked: ${commandStr}`);
      // Allow docker rm/rmi to pass by default if not strictly mocked (simulates success)
      if (commandName === "docker" && (args[0] === "rm" || args[0] === "rmi")) {
          return {
             output: () => Promise.resolve({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() })
          } as unknown as Deno.Command;
      }

      return {
        output: () => Promise.resolve({
          success: false, code: 1, stdout: new Uint8Array(), stderr: new TextEncoder().encode(`Unmocked: ${commandStr}`)
        })
      } as unknown as Deno.Command;
    }

    console.log(`[MockGit] Matched: ${commandStr}`);
    return {
      output: () => Promise.resolve({
        success: result.success,
        code: result.success ? 0 : 1,
        stdout: new TextEncoder().encode(result.stdout || ""),
        stderr: new TextEncoder().encode(result.stderr || "")
      })
    } as unknown as Deno.Command;
  });
}

function setupTestEnv() {
  const cwd = Deno.makeTempDirSync();
  const originalCwd = Deno.cwd();
  Deno.chdir(cwd);
  
  // Create .hyperbranch structure
  const hbDir = join(cwd, ".hyperbranch");
  const worktreesDir = join(hbDir, ".worktrees");
  const tasksDir = join(hbDir, "tasks");
  Deno.mkdirSync(worktreesDir, { recursive: true });
  Deno.mkdirSync(tasksDir, { recursive: true });

  return {
    cwd,
    worktreesDir,
    tasksDir,
    teardown: () => {
      Deno.chdir(originalCwd);
      try { Deno.removeSync(cwd, { recursive: true }); } catch {}
    }
  };
}

// --- Behavior 1: Specific Run Removal ---

Deno.test("hb rm <task>/<run> - remove clean inactive run", async () => {
  const env = setupTestEnv();
  const exitStub = stub(Deno, "exit", () => { throw new Error("EXIT"); });
  const gitStub = mockGit({
    // ... static keys ...
    [`git worktree remove ${join(env.worktreesDir, "task-123-1")}`]: { success: true },
    // ...
    // Check if branch exists/verify
    "git rev-parse --verify task/123/1": { success: true },
    // Check for unmerged commits (clean)
    "git log task/123/1 ^main --oneline": { success: true, stdout: "" }, // Empty = clean
    // Remove worktree - DYNAMIC KEY handled below
    // Delete branch
    "git branch -d task/123/1": { success: true },
    // Resolve base branch
    "git rev-parse --verify task/123": { success: false }, // No parent
    "git rev-parse --verify main": { success: true },
  });

  try {
    // Setup worktree dir
    const runDir = join(env.worktreesDir, "task-123-1");
    await ensureDir(runDir);

    const args = parseArgs(["rm", "123/1"]);
    await rmCommand(args);

    // Verify worktree dir is gone (mocking git worktree remove usually handles this, 
    // but in our implementation we might check existence. 
    // Since we mocked the git command, the CLI code assumes git removed it.
    // We can't easily verify the side effect of a mocked git command on FS unless we impl it.)
    
  } finally {
    exitStub.restore();
    gitStub.restore();
    env.teardown();
  }
});

Deno.test("hb rm <task>/<run> - fail on dirty run", async () => {
  const env = setupTestEnv();
  const exitStub = stub(Deno, "exit", (code) => { throw new Error(`EXIT_CALLED: ${code}`); });
  const consoleError = stub(console, "error");
  const gitStub = mockGit({
    "git rev-parse --verify task/123/1": { success: true },
    "git rev-parse --verify main": { success: true },
    // Returns output = dirty
    "git log task/123/1 ^main --oneline": { success: true, stdout: "abc1234 WIP" }, 
  });

  try {
    const runDir = join(env.worktreesDir, "task-123-1");
    await ensureDir(runDir);

    const args = parseArgs(["rm", "123/1"]);
    await assertRejects(() => rmCommand(args), Error, "EXIT_CALLED: 1");
    
    const calls = consoleError.calls.map(c => c.args.join(" ")).join("\n");
    assert(calls.includes("Run has unmerged commits"), "Should log error message");
    
  } finally {
    exitStub.restore();
    consoleError.restore();
    gitStub.restore();
    env.teardown();
  }
});

Deno.test("hb rm <task>/<run> - fail on active run", async () => {
  const env = setupTestEnv();
  const exitStub = stub(Deno, "exit", (code) => { throw new Error(`EXIT_CALLED: ${code}`); });
  const consoleError = stub(console, "error");
  // Mocking docker inspection or just the existence of CID file + running status
  // Assuming rmCommand checks hb.cid or docker inspect
  
  // For this test, we assume the command checks for 'hb.cid' existence 
  // and maybe docker status. 
  // Let's assume we just check if hb.cid exists for now, or use docker ps.
  
  const gitStub = mockGit({
     "git rev-parse --verify task/123/1": { success: true },
     "git rev-parse --verify main": { success: true },
     "git log task/123/1 ^main --oneline": { success: true, stdout: "" },
     "docker inspect --format {{.State.Status}}|{{.State.StartedAt}} container-id": { success: true, stdout: "running|2024-01-01" },
  });

  try {

    const runDir = join(env.worktreesDir, "task-123-1");
    await ensureDir(runDir);
    // Simulate active run
    const runRunDir = getRunDir(runDir);
    await ensureDir(runRunDir);
    await Deno.writeTextFile(join(runRunDir, "hb.cid"), "container-id");
    
    // We might need to mock Docker.getContainerStatus if implemented,  
    // but usually existence of lock file/CID implies check needed.

    const args = parseArgs(["rm", "123/1"]);
    // Expect failure due to active run
    await assertRejects(() => rmCommand(args), Error, "EXIT_CALLED: 1");
    
    const calls = consoleError.calls.map(c => c.args.join(" ")).join("\n");
    assert(calls.includes("Run is currently active"), "Should log error message");

  } finally {
    exitStub.restore();
    consoleError.restore();
    gitStub.restore();
    env.teardown();
  }
});

Deno.test("hb rm <task>/<run> --force - removes active container", async () => {
  const env = setupTestEnv();
  // Mock active run
  const runDir = join(env.worktreesDir, "task-123-1");
  await ensureDir(runDir);
  const runRunDir = getRunDir(runDir);
  await ensureDir(runRunDir);
  await Deno.writeTextFile(join(runRunDir, "hb.cid"), "active-cid");

  const gitStub = mockGit({
     "git rev-parse --verify task/123/1": { success: true },
     [`git worktree remove ${runDir} --force`]: { success: true },
     "git branch -D task/123/1": { success: true },
     "docker inspect --format {{.State.Status}}|{{.State.StartedAt}} active-cid": { success: true, stdout: "running|2024" },
     "docker rm -f active-cid": { success: true }, // Expect force removal
  });

  try {
     const args = parseArgs(["rm", "123/1", "--force"]);
     await rmCommand(args);
  } finally {
     gitStub.restore();
     env.teardown();
  }
});

Deno.test("hb rm <task>/<run> - cleanup when worktree missing", async () => {
  const env = setupTestEnv();
  const exitStub = stub(Deno, "exit", (code) => { throw new Error(`EXIT_CALLED: ${code}`); });
  const gitStub = mockGit({
    "git rev-parse --verify task/123/1": { success: true },
    "git rev-parse --verify main": { success: true },
    "git log task/123/1 ^main --oneline": { success: true, stdout: "" },
    "git branch -d task/123/1": { success: true },
  });

  try {
    // Note: We DO NOT create the worktree directory here
    const args = parseArgs(["rm", "123/1"]);
    await rmCommand(args);
  } finally {
    exitStub.restore();
    gitStub.restore();
    env.teardown();
  }
});


// --- Behavior 2: Full Task Removal ---

Deno.test("hb rm <task> - remove task and all runs", async () => {
  const env = setupTestEnv();
  const gitStub = mockGit({
    // List runs
    "git branch --list task/123/*": { success: true, stdout: "  task/123/1\n+ task/123/2" },
    
    // Run 1
    "git rev-parse --verify task/123/1": { success: true },
    "git log task/123/1 ^main --oneline": { success: true, stdout: "" },
    [`git worktree remove ${join(env.worktreesDir, "task-123-1")} --force`]: { success: true },
    "git branch -D task/123/1": { success: true },
    // Run 2
    "git rev-parse --verify task/123/2": { success: true },
    "git log task/123/2 ^main --oneline": { success: true, stdout: "" },
    [`git worktree remove ${join(env.worktreesDir, "task-123-2")} --force`]: { success: true },
    "git branch -D task/123/2": { success: true },
    
    "git rev-parse --verify main": { success: true },

    // Image removal
    "docker rmi hyperbranch-run:123": { success: true },
  });

  try {
    // Setup task file and runs
    await Deno.writeTextFile(join(env.tasksDir, "task-123.md"), "# Task 123");
    await ensureDir(join(env.worktreesDir, "task-123-1"));
    await ensureDir(join(env.worktreesDir, "task-123-2"));

    const args = parseArgs(["rm", "123"]);
    await rmCommand(args);

    // Verify task file deleted
    await assertRejects(() => Deno.stat(join(env.tasksDir, "task-123.md")));
    
  } finally {
    gitStub.restore();
    env.teardown();
  }
});

Deno.test("hb rm <task> - abort on dirty run", async () => {
  const env = setupTestEnv();
  const exitStub = stub(Deno, "exit", (code) => { throw new Error(`EXIT_CALLED: ${code}`); });
  const gitStub = mockGit({
    "git branch --list task/123/*": { success: true, stdout: "task/123/1\ntask/123/2" },
    "git rev-parse --verify main": { success: true },
    // Run 1 Clean
    "git rev-parse --verify task/123/1": { success: true },
    "git log task/123/1 ^main --oneline": { success: true, stdout: "" },
    // Run 2 Dirty
    "git rev-parse --verify task/123/2": { success: true },
    "git log task/123/2 ^main --oneline": { success: true, stdout: "dirty" },
  });

  try {
    await Deno.writeTextFile(join(env.tasksDir, "task-123.md"), "# Task 123");
    await ensureDir(join(env.worktreesDir, "task-123-1"));
    await ensureDir(join(env.worktreesDir, "task-123-2"));

    const args = parseArgs(["rm", "123"]);
    await assertRejects(() => rmCommand(args), Error, "EXIT_CALLED: 1");

    // Verify task file STILL exists
    await Deno.stat(join(env.tasksDir, "task-123.md"));
  } finally {
    exitStub.restore();
    gitStub.restore();
    env.teardown();
  }
});

Deno.test("hb rm <task> --force - remove everything despite dirty/active", async () => {
  const env = setupTestEnv();
  const gitStub = mockGit({
    "git branch --list task/123/*": { success: true, stdout: "task/123/1" },
    "git rev-parse --verify task/123/1": { success: true },
    // Even if log check is skipped or fails, force should proceed
    [`git worktree remove ${join(env.worktreesDir, "task-123-1")} --force`]: { success: true },
    "git branch -D task/123/1": { success: true },
    "docker rm -f cid": { success: true },
    "docker rmi -f hyperbranch-run:123": { success: true },
  });

  try {
    await Deno.writeTextFile(join(env.tasksDir, "task-123.md"), "# Task 123");
    await ensureDir(join(env.worktreesDir, "task-123-1"));
    // Active run
    const runRunDir = getRunDir(join(env.worktreesDir, "task-123-1"));
    await ensureDir(runRunDir);
    await Deno.writeTextFile(join(runRunDir, "hb.cid"), "cid");

    const args = parseArgs(["rm", "123", "--force"]);
    await rmCommand(args);

    await assertRejects(() => Deno.stat(join(env.tasksDir, "task-123.md")));
  } finally {
    gitStub.restore();
    env.teardown();
  }
});

// --- Behavior 3: List Candidates ---

Deno.test("hb rm (no args) - list clean inactive candidates", async () => {
  const env = setupTestEnv();
  const consoleLog = stub(console, "log");
  const exitStub = stub(Deno, "exit", () => { throw new Error("EXIT"); }); // Stub exit
  
  const gitStub = mockGit({
    "git rev-parse --verify main": { success: true },
    // Run 1: Clean
    "git rev-parse --verify task/123/1": { success: true },
    "git log task/123/1 ^main --oneline": { success: true, stdout: "" },
    // Run 2: Dirty
    "git rev-parse --verify task/123/2": { success: true },
    "git log task/123/2 ^main --oneline": { success: true, stdout: "dirty" },
  });

  try {
    // Create Task File (to avoid loadTask exit)
    await Deno.writeTextFile(join(env.tasksDir, "task-123.md"), "# Task 123");

    // Run 1 (Clean, Inactive)
    await ensureDir(join(env.worktreesDir, "task-123-1"));
    // Run 2 (Dirty, Inactive)
    await ensureDir(join(env.worktreesDir, "task-123-2"));
    // Run 3 (Active)
    const run3Dir = join(env.worktreesDir, "task-123-3");
    await ensureDir(run3Dir);
    const run3RunDir = getRunDir(run3Dir);
    await ensureDir(run3RunDir);
    await Deno.writeTextFile(join(run3RunDir, "hb.cid"), "cid");

    const args = parseArgs(["rm"]);
    await rmCommand(args);

    // Assert output
    const calls = consoleLog.calls.map((c) => c.args.join(" ")).filter(m => !m.includes("[MockGit]")).join("\n");
    assertEquals(calls.includes("123/1"), true, "Should list clean run");
    assertEquals(calls.includes("123/2"), false, "Should not list dirty run");
    assertEquals(calls.includes("123/3"), false, "Should not list active run");

  } finally {
    consoleLog.restore();
    gitStub.restore();
    env.teardown();
  }
});

// --- Behavior 4: Sweep ---

Deno.test("hb rm --sweep - cleans inactive/merged runs", async () => {
  const env = setupTestEnv();
  const run1Dir = join(env.worktreesDir, "task-123-1");
  const run2Dir = join(env.worktreesDir, "task-123-2");
  
  const gitStub = mockGit({
    "git rev-parse --verify main": { success: true },
    
    // Run 1: Clean, Merged
    [`[${run1Dir}] git status --porcelain`]: { success: true, stdout: "" }, // Clean
    "git rev-parse --verify task/123/1": { success: true },
    "git rev-parse --verify task/123": { success: false }, // Base
    "git branch --merged main": { success: true, stdout: "  main\n+ task/123/1" },
    
    // Run 2: Dirty
    [`[${run2Dir}] git status --porcelain`]: { success: true, stdout: "M dirty.txt" }, // Dirty
    
    // Execution
    [`git worktree remove ${run1Dir} --force`]: { success: true },
    "git branch -D task/123/1": { success: true },
    
    // Worktree prune
    "git worktree prune": { success: true },
  });

  try {
    // 1. Clean Run
    await ensureDir(run1Dir);
    // 2. Dirty Run
    await ensureDir(run2Dir);

    const args = parseArgs(["rm", "--sweep"]);
    await rmCommand(args);

    // Verify Run 1 removed (mock call asserted implicitly by absence of error)
    // Run 2 should be skipped (dirty)
  } finally {
    gitStub.restore();
    env.teardown();
  }
});

Deno.test("hb rm --sweep --force - warns and ignores force", async () => {
  const env = setupTestEnv();
  const consoleWarn = stub(console, "warn");
  const run2Dir = join(env.worktreesDir, "task-123-2"); // Dirty run
  
  const gitStub = mockGit({
    "git rev-parse --verify main": { success: true },
    
    // Run 2: Dirty (should be skipped even with force)
    [`[${run2Dir}] git status --porcelain`]: { success: true, stdout: "M dirty.txt" },
    
    "git worktree prune": { success: true },
  });

  try {
    // 2. Dirty Run
    await ensureDir(run2Dir);

    const args = parseArgs(["rm", "--sweep", "--force"]);
    await rmCommand(args);

    // Verify Warning
    const warns = consoleWarn.calls.map(c => c.args.join(" ")).join("\n");
    assert(warns.includes("Warning: --force is ignored when using --sweep"), "Should warn user");
    
    // Verify run was NOT removed (implicit by mockGit not receiving remove command)

  } finally {
    consoleWarn.restore();
    gitStub.restore();
    env.teardown();
  }
});

Deno.test("hb rm multiple targets", async () => {
  const env = setupTestEnv();
  const gitStub = mockGit({
    // Run 1
    [`git worktree remove ${join(env.worktreesDir, "task-123-1")}`]: { success: true },
    "git rev-parse --verify task/123/1": { success: true },
    "git log task/123/1 ^main --oneline": { success: true, stdout: "" },
    "git branch -d task/123/1": { success: true },
    "git rev-parse --verify main": { success: true },

    // Run 2
    [`git worktree remove ${join(env.worktreesDir, "task-123-2")}`]: { success: true },
    "git rev-parse --verify task/123/2": { success: true },
    "git log task/123/2 ^main --oneline": { success: true, stdout: "" },
    "git branch -d task/123/2": { success: true },
  });

  try {
    await ensureDir(join(env.worktreesDir, "task-123-1"));
    await ensureDir(join(env.worktreesDir, "task-123-2"));

    const args = parseArgs(["rm", "123/1", "123/2"]);
    await rmCommand(args);

  } finally {
    gitStub.restore();
    env.teardown();
  }
});
