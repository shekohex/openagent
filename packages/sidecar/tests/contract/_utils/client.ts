import { testClient } from "hono/testing";
import app from "@/index";

export const client = testClient(app);
