import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { corsMiddleware } from "./middleware/cors.js";
import { router } from "./router.js";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ZodSmartCoercionPlugin } from "@orpc/zod";
import { ORPCError } from "@orpc/server";

// Generate API key if not set
export function ensureApiKey() {
  if (!process.env.HB_API_KEY) {
    const key = crypto.randomUUID();
    process.env.HB_API_KEY = key;
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

// oRPC OpenAPI Handler
const orpcHandler = new OpenAPIHandler(router, {
  plugins: [new ZodSmartCoercionPlugin()],
  customErrorResponseBodyEncoder(error) {
    return {
      error: error.message || error.code,
      code: error.code,
    };
  },
});

// Error Handling
app.onError((err, c) => {
  if (err instanceof ORPCError) {
    return c.json(
      { error: err.message || err.code, code: err.code },
      (err.status as any) || 500
    );
  }
  return errorHandler(err, c);
});

app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Routes
app.all("/tasks", async (c) => {
  const { matched, response } = await orpcHandler.handle(c.req.raw, {
    prefix: "/tasks",
  });
  if (matched) return response;
  return c.json({ error: "Not Found" }, 404);
});

app.all("/tasks/*", async (c) => {
  const { matched, response } = await orpcHandler.handle(c.req.raw, {
    prefix: "/tasks",
  });
  if (matched) return response;
  return c.json({ error: "Not Found" }, 404);
});

// Start Server
const port = parseInt(process.env.PORT || "8000");

// Check if we are being run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.main) {
  ensureApiKey();
  console.log(`Server starting on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

export default app;
