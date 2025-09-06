/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as actions_provisionKeys from "../actions/provisionKeys.js";
import type * as actions_rotateKeys from "../actions/rotateKeys.js";
import type * as auth from "../auth.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_envelope from "../lib/envelope.js";
import type * as lib_keyExchange from "../lib/keyExchange.js";
import type * as lib_keyManager from "../lib/keyManager.js";
import type * as providerKeys from "../providerKeys.js";
import type * as sessions from "../sessions.js";
import type * as users_getCurrentUser from "../users/getCurrentUser.js";
import type * as users_updateProfile from "../users/updateProfile.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "actions/provisionKeys": typeof actions_provisionKeys;
  "actions/rotateKeys": typeof actions_rotateKeys;
  auth: typeof auth;
  healthCheck: typeof healthCheck;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/crypto": typeof lib_crypto;
  "lib/envelope": typeof lib_envelope;
  "lib/keyExchange": typeof lib_keyExchange;
  "lib/keyManager": typeof lib_keyManager;
  providerKeys: typeof providerKeys;
  sessions: typeof sessions;
  "users/getCurrentUser": typeof users_getCurrentUser;
  "users/updateProfile": typeof users_updateProfile;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
