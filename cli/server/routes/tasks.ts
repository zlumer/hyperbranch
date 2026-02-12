import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import { exists } from "@std/fs/exists";
import * as Tasks from "../../services/tasks.ts";
import * as Runs from "../../services/runs.ts";
import { getRunBranchName } from "../../utils/branch-naming.ts";

const app = new Hono();

// List tasks
app.get("/", async (c) => {
  const tasks = await Tasks.list();
  return c.json(tasks);
});

// Create task
app.post("/", async (c) => {
  const body = await c.req.json();
  const title = body.title;
  const parentId = body.parentId;

  if (!title) {
    throw new Error("Title is required");
  }

  const task = await Tasks.create(title, parentId);
  return c.json(task, 201);
});

// Get task
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const task = await Tasks.get(id);
  return c.json(task);
});

// Update task
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  // Valid fields for update are in TaskFile['frontmatter'] + body
  // The service expects { body?: string, ...frontmatter }
  await Tasks.update(id, body);

  // Return updated task
  const updated = await Tasks.get(id);
  return c.json(updated);
});

// Delete task
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await Tasks.remove(id);
  return c.json(null);
});

// Run task
app.post("/:id/run", async (c) => {
  const id = c.req.param("id");
  
  const result = await Runs.run(id);
  return c.json(result);
});

// Stop task
app.post("/:id/stop", async (c) => {
  const id = c.req.param("id");
  await Runs.stop(id);
  return c.json({ message: "Task stopped" });
});

// WebSocket Logs
app.get(
  "/:id/logs",
  upgradeWebSocket((c) => {
    const id = c.req.param("id");
    let child: Deno.ChildProcess | null = null;
    let killed = false;

    return {
      onOpen: async (_evt, ws) => {
        try {
          // Get logs path (this might throw if task/run doesn't exist)
          // We do this inside onOpen so we can send error over WS if needed
          const logPath = await Runs.getLogsPath(id);

          if (!(await exists(logPath))) {
            ws.send(
              JSON.stringify({ error: `Log file not found: ${logPath}` }),
            );
            ws.close();
            return;
          }

          const cmd = new Deno.Command("tail", {
            args: ["-f", "-n", "+1", logPath],
            stdout: "piped",
            stderr: "piped",
          });

          child = cmd.spawn();

          // Stream stdout
          (async () => {
            const stdout = child?.stdout;
            if (!stdout) return;

            const decoder = new TextDecoder();
            for await (const chunk of stdout) {
              if (killed) break;
              const text = decoder.decode(chunk);
              // Split by newline to send lines
              const lines = text.split("\n");
              for (const line of lines) {
                // Only send non-empty lines or send all?
                // "tail" output might be buffered.
                // Requirement: "Send lines as { data: string }"
                if (line) {
                  ws.send(JSON.stringify({ data: line }));
                }
              }
            }
          })();

          // Stream stderr too? Usually logs are in stdout/stderr redirected to file.
          // If we tail the file, we get what's in the file.
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ws.send(JSON.stringify({ error: msg }));
          ws.close();
        }
      },
      onClose: () => {
        killed = true;
        if (child) {
          try {
            child.kill();
          } catch {
            // ignore if already dead
          }
        }
      },
    };
  }),
);

// List runs
app.get("/:id/runs", async (c) => {
  const id = c.req.param("id");
  const runs = await Runs.listRuns(id);
  return c.json(runs);
});

// Get run files
app.get("/:id/runs/:runId/files", async (c) => {
  const id = c.req.param("id");
  const runId = c.req.param("runId");
  const path = c.req.query("path") || "";

  let branch = runId;
  if (!isNaN(Number(runId))) {
    branch = getRunBranchName(id, Number(runId));
  }

  try {
    const result = await Runs.getRunFiles(branch, path);
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 404);
  }
});

// Merge run
app.post("/:id/runs/:runId/merge", async (c) => {
  const id = c.req.param("id");
  const runId = c.req.param("runId");
  const body = await c.req.json();
  const { strategy, cleanup } = body;

  let branch = runId;
  if (!isNaN(Number(runId))) {
    branch = getRunBranchName(id, Number(runId));
  }

  try {
    await Runs.mergeRun(id, branch, strategy, cleanup);
    return c.json({ message: "Merge successful" });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// WebSocket Logs for specific run
app.get(
  "/:id/runs/:runId/logs",
  upgradeWebSocket((c) => {
    const id = c.req.param("id");
    const runId = c.req.param("runId");

    let branch = runId;
    if (!isNaN(Number(runId))) {
      branch = getRunBranchName(id, Number(runId));
    }

    let child: Deno.ChildProcess | null = null;
    let killed = false;

    return {
      onOpen: async (_evt, ws) => {
        try {
          const logPath = await Runs.getLogsPathFromBranch(id, branch);

          if (!(await exists(logPath))) {
            ws.send(
              JSON.stringify({ error: `Log file not found: ${logPath}` }),
            );
            ws.close();
            return;
          }

          const cmd = new Deno.Command("tail", {
            args: ["-f", "-n", "+1", logPath],
            stdout: "piped",
            stderr: "piped",
          });

          child = cmd.spawn();

          (async () => {
            const stdout = child?.stdout;
            if (!stdout) return;
            const decoder = new TextDecoder();
            for await (const chunk of stdout) {
              if (killed) break;
              const text = decoder.decode(chunk);
              const lines = text.split("\n");
              for (const line of lines) {
                if (line) {
                  ws.send(JSON.stringify({ data: line }));
                }
              }
            }
          })();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ws.send(JSON.stringify({ error: msg }));
          ws.close();
        }
      },
      onClose: () => {
        killed = true;
        if (child) {
          try {
            child.kill();
          } catch {}
        }
      },
    };
  }),
);

export default app;
