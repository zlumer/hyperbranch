import { assertEquals, assertExists } from "@std/assert";
import app from "../server/main.ts";

// Set up environment for tests
const API_KEY = Deno.env.get("HB_API_KEY") || "test-api-key";
if (!Deno.env.get("HB_API_KEY")) {
    Deno.env.set("HB_API_KEY", API_KEY);
}

// Create a temporary directory for tasks
const tempDir = await Deno.makeTempDir({ prefix: "hb-test-tasks-" });
Deno.env.set("HB_TASKS_DIR", tempDir);

console.log(`Using temporary tasks directory: ${tempDir}`);

Deno.test("Server Integration Tests", async (t) => {
    let createdTaskId: string;

    await t.step("GET /tasks - initially empty", async () => {
        const res = await app.request("/tasks", {
            headers: { "X-API-Key": API_KEY },
        });
        assertEquals(res.status, 200);
        const tasks = await res.json();
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
        const task = await res.json();
        assertExists(task.id);
        
        createdTaskId = task.id;
        assertEquals(task.body.includes("# Test Task"), true);
    });

    await t.step("GET /tasks - should list created task", async () => {
        const res = await app.request("/tasks", {
            headers: { "X-API-Key": API_KEY },
        });
        assertEquals(res.status, 200);
        const tasks = await res.json();
        assertEquals(tasks.length, 1);
        assertEquals(tasks[0].id, createdTaskId);
    });

    await t.step("GET /tasks/:id - get created task", async () => {
        const res = await app.request(`/tasks/${createdTaskId}`, {
            headers: { "X-API-Key": API_KEY },
        });
        assertEquals(res.status, 200);
        const task = await res.json();
        assertEquals(task.id, createdTaskId);
    });
    
    // Cleanup
    await Deno.remove(tempDir, { recursive: true });
});
