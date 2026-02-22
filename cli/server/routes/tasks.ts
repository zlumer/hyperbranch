import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import * as Tasks from "../../services/tasks.ts";
import * as Runs from "../../services/runs.ts";
import { getRunBranchName } from "../../utils/branch-naming.ts";
import { createOpencodeClient } from "npm:@opencode-ai/sdk";

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
  const task = await Tasks.get(id);
  return c.json(task);
});

// Update task
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  await Tasks.update(id, body);
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
  const body = await c.req.json().catch(() => ({})); 

  const result = await Runs.run(id, body);
  
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
        await Runs.stopRun(runId).catch(() => {});
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
        await Runs.stopRun(runId).catch(() => {});
      }
    })();
  }

  return c.json(result);
});

// Stop task
app.post("/:id/stop", async (c) => {
  const id = c.req.param("id");
  // Check if id is taskId or runId. 
  // Runs.stopRun expects runId.
  // If id is taskId, stop latest? Or maybe we require runId?
  // Previous implementation used Runs.stopRun(id).
  // If id is taskId, stopRun needs to handle it.
  // But Runs.stopRun calls parseRunId which fails if not branch format.
  
  // Let's assume if id is taskId, we find latest run.
  let runId = id;
  const latest = await Runs.getLatestRunId(id);
  if (latest) {
      runId = latest;
  }
  
  try {
    await Runs.stopRun(runId);
    return c.json({ message: "Task stopped" });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

function createLogStreamHandler(getRunId: (c: any) => Promise<string | null>) {
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
      const id = c.req.param("id");
      // Try to find latest run for task
      return await Runs.getLatestRunId(id);
  })
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

// Get run port
app.get("/:id/runs/:runId/port", async (c) => {
  const id = c.req.param("id");
  const runId = c.req.param("runId");
  
  let branch = runId;
  if (!isNaN(Number(runId))) {
    branch = getRunBranchName(id, Number(runId));
  }

  try {
    const port = await Runs.getHostPort(branch, 4096);
    return c.json({ port });
  } catch (e: any) {
    return c.json({ error: e.message }, 404);
  }
});

// Delete run
app.delete("/:id/runs/:runId", async (c) => {
  const id = c.req.param("id");
  const runId = c.req.param("runId");
  const force = c.req.query("force") === "true";

  let runIndex = Number(runId);
  if (isNaN(runIndex)) {
    const parsed = Runs.parseRunId(runId);
    runIndex = parsed.runIndex;
  }

  try {
    await Runs.removeRun(id, runIndex, force);
    return c.json({ message: "Run removed" });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// WebSocket Logs for specific run
app.get(
  "/:id/runs/:runId/logs",
  createLogStreamHandler(async (c) => {
      const id = c.req.param("id");
      const runId = c.req.param("runId");
      let branch = runId;
      if (!isNaN(Number(runId))) {
        branch = getRunBranchName(id, Number(runId));
      }
      return branch;
  })
);

// WebSocket Status for runs
app.get(
  "/:id/runs/status",
  upgradeWebSocket((c) => {
    let intervalId: number;
    return {
      onOpen: async (_evt, ws) => {
        const id = c.req.param("id");

        // Send initial state
        try {
          const runs = await Runs.listRuns(id);
          ws.send(JSON.stringify({ type: "runs_update", data: runs }));
        } catch (e) {
          // ignore
        }

        intervalId = setInterval(async () => {
          try {
            const runs = await Runs.listRuns(id);
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
