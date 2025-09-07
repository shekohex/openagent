# Incident Response Plan for OpenAgent Security

## Overview

This document outlines the incident response procedures for security-related events in the OpenAgent envelope encryption service. It provides step-by-step guidance for detecting, responding to, and recovering from security incidents.

## Incident Classification

### Severity Levels

#### Critical (P0)
- **Definition**: Immediate threat to data security or system availability
- **Examples**:
  - Master key compromise
  - Authentication bypass discovered
  - Active data breach
  - Complete service outage
- **Response Time**: Immediate (within 15 minutes)
- **Escalation**: CTO, Security Team, Legal

#### High (P1)
- **Definition**: Significant security risk requiring urgent attention
- **Examples**:
  - Failed key rotations affecting multiple users
  - Suspected unauthorized access attempts
  - Encryption/decryption failures
  - Rate limiting bypass
- **Response Time**: Within 1 hour
- **Escalation**: Engineering Lead, Security Team

#### Medium (P2)
- **Definition**: Security issues with moderate impact
- **Examples**:
  - Single user key rotation failure
  - Unusual API usage patterns
  - Non-critical vulnerability discovered
- **Response Time**: Within 4 hours
- **Escalation**: Engineering Team

#### Low (P3)
- **Definition**: Minor security concerns
- **Examples**:
  - Documentation inconsistencies
  - Performance degradation
  - Non-security bugs
- **Response Time**: Within 24 hours
- **Escalation**: On-call Engineer

## Detection and Alerting

### Monitoring Points

1. **Authentication Events**
   ```typescript
   // Monitor for:
   - Multiple failed authentication attempts
   - Authentication from unusual locations
   - Token validation failures
   ```

2. **Encryption Operations**
   ```typescript
   // Monitor for:
   - Decryption failures
   - Key rotation failures
   - Unusual encryption patterns
   ```

3. **Access Patterns**
   ```typescript
   // Monitor for:
   - Cross-user access attempts
   - Bulk data exports
   - Unusual API call patterns
   ```

### Alert Channels
- **PagerDuty**: Critical incidents
- **Slack #security-alerts**: All security events
- **Email**: Daily summaries and reports

## Response Procedures

### Phase 1: Detection & Analysis (0-30 minutes)

1. **Acknowledge Alert**
   - Respond in #incident-response channel
   - Create incident ticket

2. **Initial Assessment**
   ```bash
   # Check system status
   convex dev --inspect
   
   # Review recent logs
   convex logs --since 1h
   
   # Check encryption service health
   curl https://api.openagent.dev/health
   ```

3. **Classify Incident**
   - Determine severity level
   - Identify affected components
   - Estimate impact scope

4. **Document Initial Findings**
   ```markdown
   ## Incident Report
   - Time Detected: [timestamp]
   - Severity: [P0-P3]
   - Affected Systems: [list]
   - Initial Observations: [details]
   ```

### Phase 2: Containment (30-60 minutes)

#### Immediate Actions for Key Compromise

1. **Rotate Affected Keys**
   ```typescript
   // Emergency key rotation
   await ctx.runAction(api.actions.rotateKeys.emergencyRotation, {
     userId: affectedUserId,
     reason: "Security incident",
   });
   ```

2. **Invalidate Sessions**
   ```typescript
   // Terminate all active sessions
   await ctx.runMutation(api.sessions.invalidateUserSessions, {
     userId: affectedUserId,
   });
   ```

3. **Enable Emergency Mode**
   ```typescript
   // Restrict access during investigation
   await ctx.runMutation(api.security.enableEmergencyMode, {
     reason: incidentId,
     restrictions: ["no_new_keys", "no_exports"],
   });
   ```

#### Network Isolation (if needed)
```bash
# Block suspicious IPs
convex env set BLOCKED_IPS="1.2.3.4,5.6.7.8"

# Enable strict rate limiting
convex env set RATE_LIMIT_MULTIPLIER="0.1"
```

### Phase 3: Eradication (1-4 hours)

1. **Remove Threat**
   - Patch vulnerabilities
   - Remove malicious code
   - Update access controls

2. **Verify Fixes**
   ```bash
   # Run security tests
   npm run test:security
   
   # Verify encryption integrity
   npm run audit:encryption
   ```

3. **Deploy Patches**
   ```bash
   # Deploy security updates
   convex deploy --prod
   ```

### Phase 4: Recovery (4-24 hours)

1. **Restore Normal Operations**
   ```typescript
   // Disable emergency mode
   await ctx.runMutation(api.security.disableEmergencyMode, {
     verificationCode: securityTeamCode,
   });
   ```

