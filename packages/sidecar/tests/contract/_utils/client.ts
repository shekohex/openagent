import { testClient } from "hono/testing";
import app from "../../../src/index";

export const client = testClient(app);
