import { expect, expectTypeOf, test } from "vitest";
import { client } from "./_utils/client";

test("POST /internal/register returns 501 with error envelope", async () => {
  // Type surface sanity check
  expectTypeOf(client.internal.register.$post).toBeFunction();
  const res = await client.internal.register.$post();
  expect(res.status).toBe(501);
  expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/i);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.error?.code).toBe("NOT_IMPLEMENTED");
  expect(typeof body.error?.message).toBe("string");
});
