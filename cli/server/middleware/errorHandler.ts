import { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export const errorHandler: ErrorHandler = (err, c) => {
  console.error("Server Error:", err);

  let status = 500;
  let message = "Internal Server Error";

  if (err instanceof HTTPException) {
    status = err.status;
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message;
    // Simple heuristic for 404s from services
    if (message.toLowerCase().includes("not found")) {
      status = 404;
    }
  }

  return c.json(
    {
      success: false,
      data: null,
      error: message,
    },
    // @ts-ignore: status is compatible with ContentfulStatusCode
    status
  );
};
