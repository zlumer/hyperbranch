
import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import app from "../server/main.ts";

// Set up environment for tests
const API_KEY = Deno.env.get("HB_API_KEY") || "test-api-key";
if (!Deno.env.get("HB_API_KEY")) {
    Deno.env.set("HB_API_KEY", API_KEY);
}

// Create a temporary directory for tasks
const tempDir = await Deno.makeTempDir({ prefix: "hb-test-tasks-" });
Deno.env.set("HB_TASKS_DIR", tempDir);
Deno.env.set("HB_MOCK_GIT", "true");
Deno.env.set("HB_MOCK_RUNS", "true");

console.log(`Using temporary tasks directory: ${tempDir}`);

Deno.test("Server Integration Tests", async (t) => {
    let createdTaskId: string;

    await t.step("GET /tasks - initially empty", async () => {
        const res = await app.request("/tasks", {
            headers: { "X-API-Key": API_KEY },
        });
        assertEquals(res.status, 200);
        const json = await res.json();
        assertEquals(json.success, true);
        const tasks = json.data;
        assertEquals(Array.isArray(tasks), true);
        assertEquals(tasks.length, 0);
    });

    await t.step("POST /tasks - create a task", async () => {
        const res = await app.request("/tasks", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": API_KEY,
            },
            body: JSON.stringify({ title: "Test Task" }),
        });
        assertEquals(res.status, 201);
        const json = await res.json();
        assertEquals(json.success, true);
        const task = json.data;
        assertExists(task.id);
        
        createdTaskId = task.id;
        assertEquals(task.body.includes("# Test Task"), true);
    });

    await t.step("GET /tasks - should list created task", async () => {
        const res = await app.request("/tasks", {
            headers: { "X-API-Key": API_KEY },
        });
        assertEquals(res.status, 200);
        const json = await res.json();
        const tasks = json.data;
        assertEquals(tasks.length, 1);
        assertEquals(tasks[0].id, createdTaskId);
    });

    await t.step("GET /tasks/:id - get created task", async () => {
        const res = await app.request(`/tasks/${createdTaskId}`, {
            headers: { "X-API-Key": API_KEY },
        });
        assertEquals(res.status, 200);
        const json = await res.json();
        const task = json.data;
        assertEquals(task.id, createdTaskId);
    });

    await t.step("POST /tasks/:id/run - start a run (mocked)", async () => {
        const res = await app.request(`/tasks/${createdTaskId}/run`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": API_KEY,
            },
            body: JSON.stringify({}),
        });
        assertEquals(res.status, 200);
        const json = await res.json();
        const result = json.data;
        // Since we mocked runs.ts, we expect specific mock data
        assertEquals(result.runId, `run/${createdTaskId}/mock`);
        assertEquals(result.containerId, "mock-container-id");
    });

    await t.step("POST /tasks/:id/stop - stop a run (mocked)", async () => {
        const res = await app.request(`/tasks/${createdTaskId}/stop`, {
            method: "POST",
            headers: { "X-API-Key": API_KEY },
        });
        assertEquals(res.status, 200);
        const json = await res.json();
        assertEquals(json.data.message, "Task stopped");
    });
    
    // Cleanup
    await Deno.remove(tempDir, { recursive: true });
});
