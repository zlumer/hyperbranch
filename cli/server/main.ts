import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import { corsMiddleware } from "./middleware/cors.ts";
import tasksRoutes from "./routes/tasks.ts";

// Generate API key if not set
export function ensureApiKey() {
  if (!Deno.env.get("HB_API_KEY")) {
    const key = crypto.randomUUID();
    Deno.env.set("HB_API_KEY", key);
    console.log(`Generated HB_API_KEY: ${key}`);
    console.log("Set this in your client or environment to authenticate.");
  } else {
    console.log("Using HB_API_KEY from environment.");
  }
}

const app = new Hono();

// Global Middleware
app.use("*", corsMiddleware);
// app.use("*", authMiddleware);

// Error Handling
app.onError(errorHandler);
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Routes
// Mount tasks routes at /tasks
app.route("/tasks", tasksRoutes);

// Start Server
const port = parseInt(Deno.env.get("PORT") || "8000");

// Check if we are being run directly
if (import.meta.main) {
  ensureApiKey();
  console.log(`Server starting on http://localhost:${port}`);
  Deno.serve({ port }, app.fetch);
}

export default app;
