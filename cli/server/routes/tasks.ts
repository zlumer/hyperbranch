import { Hono, Context } from "hono";
import { upgradeWebSocket } from "hono/deno";
import * as Tasks from "../../services/tasks.ts";
import * as Runs from "../../services/runs.ts";
import { TaskId, RunId, parseTaskOrRunId } from "../../utils/id.ts";
import { createOpencodeClient } from "npm:@opencode-ai/sdk";

const app = new Hono();

function parseRouteIds(idStr: string, runIdStr: string) {
  const taskId = TaskId.from(idStr);
  let runId = RunId.fromString(runIdStr);
  if (!runId && taskId && !isNaN(Number(runIdStr))) {
    runId = taskId.toRunId(Number(runIdStr));
  }
  return { taskId, runId };
}

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
  const description = body.description;
  const status = body.status;

  if (!title) {
    throw new Error("Title is required");
  }

  const task = await Tasks.create(title, parentId, description, status);
  return c.json(task, 201);
});

// Get task
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const taskId = TaskId.from(id);
  if (!taskId)
	return c.json({ error: "Invalid task ID" }, 400);
  const task = await Tasks.get(taskId);
  return c.json(task);
});

// Update task
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const taskId = TaskId.from(id);
  if (!taskId)
	return c.json({ error: "Invalid task ID" }, 400);
  const body = await c.req.json();
  await Tasks.update(taskId, body);
  const updated = await Tasks.get(taskId);
  return c.json(updated);
});

// Delete task
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const taskId = TaskId.from(id);
  if (!taskId)
	return c.json({ error: "Invalid task ID" }, 400);
  await Tasks.remove(taskId);
  return c.json(null);
});

