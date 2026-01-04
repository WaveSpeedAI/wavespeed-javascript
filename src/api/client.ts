/**
 * WaveSpeed API client implementation.
 */

import { api as apiConfig } from '../config';

/**
 * Run options interface.
 */
export interface RunOptions {
  timeout?: number;           // Maximum time to wait for completion
  pollInterval?: number;      // Interval between status checks in seconds
  enableSyncMode?: boolean;   // If true, use synchronous mode (single request)
  maxRetries?: number;        // Maximum task-level retries (overrides client setting)
}

/**
 * Upload file response interface
 */
interface UploadFileResp {
  code: number;
  message: string;
  data: {
    type: string;
    download_url: string;
    filename: string;
    size: number;
  };
}

/**
 * WaveSpeed API client.
 *
 * Example:
 *     const client = new Client("your-api-key");
 *     const output = await client.run("wavespeed-ai/z-image/turbo", { prompt: "Cat" });
 *
 *     // With sync mode (single request, waits for result)
 *     const output2 = await client.run("wavespeed-ai/z-image/turbo", { prompt: "Cat" }, { enableSyncMode: true });
 *
 *     // With retry
 *     const output3 = await client.run("wavespeed-ai/z-image/turbo", { prompt: "Cat" }, { maxRetries: 3 });
 */
export class Client {
  private apiKey: string;
  private baseUrl: string;
  readonly connectionTimeout: number;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly maxConnectionRetries: number;
  readonly retryInterval: number;

  /**
   * Initialize the client.
   *
   * Args:
   *     apiKey: WaveSpeed API key. If not provided, uses wavespeed.config.api.apiKey.
   *     options.baseUrl: Base URL for the API. If not provided, uses wavespeed.config.api.baseUrl.
   *     options.connectionTimeout: Timeout for HTTP requests in seconds.
   *     options.timeout: Total API call timeout in seconds.
   *     options.maxRetries: Maximum number of retries for the entire operation.
   *     options.maxConnectionRetries: Maximum retries for individual HTTP requests.
   *     options.retryInterval: Base interval between retries in seconds.
   */
  constructor(
    apiKey?: string,
    options?: {
      baseUrl?: string;
      connectionTimeout?: number;
      timeout?: number;
      maxRetries?: number;
      maxConnectionRetries?: number;
      retryInterval?: number;
    }
  ) {
    this.apiKey = apiKey || apiConfig.apiKey || '';
    this.baseUrl = (options?.baseUrl || apiConfig.baseUrl).replace(/\/+$/, '');
    this.connectionTimeout = options?.connectionTimeout ?? apiConfig.connectionTimeout;
    this.timeout = options?.timeout ?? apiConfig.timeout;
    this.maxRetries = options?.maxRetries ?? apiConfig.maxRetries;
    this.maxConnectionRetries = options?.maxConnectionRetries ?? apiConfig.maxConnectionRetries;
    this.retryInterval = options?.retryInterval ?? apiConfig.retryInterval;
  }

