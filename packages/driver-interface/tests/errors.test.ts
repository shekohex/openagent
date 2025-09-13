import { describe, it, expect } from 'vitest';
import {
  DriverError,
  ContainerNotFoundError,
  ContainerCreationError,
  ContainerStartError,
  ContainerStopError,
  ContainerRemoveError,
  VolumeCreationError,
  VolumeNotFoundError,
  VolumeRemoveError,
  NetworkCreationError,
  NetworkNotFoundError,
  NetworkRemoveError,
  DriverHealthError,
  ResourceLimitError,
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
  TimeoutError,
  NetworkError,
  FileSystemError,
  isDriverError,
  isRetryableError,
  getErrorCode,
  getErrorMessage
} from '../src/errors';

describe('Driver Interface Errors', () => {
  it('should create DriverError with correct properties', () => {
    const error = new DriverError('Test error', 'TEST_ERROR', true);
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DriverError');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.retryable).toBe(true);
  });

  it('should create ContainerNotFoundError', () => {
    const error = new ContainerNotFoundError('container-123');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('CONTAINER_NOT_FOUND');
    expect(error.message).toBe('Container container-123 not found');
    expect(error.retryable).toBe(false);
  });

  it('should create ContainerCreationError', () => {
    const error = new ContainerCreationError('Failed to create', { details: 'test' });
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('CONTAINER_CREATION_FAILED');
    expect(error.message).toBe('Failed to create');
    expect(error.details).toEqual({ details: 'test' });
    expect(error.retryable).toBe(true);
  });

  it('should create ContainerStartError', () => {
    const error = new ContainerStartError('container-123', 'Permission denied');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('CONTAINER_START_FAILED');
    expect(error.message).toBe('Failed to start container container-123: Permission denied');
    expect(error.retryable).toBe(true);
  });

  it('should create ContainerStopError', () => {
    const error = new ContainerStopError('container-123', 'Timeout');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('CONTAINER_STOP_FAILED');
    expect(error.message).toBe('Failed to stop container container-123: Timeout');
    expect(error.retryable).toBe(true);
  });

  it('should create ContainerRemoveError', () => {
    const error = new ContainerRemoveError('container-123', 'Container in use');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('CONTAINER_REMOVE_FAILED');
    expect(error.message).toBe('Failed to remove container container-123: Container in use');
    expect(error.retryable).toBe(false);
  });

  it('should create VolumeCreationError', () => {
    const error = new VolumeCreationError('test-volume', 'Volume already exists');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('VOLUME_CREATION_FAILED');
    expect(error.message).toBe('Failed to create volume test-volume: Volume already exists');
    expect(error.retryable).toBe(true);
  });

  it('should create VolumeNotFoundError', () => {
    const error = new VolumeNotFoundError('volume-123');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('VOLUME_NOT_FOUND');
    expect(error.message).toBe('Volume volume-123 not found');
    expect(error.retryable).toBe(false);
  });

  it('should create VolumeRemoveError', () => {
    const error = new VolumeRemoveError('volume-123', 'Volume in use');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('VOLUME_REMOVE_FAILED');
    expect(error.message).toBe('Failed to remove volume volume-123: Volume in use');
    expect(error.retryable).toBe(false);
  });

  it('should create NetworkCreationError', () => {
    const error = new NetworkCreationError('test-network', 'Network already exists');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('NETWORK_CREATION_FAILED');
    expect(error.message).toBe('Failed to create network test-network: Network already exists');
    expect(error.retryable).toBe(true);
  });

  it('should create NetworkNotFoundError', () => {
    const error = new NetworkNotFoundError('network-123');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('NETWORK_NOT_FOUND');
    expect(error.message).toBe('Network network-123 not found');
    expect(error.retryable).toBe(false);
  });

  it('should create NetworkRemoveError', () => {
    const error = new NetworkRemoveError('network-123', 'Network in use');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('NETWORK_REMOVE_FAILED');
    expect(error.message).toBe('Failed to remove network network-123: Network in use');
    expect(error.retryable).toBe(false);
  });

  it('should create DriverHealthError', () => {
    const error = new DriverHealthError('Docker daemon not running');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('DRIVER_HEALTH_CHECK_FAILED');
    expect(error.message).toBe('Driver health check failed: Docker daemon not running');
    expect(error.retryable).toBe(false);
  });

  it('should create ResourceLimitError', () => {
    const error = new ResourceLimitError('memory', 1024, 2048);
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('RESOURCE_LIMIT_EXCEEDED');
    expect(error.message).toBe('Resource limit exceeded for memory: requested 2048, limit 1024');
    expect(error.retryable).toBe(false);
  });

  it('should create AuthenticationError', () => {
    const error = new AuthenticationError('Invalid credentials');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('AUTHENTICATION_FAILED');
    expect(error.message).toBe('Authentication failed: Invalid credentials');
    expect(error.retryable).toBe(false);
  });

  it('should create AuthorizationError', () => {
    const error = new AuthorizationError('Insufficient permissions');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('AUTHORIZATION_FAILED');
    expect(error.message).toBe('Authorization failed: Insufficient permissions');
    expect(error.retryable).toBe(false);
  });

  it('should create ConfigurationError', () => {
    const error = new ConfigurationError('Invalid configuration');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('CONFIGURATION_ERROR');
    expect(error.message).toBe('Configuration error: Invalid configuration');
    expect(error.retryable).toBe(false);
  });

  it('should create TimeoutError', () => {
    const error = new TimeoutError('container start', 30000);
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('TIMEOUT_ERROR');
    expect(error.message).toBe('Operation container start timed out after 30000ms');
    expect(error.retryable).toBe(true);
  });

  it('should create NetworkError', () => {
    const error = new NetworkError('Connection refused');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toBe('Network error: Connection refused');
    expect(error.retryable).toBe(true);
  });

  it('should create FileSystemError', () => {
    const error = new FileSystemError('Permission denied');
    
    expect(error).toBeInstanceOf(DriverError);
    expect(error.code).toBe('FILE_SYSTEM_ERROR');
    expect(error.message).toBe('File system error: Permission denied');
    expect(error.retryable).toBe(false);
  });

  it('should identify DriverError instances', () => {
    const driverError = new DriverError('Test', 'TEST');
    const regularError = new Error('Regular error');
    
    expect(isDriverError(driverError)).toBe(true);
    expect(isDriverError(regularError)).toBe(false);
    expect(isDriverError(null)).toBe(false);
    expect(isDriverError(undefined)).toBe(false);
  });

  it('should identify retryable errors', () => {
    const retryableError = new DriverError('Test', 'TEST', true);
    const nonRetryableError = new DriverError('Test', 'TEST', false);
    const regularError = new Error('Regular error');
    
    expect(isRetryableError(retryableError)).toBe(true);
    expect(isRetryableError(nonRetryableError)).toBe(false);
    expect(isRetryableError(regularError)).toBe(false);
  });

  it('should get error code from DriverError', () => {
    const driverError = new DriverError('Test', 'TEST_CODE');
    const regularError = new Error('Regular error');
    
    expect(getErrorCode(driverError)).toBe('TEST_CODE');
    expect(getErrorCode(regularError)).toBeUndefined();
    expect(getErrorCode(null)).toBeUndefined();
  });

  it('should get error message from various error types', () => {
    const driverError = new DriverError('Driver error message', 'TEST');
    const regularError = new Error('Regular error message');
    const stringError = 'String error';
    const nullError = null;
    
    expect(getErrorMessage(driverError)).toBe('Driver error message');
    expect(getErrorMessage(regularError)).toBe('Regular error message');
    expect(getErrorMessage(stringError)).toBe('String error');
    expect(getErrorMessage(nullError)).toBe('null');
  });
});