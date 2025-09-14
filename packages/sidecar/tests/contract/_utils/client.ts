import { testClient } from "hono/testing";
import app from "../../../src/index";
import type { AppType } from "../../../src/index";

// Create a fully type-safe test client based on server routes
export const client = testClient<AppType>(app);
