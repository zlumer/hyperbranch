import { MiddlewareHandler } from "hono";

export const responseMiddleware: MiddlewareHandler = async (c, next) => {
  const originalJson = c.json as any;
  (c as any).json = (data: unknown, status?: number, headers?: Record<string, string>) => {
    const wrapped = {
      success: true,
      data,
      error: null,
    };
    return originalJson.call(c, wrapped, status, headers);
  };
  await next();
};