// Run task
app.post("/:id/run", async (c) => {
  const id = c.req.param("id");
  const taskId = TaskId.from(id);
  if (!taskId) return c.json({ error: "Invalid task ID" }, 400);
  const body = await c.req.json().catch(() => ({})); 

  const result = await Runs.run(taskId, body);
  
  if (body.prompt) {
    // Start background routine for prompt injection
    (async () => {
      const { runId, port } = result;
      const { prompt, agentMode } = body;
      const timeout = 120000; // 2 minutes
      const startTime = Date.now();
      let healthy = false;

      while (Date.now() - startTime < timeout) {
        try {
          const res = await fetch(`http://localhost:${port}/global/health`);
          if (res.ok) {
            const data = await res.json();
            if (data.healthy) {
              healthy = true;
              break;
            }
          }
        } catch (_) {
          // ignore network errors
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!healthy) {
        console.error(`[run ${runId}] Health check timeout.`);
        const runObj = RunId.fromString(runId);
        if (runObj) await Runs.stopRun(runObj).catch(() => {});
        return;
      }

      try {
        const client = createOpencodeClient({ baseUrl: `http://localhost:${port}` });
        
        // Create session
        const session = await client.session.create({});
        if (session.error) {
          throw new Error(`Session create error: ${JSON.stringify(session.error)}`);
        }
        
        const sessionId = session.data.id;
        
        // Inject prompt
        const promptRes = await client.session.prompt({
          path: { id: sessionId },
          body: {
            agent: agentMode || "build",
            parts: [{ type: "text", text: prompt }]
          }
        });
        
        if (promptRes.error) {
          throw new Error(`Prompt injection error: ${JSON.stringify(promptRes.error)}`);
        }
        
        console.log(`[run ${runId}] Successfully injected prompt.`);
      } catch (e) {
        console.error(`[run ${runId}] SDK prompt injection failed:`, e);
        const runObj = RunId.fromString(runId);
        if (runObj) await Runs.stopRun(runObj).catch(() => {});
      }
    })();
  }

  return c.json(result);
});

// Stop task
app.post("/:id/stop", async (c) => {
  const idStr = c.req.param("id");
  const parsed = parseTaskOrRunId(idStr);
  
  if (!parsed) {
    return c.json({ error: "Invalid ID format" }, 400);
  }

  let runIdToStop: RunId | undefined;

  if (parsed.hasRunIndex && parsed.runIndex !== undefined) {
    runIdToStop = RunId.from(parsed);
  } else {
    const taskId = new TaskId(parsed.taskId);
    runIdToStop = await Runs.getLatestRunId(taskId) || undefined;
  }
  
  if (!runIdToStop) {
    return c.json({ error: "No active runs found to stop for task" }, 404);
  }

  try {
    await Runs.stopRun(runIdToStop);
    return c.json({ message: "Task stopped" });
  } catch (e) {
    const error = e as Error;
    return c.json({ error: error.message }, 400);
  }
});

// Resume task run
app.post("/:id/runs/:runId/resume", async (c) => {
  const { runId } = parseRouteIds(c.req.param("id"), c.req.param("runId"));
  if (!runId) return c.json({ error: "Invalid run ID" }, 400);

  try {
    await Runs.resumeRun(runId);
    return c.json({ message: "Run resumed" });
  } catch (e) {
    const error = e as Error;
    return c.json({ error: error.message }, 400);
  }
});

function createLogStreamHandler(getRunId: (c: Context) => Promise<RunId | null>) {
  return upgradeWebSocket((c) => {
    let child: Deno.ChildProcess | null = null;
    let killed = false;

    return {
      onOpen: async (_evt, ws) => {
        try {
          const runId = await getRunId(c);
          if (!runId) {
             ws.send(JSON.stringify({ error: "Run not found" }));
             ws.close();
             return;
          }

          // Start log stream
          child = await Runs.getLogsStream(runId, true); // follow=true
          
          const pipeStream = async (stream: ReadableStream<Uint8Array>) => {
              const decoder = new TextDecoder();
              for await (const chunk of stream) {
                  if (killed) break;
                  const text = decoder.decode(chunk);
                  const lines = text.split("\n");
                  for (const line of lines) {
                      if (line) {
                          ws.send(JSON.stringify({ data: line }));
                      }
                  }
              }
          };

          // Pipe both stdout and stderr
          if (child.stdout) pipeStream(child.stdout).catch(() => {});
          if (child.stderr) pipeStream(child.stderr).catch(() => {});
          
          // Wait for exit?
          // If we await status, we block onOpen? No, it's async.
          const status = await child.status;
          if (!killed) {
             if (!status.success) {
                 ws.send(JSON.stringify({ error: `Log process exited with code ${status.code}` }));
             }
             ws.close();
          }

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
  });
}

// WebSocket Logs
app.get(
  "/:id/logs",
  createLogStreamHandler(async (c) => {
      const taskId = TaskId.from(c.req.param("id"));
      if (!taskId) return null;
      // Try to find latest run for task
      return await Runs.getLatestRunId(taskId);
  })
);

// List runs
app.get("/:id/runs", async (c) => {
  const id = c.req.param("id");
  const taskId = TaskId.from(id);
  if (!taskId) return c.json({ error: "Invalid task ID" }, 400);
  const runs = await Runs.listRuns(taskId);
  return c.json(runs);
});

// Get run files
app.get("/:id/runs/:runId/files", async (c) => {
  const { runId } = parseRouteIds(c.req.param("id"), c.req.param("runId"));
  const path = c.req.query("path") || "";
  if (!runId) return c.json({ error: "Invalid IDs" }, 400);

  try {
    const result = await Runs.getRunFiles(runId.toBranchName(), path);
    return c.json(result);
  } catch (e) {
    const error = e as Error;
    return c.json({ error: error.message }, 404);
  }
});

// Merge run
app.post("/:id/runs/:runId/merge", async (c) => {
  const { runId } = parseRouteIds(c.req.param("id"), c.req.param("runId"));
  const body = await c.req.json();
  const { strategy, cleanup } = body;
  if (!runId) return c.json({ error: "Invalid IDs" }, 400);

  try {
    await Runs.mergeRun(runId, strategy, cleanup);
    return c.json({ message: "Merge successful" });
  } catch (e) {
    const error = e as Error;
    return c.json({ error: error.message }, 400);
  }
});

// Pull run
app.post("/:id/runs/:runId/pull", async (c) => {
  const { runId } = parseRouteIds(c.req.param("id"), c.req.param("runId"));
  const body = await c.req.json().catch(() => ({}));
  const { strategy } = body;
  if (!runId) return c.json({ error: "Invalid IDs" }, 400);

  try {
    await Runs.pullRun(runId, strategy);
    return c.json({ message: "Pull successful" });
  } catch (e) {
    const error = e as Error;
    return c.json({ error: error.message }, 400);
  }
});

// Get run port
app.get("/:id/runs/:runId/port", async (c) => {
  const { runId } = parseRouteIds(c.req.param("id"), c.req.param("runId"));
  if (!runId) return c.json({ error: "Invalid IDs" }, 400);

  try {
    const port = await Runs.getHostPort(runId, 4096);
    return c.json({ port });
  } catch (e) {
    const error = e as Error;
    return c.json({ error: error.message }, 404);
  }
});

// Delete run
app.delete("/:id/runs/:runId", async (c) => {
  const { runId } = parseRouteIds(c.req.param("id"), c.req.param("runId"));
  const force = c.req.query("force") === "true";
  if (!runId) return c.json({ error: "Invalid IDs" }, 400);

  try {
    await Runs.removeRun(runId, force);
    return c.json({ message: "Run removed" });
  } catch (e) {
    const error = e as Error;
    return c.json({ error: error.message }, 400);
  }
});

// WebSocket Logs for specific run
app.get(
  "/:id/runs/:runId/logs",
  createLogStreamHandler(async (c) => {
      const { runId } = parseRouteIds(c.req.param("id"), c.req.param("runId"));
      return runId || null;
  })
);

// WebSocket Status for runs
app.get(
  "/:id/runs/status",
  upgradeWebSocket((c) => {
    let intervalId: number;
    return {
      onOpen: async (_evt, ws) => {
        const taskId = TaskId.from(c.req.param("id"));
        if (!taskId) { ws.close(); return; }

        // Send initial state
        try {
          const runs = await Runs.listRuns(taskId);
          ws.send(JSON.stringify({ type: "runs_update", data: runs }));
        } catch (e) {
          // ignore
        }

        intervalId = setInterval(async () => {
          try {
            const runs = await Runs.listRuns(taskId);
            ws.send(JSON.stringify({ type: "runs_update", data: runs }));
          } catch (e) {
             // ignore
          }
        }, 2000);
      },
      onClose: () => {
        clearInterval(intervalId);
      },
    };
  })
);

export default app;