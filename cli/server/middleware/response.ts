import { MiddlewareHandler } from "hono";

export const responseMiddleware: MiddlewareHandler = async (c, next) => {
  const originalJson = c.json;
  // @ts-ignore: Overriding c.json to wrap response
  c.json = (data: unknown, status?: number, headers?: Record<string, string>) => {
    const wrapped = {
      success: true,
      data,
      error: null,
    };
    // @ts-ignore: avoiding complex type issues with overriding c.json
    return originalJson.call(c, wrapped, status, headers);
  };
  await next();
};
