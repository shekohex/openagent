# Security Best Practices Guide

## Overview

This guide provides security best practices for developers working on the OpenAgent Envelope Encryption Service. Following these practices ensures the protection of sensitive data and maintains system security integrity.

## 1. Cryptographic Operations

### Key Generation

✅ **DO:**
```typescript
// Use crypto.getRandomValues() for random number generation
const nonce = new Uint8Array(12);
crypto.getRandomValues(nonce);

// Generate keys with proper parameters
const key = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  true,
  ["encrypt", "decrypt"]
);
```

❌ **DON'T:**
```typescript
// Never use Math.random() for cryptographic operations
const badNonce = Math.random().toString(36);

// Don't use weak key sizes
const weakKey = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 128 }, // Too weak
  true,
  ["encrypt", "decrypt"]
);
```

### Encryption/Decryption

✅ **DO:**
```typescript
// Always use unique nonces
const nonce = generateSecureNonce();

// Include authentication tags
const encrypted = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv: nonce, tagLength: 128 },
  key,
  data
);

// Verify authentication before decryption
try {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    encrypted
  );
} catch (error) {
  // Authentication failed - data may be tampered
  throw new CryptoError("Decryption failed - authentication tag invalid");
}
```

❌ **DON'T:**
```typescript
// Never reuse nonces with the same key
const fixedNonce = new Uint8Array(12); // Static nonce - INSECURE!

// Don't ignore authentication failures
const decrypted = await crypto.subtle.decrypt(
  { name: "AES-GCM", iv: nonce },
  key,
  encrypted
).catch(() => null); // Silently failing - DANGEROUS!
```

### Memory Management

✅ **DO:**
```typescript
// Clear sensitive data from memory after use
class SecureBuffer {
  private buffer: Uint8Array;
  
  clear(): void {
    if (this.buffer) {
      crypto.getRandomValues(this.buffer); // Overwrite with random
      this.buffer.fill(0); // Then zero
      this.buffer = null;
    }
  }
  
  [Symbol.dispose](): void {
    this.clear();
  }
}

// Use try-finally to ensure cleanup
const buffer = new SecureBuffer(sensitiveData);
try {
  // Use buffer
} finally {
  buffer.clear();
}
```

❌ **DON'T:**
```typescript
// Don't leave sensitive data in memory
let apiKey = "sk-secret-key";
// ... use key ...
// Key remains in memory! - INSECURE

// Don't rely on garbage collection
const keys = [];
keys.push(sensitiveKey);
keys = []; // Old array with key still in memory
```

## 2. Authentication & Authorization

### User Authentication

✅ **DO:**
```typescript
// Always verify user identity
export const authenticatedQuery = query({
  handler: async (ctx, args) => {
    if (!ctx.userId) {
      throw new Error("Unauthenticated");
    }
    
    // Verify user owns the resource
    const resource = await ctx.db.get(args.resourceId);
    if (resource.userId !== ctx.userId) {
      throw new Error("Unauthorized");
    }
    
    return resource;
  }
});

// Use short-lived tokens
const token = jwt.sign(
  { userId, exp: Date.now() + 15 * 60 * 1000 }, // 15 minutes
  secret
);
```

❌ **DON'T:**
```typescript
// Never trust client-provided user IDs
export const insecureQuery = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // Trusting client-provided userId - INSECURE!
    return await ctx.db.query("keys")
      .filter(q => q.eq(q.field("userId"), args.userId))
      .collect();
  }
});

// Don't use long-lived tokens
const token = jwt.sign(
  { userId, exp: Date.now() + 365 * 24 * 60 * 60 * 1000 }, // 1 year - TOO LONG!
  secret
);
```

### Access Control

✅ **DO:**
```typescript
// Implement role-based access control
export const adminMutation = mutation({
  handler: async (ctx, args) => {
    const user = await ctx.db.get(ctx.userId);
    if (user.role !== "admin") {
      throw new Error("Admin access required");
    }
    // Proceed with admin operation
  }
});

// Use the principle of least privilege
const permissions = {
  user: ["read:own", "write:own"],
  moderator: ["read:all", "write:own", "flag:all"],
  admin: ["read:all", "write:all", "delete:all"]
};
```

