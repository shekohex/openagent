import { CryptoError } from "./crypto";

const MEMORY_CLEAR_ITERATIONS = 3;
const CRYPTO_OPERATIONS_MAX_ATTEMPTS = 10;
const CRYPTO_OPERATIONS_WINDOW_MS = 60_000; // 1 minute
const KEY_PROVISIONING_MAX_ATTEMPTS = 3;
const KEY_PROVISIONING_WINDOW_MS = 300_000; // 5 minutes
const MAX_BUFFER_SIZE = 10_485_760; // 10MB limit
const MIN_KEY_STRENGTH_LENGTH = 32; // Minimum secure key length

// Regex patterns for key strength validation
const SAME_CHARACTER_PATTERN = /^(.)\1+$/; // All same character
const SEQUENTIAL_PATTERN =
  /^(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def)+/i; // Sequential patterns
const COMMON_WORDS_PATTERN = /^(password|secret|key|token)/i; // Common words

// Default rate limiting values
const DEFAULT_RATE_LIMIT_MINUTES = 15;
const MILLISECONDS_PER_SECOND_RATE_LIMIT = 1000;

export function secureMemoryWipe(array: Uint8Array): void {
  if (!array || array.length === 0) {
    return;
  }

  for (let iteration = 0; iteration < MEMORY_CLEAR_ITERATIONS; iteration++) {
    array.fill(0);

    if (iteration < MEMORY_CLEAR_ITERATIONS - 1) {
      crypto.getRandomValues(array);
    }
  }

  array.fill(0);
}

export function secureStringWipe(str: string): void {
  if (typeof str !== "string" || str.length === 0) {
    return;
  }

  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    secureMemoryWipe(bytes);
  } catch {
    // Best effort cleanup
  }
}

export class SecureBuffer {
  private readonly buffer: Uint8Array;
  private isWiped = false;

  constructor(size: number) {
    if (size <= 0 || size > MAX_BUFFER_SIZE) {
      throw new CryptoError(`Invalid buffer size: ${size}`);
    }
    this.buffer = new Uint8Array(size);
  }

  static fromString(str: string): SecureBuffer {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const buffer = new SecureBuffer(bytes.length);
    buffer.buffer.set(bytes);
    secureMemoryWipe(bytes);
    return buffer;
  }

  static fromBase64(base64: string): SecureBuffer {
    try {
      const binaryString = atob(base64);
      const buffer = new SecureBuffer(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        buffer.buffer[i] = binaryString.charCodeAt(i);
      }
      return buffer;
    } catch (error) {
      throw new CryptoError("Invalid base64 string", error as Error);
    }
  }

  getBytes(): Uint8Array {
    if (this.isWiped) {
      throw new CryptoError("Buffer has been wiped");
    }
    return this.buffer;
  }

  toString(): string {
    if (this.isWiped) {
      throw new CryptoError("Buffer has been wiped");
    }
    const decoder = new TextDecoder();
    return decoder.decode(this.buffer);
  }

  toBase64(): string {
    if (this.isWiped) {
      throw new CryptoError("Buffer has been wiped");
    }
    const binaryString = Array.from(this.buffer, (byte) =>
      String.fromCharCode(byte)
    ).join("");
    return btoa(binaryString);
  }

  copy(): SecureBuffer {
    if (this.isWiped) {
      throw new CryptoError("Buffer has been wiped");
    }
    const newBuffer = new SecureBuffer(this.buffer.length);
    newBuffer.buffer.set(this.buffer);
    return newBuffer;
  }

  wipe(): void {
    if (!this.isWiped) {
      secureMemoryWipe(this.buffer);
      this.isWiped = true;
    }
  }

  get length(): number {
    return this.buffer.length;
  }

  get wiped(): boolean {
    return this.isWiped;
  }
}

export class SecureOperation {
  private cleanupFunctions: Array<() => void> = [];

  addCleanup(cleanupFn: () => void): void {
    this.cleanupFunctions.push(cleanupFn);
  }

  addBuffer(buffer: SecureBuffer): void {
    this.addCleanup(() => buffer.wipe());
  }

  addString(str: string): void {
    this.addCleanup(() => secureStringWipe(str));
  }

  addBytes(bytes: Uint8Array): void {
    this.addCleanup(() => secureMemoryWipe(bytes));
  }

  cleanup(): void {
    for (const cleanupFn of this.cleanupFunctions) {
      try {
        cleanupFn();
      } catch {
        // Best effort cleanup
      }
    }
    this.cleanupFunctions = [];
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      this.cleanup();
    }
  }
}

export function createSecureOperation(): SecureOperation {
  return new SecureOperation();
}

export type AuditLogEntry = {
  timestamp: number;
  operation: string;
  userId?: string;
  sessionId?: string;
  provider?: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
};

// Security audit logging state
let auditLogs: AuditLogEntry[] = [];
const MAX_AUDIT_LOGS = 1000;

export function logSecurityEvent(
  entry: Omit<AuditLogEntry, "timestamp">
): void {
  const logEntry: AuditLogEntry = {
    timestamp: Date.now(),
    ...entry,
  };

  auditLogs.push(logEntry);

  if (auditLogs.length > MAX_AUDIT_LOGS) {
    auditLogs = auditLogs.slice(-MAX_AUDIT_LOGS);
  }

  // In production, this would be sent to a logging service
}

export function getSecurityAuditLogs(limit = 100): AuditLogEntry[] {
  return auditLogs.slice(-limit);
}

export function clearSecurityAuditLogs(): void {
  auditLogs = [];
}

export function validateKeyStrength(key: string): boolean {
  if (!key || typeof key !== "string") {
    return false;
  }

  // Basic key strength validation
  if (key.length < MIN_KEY_STRENGTH_LENGTH) {
    return false;
  }

  // Check for common weak patterns
  const weakPatterns = [
    SAME_CHARACTER_PATTERN,
    SEQUENTIAL_PATTERN,
    COMMON_WORDS_PATTERN,
  ];

  return !weakPatterns.some((pattern) => pattern.test(key));
}

export function generateSecureId(length = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }

  secureMemoryWipe(bytes);
  return result;
}

export class RateLimiter {
  private readonly attempts = new Map<
    string,
    { count: number; resetTime: number }
  >();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(
    maxAttempts = 5,
    windowMs = DEFAULT_RATE_LIMIT_MINUTES *
      60 *
      MILLISECONDS_PER_SECOND_RATE_LIMIT
  ) {
    // 5 attempts per 15 minutes
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  checkLimit(identifier: string): {
    allowed: boolean;
    remainingAttempts: number;
    resetTime: number;
  } {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now > record.resetTime) {
      const resetTime = now + this.windowMs;
      this.attempts.set(identifier, { count: 1, resetTime });
      return {
        allowed: true,
        remainingAttempts: this.maxAttempts - 1,
        resetTime,
      };
    }

    if (record.count >= this.maxAttempts) {
      return {
        allowed: false,
        remainingAttempts: 0,
        resetTime: record.resetTime,
      };
    }

    record.count++;
    this.attempts.set(identifier, record);

    return {
      allowed: true,
      remainingAttempts: this.maxAttempts - record.count,
      resetTime: record.resetTime,
    };
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

export const cryptoOperationsRateLimit = new RateLimiter(
  CRYPTO_OPERATIONS_MAX_ATTEMPTS,
  CRYPTO_OPERATIONS_WINDOW_MS
);
export const keyProvisioningRateLimit = new RateLimiter(
  KEY_PROVISIONING_MAX_ATTEMPTS,
  KEY_PROVISIONING_WINDOW_MS
);
