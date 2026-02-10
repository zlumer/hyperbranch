import { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCode } from "hono/utils/http-status";

export const errorHandler: ErrorHandler = (err, c) => {
  console.error("Server Error:", err);

  let status: StatusCode = 500;
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
      error: message,
    },
    status
  );
};
