export const logger = {
  info: (..._args: unknown[]) => {
    // No-op stub: real logger wired during runtime bootstrap.
    return;
  },
  warn: (..._args: unknown[]) => {
    // No-op stub: real logger wired during runtime bootstrap.
    return;
  },
  error: (..._args: unknown[]) => {
    // No-op stub: real logger wired during runtime bootstrap.
    return;
  },
  debug: (..._args: unknown[]) => {
    // No-op stub: real logger wired during runtime bootstrap.
    return;
  },
} as const;
