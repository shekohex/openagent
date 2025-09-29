import { vi } from "vitest";

// Mock OpenCode SDK for backend tests
export const createAgent = vi.fn().mockResolvedValue({
  id: "test-agent-id",
  status: "running",
  url: "http://localhost:3000",
});

export const AgentStatus = {
  STARTING: "starting",
  RUNNING: "running",
  STOPPED: "stopped",
  ERROR: "error",
} as const;

export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

export type Agent = {
  id: string;
  status: AgentStatus;
  url: string;
};
