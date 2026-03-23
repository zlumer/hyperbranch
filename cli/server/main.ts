import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import { corsMiddleware } from "./middleware/cors.ts";
import { router } from "./router.ts";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ZodSmartCoercionPlugin } from "@orpc/zod";
import { ORPCError } from "@orpc/server";

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
const port = parseInt(Deno.env.get("PORT") || "8000");

// Check if we are being run directly
if (import.meta.main) {
  ensureApiKey();
  console.log(`Server starting on http://localhost:${port}`);
  Deno.serve({ port }, app.fetch);
}

export default app;