  /**
   * Get request headers with authentication.
   */
  private _getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new Error(
        'API key is required. Set WAVESPEED_API_KEY environment variable ' +
        'or pass apiKey to Client().'
      );
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Submit a prediction request.
   *
   * Args:
   *     model: Model identifier.
   *     input: Input parameters.
   *     enableSyncMode: If true, wait for result in single request.
   *     timeout: Request timeout in seconds.
   *
   * Returns:
   *     Tuple of [requestId, result]. In async mode, result is null.
   *     In sync mode, requestId is null and result contains the response.
   *
   * Throws:
   *     Error: If submission fails after retries.
   */
  private async _submit(
    model: string,
    input?: Record<string, any>,
    enableSyncMode: boolean = false,
    timeout?: number
  ): Promise<[string | null, Record<string, any> | null]> {
    const url = `${this.baseUrl}/api/v3/${model}`;
    const body = input ? { ...input } : {};

    if (enableSyncMode) {
      body.enable_sync_mode = true;
    }

    const requestTimeout = timeout ?? this.timeout;
    // Use connection timeout for connect, request_timeout for read
    const connectTimeout = requestTimeout
      ? Math.min(this.connectionTimeout, requestTimeout)
      : this.connectionTimeout;
    const timeoutMs = connectTimeout * 1000;

    let lastError: Error | undefined;

    // Connection-level retries
    for (let retry = 0; retry <= this.maxConnectionRetries; retry++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: this._getHeaders(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Failed to submit prediction: HTTP ${response.status}: ${errorText}`
          );
        }

        const result = await response.json();

        if (enableSyncMode) {
          return [null, result];
        }

        const requestId = result.data?.id;
        if (!requestId) {
          throw new Error(`No request ID in response: ${JSON.stringify(result)}`);
        }

        return [requestId, null];

      } catch (error: any) {
        clearTimeout(timeoutId);
        lastError = error;

        const isConnectionError =
          error.name === 'AbortError' ||
          error.name === 'TypeError' ||
          error.message?.includes('fetch');

        if (isConnectionError && retry < this.maxConnectionRetries) {
          const delay = this.retryInterval * (retry + 1) * 1000;
          console.log(`Connection error on attempt ${retry + 1}/${this.maxConnectionRetries + 1}:`);
          console.error(error);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else if (retry >= this.maxConnectionRetries) {
          throw new Error(
            `Failed to submit prediction after ${this.maxConnectionRetries + 1} attempts: ${lastError?.message}`
          );
        } else {
          throw error;
        }
      }
    }

    throw lastError!;
  }

  /**
   * Get prediction result.
   *
   * Args:
   *     requestId: The prediction request ID.
   *     timeout: Request timeout in seconds.
   *
   * Returns:
   *     Full API response.
   *
   * Throws:
   *     Error: If fetching result fails after retries.
   */
  private async _getResult(
    requestId: string,
    timeout?: number
  ): Promise<Record<string, any>> {
    const url = `${this.baseUrl}/api/v3/predictions/${requestId}/result`;
    const requestTimeout = timeout ?? this.timeout;
    const connectTimeout = requestTimeout
      ? Math.min(this.connectionTimeout, requestTimeout)
      : this.connectionTimeout;
    const timeoutMs = connectTimeout * 1000;

    let lastError: Error | undefined;

    // Connection-level retries
    for (let retry = 0; retry <= this.maxConnectionRetries; retry++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: this._getHeaders(),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Failed to get result for task ${requestId}: HTTP ${response.status}: ${errorText}`
          );
        }

        return await response.json();

      } catch (error: any) {
        clearTimeout(timeoutId);
        lastError = error;

        const isConnectionError =
          error.name === 'AbortError' ||
          error.name === 'TypeError' ||
          error.message?.includes('fetch');

        if (isConnectionError && retry < this.maxConnectionRetries) {
          const delay = this.retryInterval * (retry + 1) * 1000;
          console.log(`Connection error getting result on attempt ${retry + 1}/${this.maxConnectionRetries + 1}:`);
          console.error(error);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else if (retry >= this.maxConnectionRetries) {
          throw new Error(
            `Failed to get result for task ${requestId} after ${this.maxConnectionRetries + 1} attempts: ${lastError?.message}`
          );
        } else {
          throw error;
        }
      }
    }

