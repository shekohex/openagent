import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTP_STATUS } from "../constants";

const app = new OpenAPIHono();

app.get("*", (c) => {
  return c.json(
    {
      success: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message: "Event routes not yet implemented",
      },
    },
    HTTP_STATUS.NOT_IMPLEMENTED
  );
});

export default app;
