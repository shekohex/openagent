import { expect, test } from "vitest";
import { client } from "./_utils/client";
import { isISO8601 } from "./_utils/matchers";

test("GET /internal/ready returns 200 with expected shape", async () => {
  const res = await client.internal.ready.$get();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/i);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.ready).toBe(true);
  expect(isISO8601(body.timestamp)).toBe(true);
});
