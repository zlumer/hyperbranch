import { Hono } from "hono"
import { upgradeWebSocket } from "hono/deno"
import { exists } from "@std/fs/exists"
import * as Tasks from "../../services/tasks.ts"
import * as Runs from "../../services/runs.ts"

const app = new Hono()

// List tasks
app.get("/", async (c) => {
  const tasks = await Tasks.list()
  return c.json(tasks)
})

// Create task
app.post("/", async (c) => {
  const body = await c.req.json()
  const title = body.title
  const parentId = body.parentId
  
  if (!title) {
      throw new Error("Title is required")
  }

  const task = await Tasks.create(title, parentId)
  return c.json(task, 201)
})

// Get task
app.get("/:id", async (c) => {
  const id = c.req.param("id")
  const task = await Tasks.get(id)
  return c.json(task)
})

// Update task
app.patch("/:id", async (c) => {
  const id = c.req.param("id")
  const body = await c.req.json()
  // Valid fields for update are in TaskFile['frontmatter'] + body
  // The service expects { body?: string, ...frontmatter }
  await Tasks.update(id, body)
  
  // Return updated task
  const updated = await Tasks.get(id)
  return c.json(updated)
})

// Delete task
app.delete("/:id", async (c) => {
  const id = c.req.param("id")
  await Tasks.remove(id)
  return c.json(null);
})

// Run task
app.post("/:id/run", async (c) => {
  const id = c.req.param("id")
  const body = await c.req.json().catch(() => ({})); // Optional body
  
  const result = await Runs.run(id, body)
  return c.json(result)
})

// Stop task
app.post("/:id/stop", async (c) => {
  const id = c.req.param("id")
  await Runs.stop(id)
  return c.json({ message: "Task stopped" })
})

// WebSocket Logs
app.get("/:id/logs", upgradeWebSocket((c) => {
  const id = c.req.param("id")
  let child: Deno.ChildProcess | null = null
  let killed = false

  return {
    onOpen: async (_evt, ws) => {
      try {
        // Get logs path (this might throw if task/run doesn't exist)
        // We do this inside onOpen so we can send error over WS if needed
        const logPath = await Runs.getLogsPath(id)

        if (!(await exists(logPath))) {
          ws.send(JSON.stringify({ error: `Log file not found: ${logPath}` }))
          ws.close()
          return
        }

        const cmd = new Deno.Command("tail", {
          args: ["-f", "-n", "+1", logPath],
          stdout: "piped",
          stderr: "piped",
        })

        child = cmd.spawn();

        // Stream stdout
        (async () => {
          const stdout = child?.stdout
          if (!stdout) return

          const decoder = new TextDecoder()
          for await (const chunk of stdout) {
            if (killed) break
            const text = decoder.decode(chunk)
            // Split by newline to send lines
            const lines = text.split("\n")
            for (const line of lines) {
                // Only send non-empty lines or send all? 
                // "tail" output might be buffered.
                // Requirement: "Send lines as { data: string }"
                if (line) {
                   ws.send(JSON.stringify({ data: line }))
                }
            }
          }
        })()
        
        // Stream stderr too? Usually logs are in stdout/stderr redirected to file.
        // If we tail the file, we get what's in the file.
        
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        ws.send(JSON.stringify({ error: msg }))
        ws.close()
      }
    },
    onClose: () => {
      killed = true
      if (child) {
        try {
          child.kill()
        } catch {
          // ignore if already dead
        }
      }
    },
  }
}))

export default app
