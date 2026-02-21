import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import * as GitClones from "../utils/git-clones.ts";
import { stub } from "@std/testing/mock";

// Helper to mock Deno.Command
function mockGitCommand(handler: (args: string[]) => string | Promise<string>) {
  // @ts-ignore: Stub types
  return stub(Deno, "Command", (cmd: string | URL, options?: Deno.CommandOptions) => {
    if (cmd !== "git") {
      throw new Error(`Unexpected command: ${cmd}`);
    }
    const args = options?.args || [];
    
    return {
      output: async () => {
        try {
          const stdout = await handler(args);
          return {
            success: true,
            code: 0,
            stdout: new TextEncoder().encode(stdout),
            stderr: new Uint8Array(),
          };
        } catch (e) {
          return {
            success: false,
            code: 1,
            stdout: new Uint8Array(),
            stderr: new TextEncoder().encode(String(e)),
          };
        }
      }
    } as unknown as Deno.Command;
  });
}

Deno.test("GitClones Integration", async (t) => {
  const tempDir = await Deno.makeTempDir({ prefix: "hb-test-git-clone-" });
  const cloneDir = join(tempDir, "clone");
  
  await ensureDir(tempDir);
  
  try {
      await t.step("creates clone using git clone with proper branch", async () => {
        const calledArgs: string[][] = [];
        const commandStub = mockGitCommand((args) => {
          calledArgs.push(args);
          return "";
        });

        try {
          await GitClones.createClone("hb/task1/1", "base", cloneDir, tempDir);
          
          assertEquals(calledArgs.length, 3);
          assertEquals(calledArgs[0], ["branch", "hb/task1/1", "base"]);
          assertEquals(calledArgs[1], ["clone", "-b", "hb/task1/1", "--single-branch", "--depth", "1", ".", cloneDir]);
          assertEquals(calledArgs[2], ["remote", "add", "hb-task1-1", cloneDir]);
        } finally {
          commandStub.restore();
        }
      });

  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
