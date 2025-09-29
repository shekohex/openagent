import { vi } from "vitest";

// Mock OpenCode SDK for testing
export const createServer = vi.fn(() => ({
  start: vi.fn(),
  stop: vi.fn(),
}));

export const createClient = vi.fn(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

export const OpenCodeError = class extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeError";
  }
};

export const OpenCodeErrorCode = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export default {
  createServer,
  createClient,
  OpenCodeError,
  OpenCodeErrorCode,
};
