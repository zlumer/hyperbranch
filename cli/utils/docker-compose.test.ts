
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import { isRunningService } from "./docker-compose.ts";

Deno.test("isRunningService - normal case", async () => {
  // deno-lint-ignore no-explicit-any
  const commandStub = stub(Deno, "Command", (_cmd: any, _options: any) => {
    return {
      output: () => Promise.resolve({
        success: true,
        code: 0,
        stdout: new TextEncoder().encode("container-id\n"),
        stderr: new Uint8Array(),
      }),
    } as unknown as Deno.Command;
  });

  try {
    const result = await isRunningService("/tmp", "compose.yml", "web");
    assertEquals(result, true);
    
    const call = commandStub.calls[0];
    const args = (call.args[1] as Deno.CommandOptions).args || [];
    assertEquals(args.includes("--status"), true);
    assertEquals(args.includes("running"), true);
  } finally {
    commandStub.restore();
  }
});

Deno.test("isRunningService - fallback case", async () => {
  let callCount = 0;
  // deno-lint-ignore no-explicit-any
  const commandStub = stub(Deno, "Command", (_cmd: any, _options: any) => {
    callCount++;
    if (callCount === 1) {
      return {
        output: () => Promise.reject(new Deno.errors.NotFound("Directory not found")),
      } as unknown as Deno.Command;
    }
    
    return {
      output: () => Promise.resolve({
        success: true,
        code: 0,
        stdout: new TextEncoder().encode("fallback-id\n"),
        stderr: new Uint8Array(),
      }),
    } as unknown as Deno.Command;
  });

  try {
    const result = await isRunningService("/non-existent", "compose.yml", "web", "my-project");
    assertEquals(result, true);
    
    const fallbackCall = commandStub.calls[1];
    const args = (fallbackCall.args[1] as Deno.CommandOptions).args || [];
    
    // Verify it uses docker compose with -p project
    assertEquals(args[0], "compose");
    assertEquals(args.includes("-p"), true);
    assertEquals(args[args.indexOf("-p") + 1], "my-project");
    assertEquals(args.includes("--status"), true);
    assertEquals(args.includes("running"), true);
    
  } finally {
    commandStub.restore();
  }
});
