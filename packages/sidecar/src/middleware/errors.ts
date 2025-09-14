import type { Context, Next } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { HTTP_STATUS } from "../constants";

export function errorHandler() {
  return async (c: Context<{ Variables: RequestIdVariables }>, next: Next) => {
    try {
      await next();
    } catch (error) {
      const requestId = c.get("requestId");

      if (error instanceof Error) {
        return c.json(
          {
            success: false,
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: error.message,
              id: requestId,
            },
          },
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        );
      }

      return c.json(
        {
          success: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "An unknown error occurred",
            id: requestId,
          },
        },
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  };
}
