import { describe, it, expect } from 'vitest';
import { 
  ContainerConfig, 
  ResourceLimits, 
  SecurityOptions,
  ContainerConfigSchema,
  ResourceLimitsSchema,
  SecurityOptionsSchema
} from '../src/types';
import {
  createDriverConfig,
  createResourceLimits,
  createSecurityOptions,
  validateContainerConfig,
  validateResourceLimits,
  validateSecurityOptions
} from '../src/index';

describe('Driver Interface Types', () => {
  it('should validate ContainerConfig schema', () => {
    const config: ContainerConfig = {
      sessionId: 'test-session',
      image: 'openagent/sidecar:latest',
      env: { SESSION_ID: 'test-session' },
      labels: { 'openagent.session': 'test-session' },
      resources: {
        cpu: 0.5,
        memory: 512,
        disk: 1024,
        pids: 100
      },
      volumes: [],
      network: 'openagent-network',
      security: {
        readOnly: true,
        noNewPrivileges: true,
        user: 'openagent',
        capabilities: { drop: ['ALL'], add: [] }
      }
    };
    
    const result = ContainerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate ResourceLimits schema', () => {
    const limits: ResourceLimits = {
      cpu: 0.5,
      memory: 512,
      disk: 1024,
      pids: 100
    };
    
    const result = ResourceLimitsSchema.safeParse(limits);
    expect(result.success).toBe(true);
  });

  it('should validate SecurityOptions schema', () => {
    const options: SecurityOptions = {
      readOnly: true,
      noNewPrivileges: true,
      user: 'openagent',
      capabilities: { drop: ['ALL'], add: [] }
    };
    
    const result = SecurityOptionsSchema.safeParse(options);
    expect(result.success).toBe(true);
  });

  it('should reject invalid ContainerConfig', () => {
    const invalidConfig = {
      sessionId: 'test-session',
      image: '',
      resources: {
        cpu: -1,
        memory: 0
      }
    };
    
    const result = ContainerConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('should create default driver config', () => {
    const config = createDriverConfig({
      sessionId: 'test-session',
      image: 'test-image'
    });
    
    expect(config.sessionId).toBe('test-session');
    expect(config.image).toBe('test-image');
    expect(config.resources.cpu).toBe(0.5);
    expect(config.resources.memory).toBe(512);
    expect(config.security.readOnly).toBe(true);
    expect(config.security.user).toBe('openagent');
  });

  it('should create default resource limits', () => {
    const limits = createResourceLimits({
      cpu: 1.0,
      memory: 1024
    });
    
    expect(limits.cpu).toBe(1.0);
    expect(limits.memory).toBe(1024);
    expect(limits.disk).toBe(1024);
    expect(limits.pids).toBe(100);
  });

  it('should create default security options', () => {
    const options = createSecurityOptions({
      user: 'testuser'
    });
    
    expect(options.user).toBe('testuser');
    expect(options.readOnly).toBe(true);
    expect(options.noNewPrivileges).toBe(true);
    expect(options.capabilities.drop).toEqual(['ALL']);
  });

  it('should validate container config correctly', () => {
    const validConfig: ContainerConfig = {
      sessionId: 'test-session',
      image: 'test-image',
      env: {},
      labels: {},
      resources: {
        cpu: 0.5,
        memory: 512,
        disk: 1024,
        pids: 100
      },
      volumes: [],
      network: 'test-network',
      security: {
        readOnly: true,
        noNewPrivileges: true,
        user: 'testuser',
        capabilities: { drop: [], add: [] }
      }
    };
    
    expect(validateContainerConfig(validConfig)).toBe(true);
  });

  it('should validate resource limits correctly', () => {
    const validLimits: ResourceLimits = {
      cpu: 1.0,
      memory: 1024,
      disk: 2048,
      pids: 200
    };
    
    expect(validateResourceLimits(validLimits)).toBe(true);
  });

  it('should validate security options correctly', () => {
    const validOptions: SecurityOptions = {
      readOnly: false,
      noNewPrivileges: true,
      user: 'testuser',
      capabilities: { drop: ['NET_RAW'], add: [] }
    };
    
    expect(validateSecurityOptions(validOptions)).toBe(true);
  });
});