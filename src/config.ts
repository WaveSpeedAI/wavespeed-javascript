/**
 * Configuration module for WaveSpeed SDK.
 */

/**
 * Get environment variable value (works in both Node.js and browser)
 */
function getEnv(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name];
  }
  return undefined;
}

/**
 * API client configuration options.
 */
export class api {
  // Authentication
  static apiKey: string | undefined = getEnv('WAVESPEED_API_KEY');

  // API base URL
  static baseUrl: string = 'https://api.wavespeed.ai';

  // Connection timeout in seconds
  static connectionTimeout: number = 10.0;

  // Total API call timeout in seconds
  static timeout: number = 36000.0;

  // Maximum number of retries for the entire operation (task-level retries)
  static maxRetries: number = 0;

  // Maximum number of retries for individual HTTP requests (connection errors, timeouts)
  static maxConnectionRetries: number = 5;

  // Base interval between retries in seconds (actual delay = retryInterval * attempt)
  static retryInterval: number = 1.0;
}
