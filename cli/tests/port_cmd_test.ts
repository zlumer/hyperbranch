import { assertEquals, assertRejects } from "@std/assert";
import { stub } from "@std/testing/mock";
import { _deps, getHostPort } from "../services/runs.ts";

Deno.test("Runs.getHostPort tests", async (t) => {
  
  await t.step("throws on invalid runId format", async () => {
    await assertRejects(
      async () => await getHostPort("invalid-id", 80),
      Error,
      "Invalid runId format: invalid-id"
    );
  });

  await t.step("throws if run-id does not exist", async () => {
    // Mock Git.branchExists to return false
    using _ = stub(_deps.Git, "branchExists", () => Promise.resolve(false));
    
    await assertRejects(
      async () => await getHostPort("hb/task/1", 80),
      Error,
      "Run ID 'hb/task/1' does not exist"
    );
  });

  await t.step("throws if run is not running", async () => {
    // Mock Git.branchExists to return true
    using _branchExists = stub(_deps.Git, "branchExists", () => Promise.resolve(true));
    // Mock Lifecycle.inspect to return status: stopped
    using _inspect = stub(_deps.Lifecycle, "inspect", () => Promise.resolve({ port: 0, status: "stopped" }));
    // We also need to mock Compose.isRunningAny inside Lifecycle?
    // Runs.getHostPort calls Lifecycle.getHostPort (which I haven't written yet).
    // But in my plan, I said I would add `getHostPort` to Lifecycle.
    // If I add `getHostPort` to Lifecycle, then Runs.getHostPort calls `Lifecycle.getHostPort`.
    // So I should mock `Lifecycle.getHostPort`.
    
    // However, currently `Lifecycle.getHostPort` does not exist. 
    // I should add it to the interface first or just mock it on `_deps.Lifecycle` assuming it will be there.
    // But TypeScript will complain if I stub a non-existent method.
    
    // For now, let's assume `Runs.getHostPort` implements the logic directly or calls `Lifecycle.inspect`.
    // In my plan: 
    // Runtime Layer Updates: Implement `getHostPort(ctx: RunContext, containerPort: number)`
    
    // So I need to add `getHostPort` to `Lifecycle` first before I can stub it properly in TS.
    // OR I can cast `_deps.Lifecycle` to `any`.
    
    // Let's rely on `Lifecycle.getHostPort` throwing "Run ... is not running".
    
    // Since I haven't added `getHostPort` to Lifecycle yet, I can't stub it safely.
    // But I can try casting.
    
    const lifecycleStub = stub(_deps.Lifecycle as any, "getHostPort", () => {
        throw new Error("Run 'hb/task/1' is not running");
    });
    
    try {
        await assertRejects(
          async () => await getHostPort("hb/task/1", 80),
          Error,
          "Run 'hb/task/1' is not running"
        );
    } finally {
        lifecycleStub.restore();
    }
  });

  await t.step("throws if port is not opened", async () => {
    using _branchExists = stub(_deps.Git, "branchExists", () => Promise.resolve(true));
    
    const lifecycleStub = stub(_deps.Lifecycle as any, "getHostPort", () => {
        throw new Error("Port 80 is not opened");
    });
    
    try {
        await assertRejects(
          async () => await getHostPort("hb/task/1", 80),
          Error,
          "Port 80 is not opened"
        );
    } finally {
        lifecycleStub.restore();
    }
  });

  await t.step("returns port if successful", async () => {
    using _branchExists = stub(_deps.Git, "branchExists", () => Promise.resolve(true));
    
    const lifecycleStub = stub(_deps.Lifecycle as any, "getHostPort", () => {
        return Promise.resolve(3000);
    });
    
    try {
        const port = await getHostPort("hb/task/1", 80);
        assertEquals(port, 3000);
    } finally {
        lifecycleStub.restore();
    }
  });

});
