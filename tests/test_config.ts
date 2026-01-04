/**
 * Tests for the config module.
 */

import { api } from '../src/config';

describe('api config', () => {
  test('has expected attributes', () => {
    expect(api).toHaveProperty('apiKey');
    expect(api).toHaveProperty('baseUrl');
    expect(api).toHaveProperty('connectionTimeout');
    expect(api).toHaveProperty('timeout');
    expect(api).toHaveProperty('maxRetries');
    expect(api).toHaveProperty('maxConnectionRetries');
    expect(api).toHaveProperty('retryInterval');
  });

  test('has correct default values', () => {
    expect(api.baseUrl).toBe('https://api.wavespeed.ai');
    expect(api.connectionTimeout).toBe(10.0);
    expect(api.timeout).toBe(36000.0);
    expect(api.maxRetries).toBe(0);
    expect(api.maxConnectionRetries).toBe(5);
    expect(api.retryInterval).toBe(1.0);
  });
});
