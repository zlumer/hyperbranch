import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from '@hono/node-server/serve-static'
import { errorHandler } from "./middleware/errorHandler.js";
import { corsMiddleware } from "./middleware/cors.js";
import { router } from "./router.js";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ZodSmartCoercionPlugin } from "@orpc/zod";
import { ORPCError } from "@orpc/server";
import path from "path";

const app = new Hono();

// Global Middleware
app.use("*", corsMiddleware);

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
app.all("/api/tasks", async (c) => {
  const { matched, response } = await orpcHandler.handle(c.req.raw, {
    prefix: "/api/tasks",
  });
  if (matched) return response;
  return c.json({ error: "Not Found" }, 404);
});

app.all("/api/tasks/*", async (c) => {
  const { matched, response } = await orpcHandler.handle(c.req.raw, {
    prefix: "/api/tasks",
  });
  if (matched) return response;
  return c.json({ error: "Not Found" }, 404);
});

app.use("/*", serveStatic({ root: path.resolve(import.meta.dirname, "../../frontend/dist") }));

// Start Server
const port = parseInt(process.env.PORT || "8000");

// Check if we are being run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.main) {
  console.log(`Server starting on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

export default app;
