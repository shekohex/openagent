import type { InferResponseType } from "hono/client";
import { hc } from "hono/client";
import { expectTypeOf } from "vitest";
import type { AppType } from "../../src/index";

// A typed client instance (not executed in type tests)
const httpClient = hc<AppType>("http://localhost:4096");

// Route surface: methods exist where defined
expectTypeOf(httpClient.internal.health.$get).toBeFunction();
expectTypeOf(httpClient.internal.ready.$get).toBeFunction();
expectTypeOf(httpClient.internal.register.$post).toBeFunction();

// POST-only route must not expose GET
// @ts-expect-error register is POST-only
httpClient.internal.register.$get;

// GET-only routes must not expose POST
// @ts-expect-error health is GET-only
httpClient.internal.health.$post;
// @ts-expect-error ready is GET-only
httpClient.internal.ready.$post;

// No JSON body accepted for GET routes (zero required args)
expectTypeOf(httpClient.internal.health.$get).toBeCallableWith();
expectTypeOf(httpClient.internal.ready.$get).toBeCallableWith();

// The register route currently has no request body defined – we don't pass one here.

// Response typing – health
type Health200 = InferResponseType<typeof httpClient.internal.health.$get, 200>;
expectTypeOf<Health200>().toEqualTypeOf<{
  status: string;
  timestamp: string;
}>();
// Ensure non-declared status infers to never
type Health201 = InferResponseType<typeof httpClient.internal.health.$get, 201>;
expectTypeOf<Health201>().toEqualTypeOf<never>();

// Response typing – ready
type Ready200 = InferResponseType<typeof httpClient.internal.ready.$get, 200>;
expectTypeOf<Ready200>().toEqualTypeOf<{
  status: string;
  ready: boolean;
  timestamp: string;
}>();

// Response typing – register (501 only)
type Register501 = InferResponseType<
  typeof httpClient.internal.register.$post,
  501
>;
expectTypeOf<Register501>().toEqualTypeOf<{
  success: boolean;
  error: { code: string; message: string };
}>();
type Register200 = InferResponseType<
  typeof httpClient.internal.register.$post,
  200
>;
expectTypeOf<Register200>().toEqualTypeOf<never>();

// The $url builder exists for declared routes
expectTypeOf(httpClient.internal.ready.$url).toBeFunction();
expectTypeOf(httpClient.internal.health.$url).toBeFunction();
expectTypeOf(httpClient.internal.register.$url).toBeFunction();

// Namespaced root routes expose .index for path "/namespace"
// Namespaced roots expose GET at "/"
expectTypeOf(httpClient.events.$get).toBeFunction();
expectTypeOf(httpClient.opencode.$get).toBeFunction();
expectTypeOf(httpClient.terminal.$get).toBeFunction();

// GET routes under those namespaces shouldn't require bodies
expectTypeOf(httpClient.events.$get).toBeCallableWith();
expectTypeOf(httpClient.opencode.$get).toBeCallableWith();
expectTypeOf(httpClient.terminal.$get).toBeCallableWith();

// Note: request input is intentionally undefined for these routes,
// we validate by rejecting bodies above rather than asserting a specific input type.
