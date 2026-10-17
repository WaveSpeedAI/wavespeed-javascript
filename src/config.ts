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
 * Read a positive number of seconds from an environment variable.
 */
function getEnvSeconds(name: string): number | undefined {
  const raw = getEnv(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
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

  // Overall wait cap in seconds. undefined (default) = no limit: wait until
  // the task reaches a terminal status. Env: WAVESPEED_TIMEOUT.
  static timeout: number | undefined = getEnvSeconds('WAVESPEED_TIMEOUT');

  // Abort timeout in seconds for a single async submit POST or result GET, so
  // a half-open connection fails that one request instead of hanging.
  // Env: WAVESPEED_READ_TIMEOUT.
  static readTimeout: number = getEnvSeconds('WAVESPEED_READ_TIMEOUT') ?? 120.0;

  // Maximum number of retries for the entire operation (task-level retries)
  static maxRetries: number = 0;

  // Maximum retries for idempotent result-query GET requests. Submission
  // POSTs are intentionally sent at most once.
  static maxConnectionRetries: number = 5;

  // Base interval between retries in seconds (actual delay = retryInterval * attempt)
  static retryInterval: number = 1.0;
}
