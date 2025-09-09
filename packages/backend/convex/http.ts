import { httpRouter } from "convex/server";
import { createAuth } from "../lib/auth";
import { betterAuthComponent } from "./auth";

const http = httpRouter();

// biome-ignore lint/suspicious/noExplicitAny: needs to be fixed upstream
betterAuthComponent.registerRoutes(http, createAuth as any);

export default http;