2. **Monitor Recovery**
   - Watch error rates
   - Monitor performance metrics
   - Track user reports

3. **Verify Data Integrity**
   ```typescript
   // Run integrity checks
   const report = await ctx.runAction(api.security.verifyDataIntegrity, {
     checkType: "full",
   });
   ```

### Phase 5: Post-Incident (24-72 hours)

1. **Conduct Post-Mortem**
   - Timeline of events
   - Root cause analysis
   - Lessons learned
   - Action items

2. **Update Documentation**
   - Incident report
   - Runbooks
   - Security procedures

3. **Implement Improvements**
   - Security patches
   - Monitoring enhancements
   - Process improvements

## Communication Templates

### Internal Communication

#### Initial Alert
```
🚨 SECURITY INCIDENT DETECTED
Severity: [P0-P3]
System: OpenAgent Encryption Service
Time: [timestamp]
Status: Investigating
Thread: [link to thread]
```

#### Update Template
```
📊 INCIDENT UPDATE
Status: [Investigating/Contained/Resolved]
Impact: [number] users affected
Actions Taken: [list]
Next Steps: [list]
ETA: [time estimate]
```

### External Communication

#### Customer Notification (if required)
```
Subject: Important Security Update

We detected [brief description] affecting your account.

Actions we've taken:
- [Action 1]
- [Action 2]

Actions you should take:
- [Recommendation 1]
- [Recommendation 2]

More info: [status page link]
```

## Recovery Procedures

### Emergency Key Rotation

```typescript
// Rotate all keys for affected user
async function emergencyKeyRotation(userId: Id<"users">) {
  const result = await ctx.runAction(
    api.actions.rotateKeys.rotateAllUserKeys,
    {
      userId,
      newKeyVersion: getCurrentEmergencyKeyVersion(),
    }
  );
  
  // Audit the rotation
  await logSecurityEvent({
    operation: "emergency_rotation",
    userId,
    reason: "security_incident",
    success: result.successCount === result.totalKeys,
  });
  
  return result;
}
```

### Data Recovery

```typescript
// Restore from encrypted backups
async function restoreUserData(userId: Id<"users">, backupId: string) {
  const backup = await getEncryptedBackup(backupId);
  const decrypted = await decryptBackup(backup);
  
  // Verify integrity before restore
  if (!verifyBackupIntegrity(decrypted)) {
    throw new Error("Backup integrity check failed");
  }
  
  await restoreProviderKeys(userId, decrypted.keys);
  return { restored: true, timestamp: Date.now() };
}
```

## Escalation Matrix

| Severity | Primary Contact | Backup Contact | External |
|----------|----------------|----------------|----------|
| P0 | CTO | Security Lead | Legal, PR |
| P1 | Security Lead | Engineering Lead | - |
| P2 | On-call Engineer | Team Lead | - |
| P3 | On-call Engineer | - | - |

## Contact Information

### Internal Contacts
- **Security Team**: security@openagent.dev
- **On-call**: Use PagerDuty
- **CTO**: [Encrypted contact info]

### External Contacts
- **Convex Support**: support@convex.dev
- **Legal Counsel**: [Encrypted contact info]
- **PR Agency**: [Encrypted contact info]

## Automation Scripts

### Quick Response Scripts

```bash
# 1. Emergency shutdown
./scripts/emergency-shutdown.sh

# 2. Rotate all master keys
./scripts/rotate-master-keys.sh

# 3. Export audit logs
./scripts/export-security-audit.sh --since 24h

# 4. Check system integrity
./scripts/verify-system-integrity.sh
```

## Compliance Requirements

### Notification Timelines
- **GDPR**: Within 72 hours to authorities
- **CCPA**: Without unreasonable delay
- **SOC2**: As per audit requirements

### Documentation Requirements
- Incident timeline
- Affected data categories
- Mitigation measures
- User impact assessment
- Remediation steps

## Review and Training

- **Quarterly Reviews**: Review and update procedures
- **Bi-annual Drills**: Conduct incident response exercises
- **Annual Training**: Security awareness for all engineers

## Appendix

### Useful Commands

```bash
# View recent security events
convex query security:getAuditLogs --limit 100

# Check encryption health
convex action security:healthCheck

# Emergency key rotation
convex action security:emergencyRotateKeys --userId USER_ID

# Export incident data
convex action security:exportIncidentData --incidentId INC_ID
```

### Security Tools
- **Monitoring**: Datadog, CloudWatch
- **Alerting**: PagerDuty, Slack
- **Analysis**: Splunk, ELK Stack
- **Forensics**: Internal tools

---

**Last Updated**: December 2024
**Next Review**: March 2025
**Owner**: Security Team