❌ **DON'T:**
```typescript
// Don't implement authorization in client code
// Client-side check - INSECURE!
if (userRole === "admin") {
  showAdminPanel();
}

// Don't grant excessive permissions
const permissions = {
  user: ["*"], // Too broad!
};
```

## 3. Input Validation & Sanitization

### Validation Patterns

✅ **DO:**
```typescript
// Validate all inputs strictly
function validateProviderName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new Error("Provider name required");
  }
  
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    throw new Error("Provider name must be 1-50 characters");
  }
  
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(trimmed)) {
    throw new Error("Invalid provider name format");
  }
}

// Use schema validation
const schema = v.object({
  provider: v.string().min(1).max(50).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
  key: v.string().min(8).max(1000),
});
```

❌ **DON'T:**
```typescript
// Don't trust user input
function insecureHandler(userInput: any) {
  // Using input directly - DANGEROUS!
  const query = `SELECT * FROM keys WHERE provider = '${userInput}'`;
  
  // No validation - INSECURE!
  database.execute(query);
}

// Don't use blacklist validation
if (!input.includes("DROP TABLE")) { // Blacklist approach - INSUFFICIENT!
  processInput(input);
}
```

### Output Encoding

✅ **DO:**
```typescript
// Encode output for the appropriate context
function encodeForHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Use Content Security Policy
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  );
  next();
});
```

❌ **DON'T:**
```typescript
// Don't output user input directly
const html = `<div>${userInput}</div>`; // XSS vulnerability!

// Don't rely on client-side sanitization alone
// Client can be bypassed!
```

## 4. Session Management

### Session Security

✅ **DO:**
```typescript
// Implement secure session management
export const createSession = mutation({
  handler: async (ctx, args) => {
    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes
    
    await ctx.db.insert("sessions", {
      id: sessionId,
      userId: ctx.userId,
      createdAt: Date.now(),
      expiresAt,
      ipAddress: ctx.request.ip,
      userAgent: ctx.request.headers["user-agent"],
    });
    
    return { sessionId, expiresAt };
  }
});

// Validate sessions on every request
export const validateSession = async (sessionId: string) => {
  const session = await db.get(sessionId);
  
  if (!session || session.expiresAt < Date.now()) {
    throw new Error("Invalid or expired session");
  }
  
  // Extend session on activity
  await db.patch(sessionId, {
    expiresAt: Date.now() + 30 * 60 * 1000
  });
  
  return session;
};
```

❌ **DON'T:**
```typescript
// Don't use predictable session IDs
const sessionId = userId + Date.now(); // Predictable!

// Don't store sessions without expiry
await db.insert("sessions", {
  id: sessionId,
  userId,
  // No expiry - sessions live forever!
});
```

## 5. Error Handling

### Secure Error Messages

✅ **DO:**
```typescript
// Provide generic error messages to users
try {
  await authenticateUser(credentials);
} catch (error) {
  // Log detailed error internally
  logger.error("Authentication failed", {
    error: error.message,
    stack: error.stack,
    userId: credentials.username,
    timestamp: Date.now()
  });
  
  // Return generic message to user
  throw new Error("Invalid credentials");
}

// Use error codes for client handling
enum ErrorCode {
  INVALID_CREDENTIALS = "AUTH001",
  RATE_LIMITED = "RATE001",
  VALIDATION_FAILED = "VAL001"
}
```

❌ **DON'T:**
```typescript
// Don't expose internal details
try {
  await database.query(sql);
} catch (error) {
  // Exposing database error - INFORMATION LEAK!
  throw new Error(`Database error: ${error.message}`);
}

// Don't reveal system paths or structure
throw new Error(`File not found: /var/app/secrets/master.key`);
```

## 6. Secure Communication

