import { MiddlewareHandler } from "hono";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const apiKey = Deno.env.get("HB_API_KEY");
  
  // If no API key is set on the server, we might want to warn or block.
  // Assuming main.ts ensures it is set.
  if (!apiKey) {
    console.error("HB_API_KEY not set in environment");
    return c.json({ success: false, data: null, error: "Server misconfigured" }, 500);
  }

  const key = c.req.header("X-API-Key");

  if (!key || key !== apiKey) {
    return c.json({ success: false, data: null, error: "Unauthorized" }, 401);
  }

  await next();
};