    throw lastError!;
  }

  /**
   * Wait for prediction to complete.
   *
   * Args:
   *     requestId: The prediction request ID.
   *     timeout: Maximum wait time in seconds (undefined = no timeout).
   *     pollInterval: Time between polls in seconds.
   *
   * Returns:
   *     Dict with "outputs" array.
   *
   * Throws:
   *     Error: If prediction fails.
   *     Error: If prediction times out.
   */
  private async _wait(
    requestId: string,
    timeout: number | undefined,
    pollInterval: number
  ): Promise<Record<string, any>> {
    const startTime = Date.now();

    while (true) {
      // Check timeout
      if (timeout !== undefined) {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= timeout) {
          throw new Error(
            `Prediction timed out after ${timeout} seconds (task_id: ${requestId})`
          );
        }
      }

      const result = await this._getResult(requestId, timeout);
      const data = result.data || {};
      const status = data.status;

      if (status === 'completed') {
        return { outputs: data.outputs || [] };
      }

      if (status === 'failed') {
        const error = data.error || 'Unknown error';
        throw new Error(`Prediction failed (task_id: ${requestId}): ${error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval * 1000));
    }
  }

  /**
   * Determine if an error is worth retrying at the task level.
   *
   * Args:
   *     error: The exception to check.
   *
   * Returns:
   *     True if the error is retryable.
   */
  private _isRetryableError(error: any): boolean {
    if (!error) return false;

    // Always retry timeout and connection errors
    const errorStr = error.toString().toLowerCase();
    if (errorStr.includes('timeout') || errorStr.includes('connection')) {
      return true;
    }

    // Retry server errors (5xx) and rate limiting (429)
    if (errorStr.includes('http 5') || errorStr.includes('429')) {
      return true;
    }

    return false;
  }

  /**
   * Run a model and wait for the output.
   *
   * Args:
   *     model: Model identifier (e.g., "wavespeed-ai/flux-dev").
   *     input: Input parameters for the model.
   *     options.timeout: Maximum time to wait for completion (undefined = no timeout).
   *     options.pollInterval: Interval between status checks in seconds.
   *     options.enableSyncMode: If true, use synchronous mode (single request).
   *     options.maxRetries: Maximum task-level retries (overrides client setting).
   *
   * Returns:
   *     Dict containing "outputs" array with model outputs.
   *
   * Throws:
   *     Error: If API key is not configured.
   *     Error: If the prediction fails.
   *     Error: If the prediction times out.
   */
  async run(
    model: string,
    input?: Record<string, any>,
    options?: RunOptions
  ): Promise<Record<string, any>> {
    const taskRetries = options?.maxRetries ?? this.maxRetries;
    const timeout = options?.timeout ?? this.timeout;
    const pollInterval = options?.pollInterval ?? 1.0;
    const enableSyncMode = options?.enableSyncMode ?? false;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= taskRetries; attempt++) {
      try {
        const [requestId, syncResult] = await this._submit(
          model,
          input,
          enableSyncMode,
          timeout
        );

        if (enableSyncMode) {
          // In sync mode, extract outputs from the result
          const data = syncResult?.data || {};
          const status = data.status;
          if (status !== 'completed') {
            const error = data.error || 'Unknown error';
            const requestId = data.id || 'unknown';
            throw new Error(`Prediction failed (task_id: ${requestId}): ${error}`);
          }
          return { outputs: data.outputs || [] };
        }

        if (requestId) {
          return await this._wait(requestId, timeout, pollInterval);
        }

        throw new Error('Invalid response from _submit');

      } catch (error: any) {
        lastError = error;
        const isRetryable = this._isRetryableError(error);

        if (!isRetryable || attempt >= taskRetries) {
          throw error;
        }

        console.log(`Task attempt ${attempt + 1}/${taskRetries + 1} failed: ${error}`);
        const delay = this.retryInterval * (attempt + 1) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Should not reach here, but just in case
    if (lastError) {
      throw lastError;
    }
    throw new Error(`All ${taskRetries + 1} attempts failed`);
  }

  /**
   * Upload a file to WaveSpeed.
   *
   * Args:
   *     file: File path string to upload.
   *     options.timeout: Total API call timeout in seconds.
   *
   * Returns:
   *     URL of the uploaded file.
   *
   * Throws:
   *     Error: If API key is not configured.
   *     Error: If file path does not exist.
   *     Error: If upload fails.
   *
   * Example:
   *     const url = await client.upload("/path/to/image.png");
   *     console.log(url);
   */
  async upload(file: string, options?: { timeout?: number }): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        'API key is required. Set WAVESPEED_API_KEY environment variable ' +
        'or pass apiKey to Client().'
      );
    }

    const url = `${this.baseUrl}/api/v3/media/upload/binary`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
    };
    const timeout = options?.timeout ?? this.timeout;
    const requestTimeout = Math.min(this.connectionTimeout, timeout);
    const timeoutMs = requestTimeout * 1000;

    // Node.js environment check
    let fs: any;
    let path: any;
    try {
      fs = require('fs');
      path = require('path');
    } catch (err) {
      throw new Error('File path uploads are only supported in Node.js environments.');
    }

    if (!fs.existsSync(file)) {
      throw new Error(`File not found: ${file}`);
    }

    const data = fs.readFileSync(file);
    const filename = path.basename(file);
    const form = new FormData();
    const blob = new Blob([data]);
    form.append('file', blob, filename);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: form,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload file: HTTP ${response.status}: ${errorText}`);
      }

      const result: UploadFileResp = await response.json();
      if (result.code !== 200) {
        throw new Error(`Upload failed: ${result.message || 'Unknown error'}`);
      }

      const downloadUrl = result.data?.download_url;
      if (!downloadUrl) {
        throw new Error('Upload failed: no download_url in response');
      }

      return downloadUrl;

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