### HTTPS/TLS

✅ **DO:**
```typescript
// Enforce HTTPS
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(`https://${req.header('host')}${req.url}`);
  }
  next();
});

// Use secure cookies
res.cookie('session', sessionId, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 30 * 60 * 1000
});
```

❌ **DON'T:**
```typescript
// Don't transmit sensitive data over HTTP
const apiUrl = "http://api.example.com/keys"; // Unencrypted!

// Don't use insecure cookies
res.cookie('session', sessionId); // Missing security flags!
```

## 7. Dependency Management

### Package Security

✅ **DO:**
```bash
# Regularly audit dependencies
npm audit
npm audit fix

# Use lock files
npm ci # Install from package-lock.json

# Check for known vulnerabilities
npx snyk test
```

❌ **DON'T:**
```bash
# Don't ignore security warnings
npm audit
# 47 vulnerabilities (12 critical) - IGNORED!

# Don't use outdated packages
"dependencies": {
  "express": "3.0.0" # Years old, many vulnerabilities!
}
```

## 8. Logging & Monitoring

### Security Logging

✅ **DO:**
```typescript
// Log security-relevant events
logger.info("User login", {
  userId,
  ip: request.ip,
  userAgent: request.headers["user-agent"],
  timestamp: Date.now(),
  success: true
});

// Implement audit trails
await auditLog.record({
  action: "KEY_ROTATION",
  userId,
  provider,
  oldVersion: currentVersion,
  newVersion: newVersion,
  timestamp: Date.now(),
  status: "success"
});
```

❌ **DON'T:**
```typescript
// Don't log sensitive data
logger.info("User login", {
  userId,
  password: credentials.password, // NEVER log passwords!
  apiKey: user.apiKey // NEVER log keys!
});

// Don't ignore security events
try {
  validateToken(token);
} catch (error) {
  // Failed validation not logged - MISSING AUDIT!
}
```

## 9. Rate Limiting

### Implementation

✅ **DO:**
```typescript
// Implement rate limiting
const rateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  keyGenerator: (req) => req.userId || req.ip
});

// Use exponential backoff
let delay = 1000;
for (let i = 0; i < maxRetries; i++) {
  try {
    return await operation();
  } catch (error) {
    await sleep(delay);
    delay *= 2; // Exponential increase
  }
}
```

❌ **DON'T:**
```typescript
// Don't allow unlimited requests
app.post("/api/keys", async (req, res) => {
  // No rate limiting - DoS vulnerability!
  await processRequest(req);
});
```

## 10. Security Headers

### HTTP Headers

✅ **DO:**
```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Add security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
```

## Quick Security Checklist

Before deploying code, ensure:

- [ ] All user inputs are validated and sanitized
- [ ] Authentication is required for protected resources
- [ ] Authorization checks are in place
- [ ] Sensitive data is encrypted
- [ ] Errors don't leak sensitive information
- [ ] Rate limiting is configured
- [ ] Security headers are set
- [ ] Dependencies are up-to-date
- [ ] Audit logging is implemented
- [ ] Memory is cleared after handling sensitive data
- [ ] HTTPS is enforced
- [ ] Sessions expire appropriately
- [ ] CSRF protection is enabled
- [ ] SQL/NoSQL injection is prevented
- [ ] XSS protection is implemented

## Incident Response

If a security issue is discovered:

1. **Don't panic** - Follow the incident response plan
2. **Assess** - Determine scope and impact
3. **Contain** - Isolate affected systems
4. **Communicate** - Notify security team immediately
5. **Document** - Record all actions taken
6. **Learn** - Conduct post-mortem

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [Security Headers](https://securityheaders.com/)
- [Mozilla Observatory](https://observatory.mozilla.org/)

## Contact

For security concerns or questions:
- Security Team: security@openagent.dev
- Bug Bounty: https://openagent.dev/security/bounty
- Emergency: Use PagerDuty escalation

---

*Remember: Security is everyone's responsibility. When in doubt, ask the security team.*