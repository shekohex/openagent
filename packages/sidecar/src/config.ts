export const config = {
  host: process.env.SIDECAR_HOST || "0.0.0.0",
  port: Number.parseInt(process.env.SIDECAR_PORT || "4096", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: process.env.SIDECAR_CORS_ORIGIN || "http://localhost:3001",
} as const;

export type Config = typeof config;
