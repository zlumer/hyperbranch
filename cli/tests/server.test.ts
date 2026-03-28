import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fsPromises from "node:fs/promises";
import { join } from "node:path";
import app from "../server/main.js";
import z from "zod";

const TaskSchema = z.object({
	id: z.string(),
	body: z.string(),
});

describe.sequential("Server Integration Tests", () => {
    const API_KEY = process.env.HB_API_KEY || "test-api-key";
    let tempDir: string;
    let createdTaskId: string;

    beforeAll(async () => {
        if (!process.env.HB_API_KEY) {
            process.env.HB_API_KEY = API_KEY;
        }

        tempDir = await fsPromises.mkdtemp(join(process.cwd(), "hb-test-tasks-"));
        process.env.HB_TASKS_DIR = tempDir;

        console.log(`Using temporary tasks directory: ${tempDir}`);
    });

    afterAll(async () => {
        if (tempDir) {
            await fsPromises.rm(tempDir, { recursive: true, force: true });
        }
    });

    it("GET /tasks - initially empty", async () => {
        const res = await app.request("/tasks", {
            headers: { "X-API-Key": API_KEY },
        });
        expect(res.status).toBe(200);
        const tasks = await res.json();
        expect(Array.isArray(tasks)).toBe(true);
        expect(tasks).toHaveLength(0);
    });

    it("POST /tasks - create a task", async () => {
        const res = await app.request("/tasks", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": API_KEY,
            },
            body: JSON.stringify({ title: "Test Task" }),
        });
        expect(res.status).toBe(201);
        const task = TaskSchema.parse(await res.json());
        expect(task.id).toBeDefined();
        
        createdTaskId = task.id;
        expect(task.body.includes("# Test Task")).toBe(true);
    });

    it("GET /tasks - should list created task", async () => {
        const res = await app.request("/tasks", {
            headers: { "X-API-Key": API_KEY },
        });
        expect(res.status).toBe(200);
        const tasks = z.array(TaskSchema).parse(await res.json());
        expect(tasks).toHaveLength(1);
        expect(tasks[0].id).toBe(createdTaskId);
    });

    it("GET /tasks/:id - get created task", async () => {
        const res = await app.request(`/tasks/${createdTaskId}`, {
            headers: { "X-API-Key": API_KEY },
        });
        expect(res.status).toBe(200);
        const task = TaskSchema.parse(await res.json());
        expect(task.id).toBe(createdTaskId);
    });
    
    it("GET /tasks/:id/runs/:runId/port - not found", async () => {
        const res = await app.request(`/tasks/${createdTaskId}/runs/1/port`, {
            headers: { "X-API-Key": API_KEY },
        });
        expect(res.status).toBe(404);
        const data = z.object({
            error: z.string(),
        }).parse(await res.json());
        expect(data.error.includes("does not exist")).toBe(true);
    });

    it("DELETE /tasks/:id/runs/:runId - bad run", async () => {
        const res = await app.request(`/tasks/${createdTaskId}/runs/1`, {
            method: "DELETE",
            headers: { "X-API-Key": API_KEY },
        });
        expect(res.status).toBe(200);
        const data = z.object({
            message: z.string(),
        }).parse(await res.json());
        expect(data.message).toBe("Run removed");
    });
});
