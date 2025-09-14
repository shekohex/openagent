import { cors } from "hono/cors";
import { config } from "../config";

export const security = () => {
  return cors({
    origin: [config.corsOrigin],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86_400,
  });
};
