import { describe, it, expect, vi, afterEach } from "vitest"
import * as Git from "./git.ts"
import { TaskId } from "./id.ts"
import * as execaModule from "execa"

vi.mock("execa", () => ({
  execa: vi.fn()
}))

// Mock execa to avoid actual git execution
function mockGit(outputs: Record<string, { stdout?: string, stderr?: string, success: boolean }>) {
  return vi.mocked(execaModule.execa).mockImplementation((cmd, args, options) => {
    if (cmd !== "git") {
      throw new Error(`Unexpected command: ${cmd}`);
    }
    const key = (args || []).join(" ");
    
    let result = outputs[key];
    
    if (!result) {
      for (const k in outputs) {
        if (k.endsWith("*") && key.startsWith(k.slice(0, -1))) {
          result = outputs[k];
          break;
        }
      }
    }

    if (!result) {
      return Promise.reject(new Error(`Unmocked command: ${key}`)) as any;
    }

    if (!result.success) {
      const error: any = new Error(result.stderr || "");
      error.stderr = result.stderr || "";
      return Promise.reject(error) as any;
    }

    return Promise.resolve({
      stdout: result.stdout || "",
      stderr: result.stderr || ""
    }) as any;
  });
}

describe("Git utils", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("getNextRunBranch - increments index", async () => {
    const task = new TaskId("123");
    const prefix = task.runBranchPrefix();
    mockGit({
      [`branch -a --list *${prefix}*`]: { 
        success: true, 
        stdout: `  ${prefix}1\n  ${prefix}2\n` 
      }
    });
    const branch = await Git.getNextRunBranch(task);
    expect(branch.toBranchName()).toBe(task.toRunId(3).toBranchName());
  });

  it("getNextRunBranch - starts at 1", async () => {
    const task = new TaskId("456");
    const prefix = task.runBranchPrefix();
    mockGit({
      [`branch -a --list *${prefix}*`]: { success: true, stdout: "" }
    });
    const branch = await Git.getNextRunBranch(task);
    expect(branch.toBranchName()).toBe(task.toRunId(1).toBranchName());
  });
})
