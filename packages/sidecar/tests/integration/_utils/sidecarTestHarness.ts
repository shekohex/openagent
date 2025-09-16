import { testClient } from "hono/testing";
import app from "../../../src";

export function getSidecarTestClient() {
  return testClient(app);
}
