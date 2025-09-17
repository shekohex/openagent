// Import from workspace build output to avoid pnpm/bun linking issues in sandboxed tests.
// eslint-disable-next-line import/no-relative-packages
import type { SealedPayload } from "../../../crypto-lib/dist/keyExchange.js";
import { HTTP_STATUS } from "../constants";

export type RegisterSidecarParams = {
  sessionId: string;
  registrationToken: string;
  sidecarPublicKey: string;
  sidecarKeyId: string;
};

export type RegisterSidecarResult = {
  sidecarAuthToken: string;
  orchestratorPublicKey: string;
  orchestratorKeyId: string;
  encryptedProviderKeys: SealedPayload;
  opencodePort: number;
};

export type OrchestratorAdapter = {
  registerSidecar(
    params: RegisterSidecarParams
  ): Promise<RegisterSidecarResult>;
};

export type OrchestratorErrorCode =
  | "CONFIGURATION_ERROR"
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE"
  | "UNAUTHORIZED"
  | "UPSTREAM_ERROR";

export class OrchestratorError extends Error {
  readonly code: OrchestratorErrorCode;
  readonly status: number;

  constructor(
    code: OrchestratorErrorCode,
    message: string,
    status: number,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "OrchestratorError";
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_OPENCODE_PORT = Number.parseInt(
  process.env.SIDECAR_OPENCODE_PORT || "7000",
  10
);
const ERROR_PREVIEW_LENGTH = 256;

let adapter: OrchestratorAdapter | undefined;

const createHttpAdapter = (): OrchestratorAdapter => {
  const endpoint = process.env.SIDECAR_ORCHESTRATOR_REGISTRATION_URL;
  const fetchImpl = globalThis.fetch?.bind(globalThis);

  if (!endpoint || typeof fetchImpl !== "function") {
    return {
      registerSidecar() {
        throw new OrchestratorError(
          "CONFIGURATION_ERROR",
          "No orchestrator registration endpoint configured. Set SIDECAR_ORCHESTRATOR_REGISTRATION_URL or provide a custom adapter via setOrchestratorAdapter().",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        );
      },
    };
  }

  return {
    async registerSidecar(params) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (response.status === HTTP_STATUS.UNAUTHORIZED) {
        throw new OrchestratorError(
          "UNAUTHORIZED",
          "Orchestrator rejected sidecar registration (401 Unauthorized)",
          HTTP_STATUS.UNAUTHORIZED
        );
      }

      if (response.status === HTTP_STATUS.FORBIDDEN) {
        throw new OrchestratorError(
          "UNAUTHORIZED",
          "Orchestrator rejected sidecar registration (403 Forbidden)",
          HTTP_STATUS.FORBIDDEN
        );
      }

      if (!response.ok) {
        const reason = await response.text().catch(() => "");
        throw new OrchestratorError(
          "UPSTREAM_ERROR",
          `Unexpected ${response.status} response from orchestrator: ${reason.slice(0, ERROR_PREVIEW_LENGTH)}`,
          response.status
        );
      }

      const payload = (await response
        .json()
        .catch(() => null)) as Partial<RegisterSidecarResult> | null;

      if (!payload || typeof payload !== "object") {
        throw new OrchestratorError(
          "INVALID_RESPONSE",
          "Orchestrator registration response was not valid JSON",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        );
      }

      const {
        sidecarAuthToken,
        orchestratorPublicKey,
        orchestratorKeyId,
        encryptedProviderKeys,
        opencodePort,
      } = payload;

      if (
        typeof sidecarAuthToken !== "string" ||
        typeof orchestratorPublicKey !== "string" ||
        typeof orchestratorKeyId !== "string" ||
        !encryptedProviderKeys ||
        typeof encryptedProviderKeys !== "object"
      ) {
        throw new OrchestratorError(
          "INVALID_RESPONSE",
          "Orchestrator registration response missing required fields",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        );
      }

      const resolvedPort =
        typeof opencodePort === "number" && Number.isFinite(opencodePort)
          ? opencodePort
          : DEFAULT_OPENCODE_PORT;

      return {
        sidecarAuthToken,
        orchestratorPublicKey,
        orchestratorKeyId,
        encryptedProviderKeys: encryptedProviderKeys as SealedPayload,
        opencodePort: resolvedPort,
      } satisfies RegisterSidecarResult;
    },
  };
};

const getAdapter = (): OrchestratorAdapter => {
  if (!adapter) {
    adapter = createHttpAdapter();
  }
  return adapter;
};

export const setOrchestratorAdapter = (
  custom: OrchestratorAdapter | undefined
): void => {
  adapter = custom;
};

export const resetOrchestratorAdapter = (): void => {
  adapter = undefined;
};

export const registerSidecar = (
  params: RegisterSidecarParams
): Promise<RegisterSidecarResult> => {
  return getAdapter().registerSidecar(params);
};
