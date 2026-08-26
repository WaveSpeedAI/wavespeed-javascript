/**
 * WaveSpeed API client implementation.
 */

import { api as apiConfig } from '../config';
import { version } from '../version';

/**
 * Default client name reported in the X-Client-Name attribution header.
 */
const DEFAULT_CLIENT_NAME = 'wavespeed-js';

/**
 * HTTP status codes that are safe to retry on result-query GETs
 * (transient server errors and rate limiting), matching the Python SDK.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Statuses that mean the task has reached a terminal, non-successful state
 * and polling must stop.
 */
const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'cancelled', 'timeout', 'deleted']);

/**
 * Minimal filename-extension to MIME type mapping used to populate the
 * content_type field of upload tickets (mirrors Python's mimetypes usage).
 */
const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/x-wav',
  ogg: 'audio/ogg',
  flac: 'audio/x-flac',
  m4a: 'audio/mp4',
  json: 'application/json',
  txt: 'text/plain',
  pdf: 'application/pdf',
  zip: 'application/zip',
};

/**
 * Guess the MIME type for a filename; returns undefined when unknown so the
 * field can be omitted (same behavior as Python's mimetypes.guess_type).
 */
function guessContentType(filename: string): string | undefined {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return undefined;
  return MIME_TYPES[filename.slice(dot + 1).toLowerCase()];
}

/**
 * Get the lowercase operating system name for the X-Client-OS header.
 * Uses process.platform in Node.js (mapping win32 -> windows) and falls
 * back to user agent parsing in browser environments.
 */
function getOperatingSystem(): string {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'win32' ? 'windows' : process.platform;
  }

  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('mac os x') || userAgent.includes('macintosh')) {
      return 'darwin';
    } else if (
      userAgent.includes('windows') ||
      userAgent.includes('win64') ||
      userAgent.includes('win32')
    ) {
      return 'windows';
    } else if (userAgent.includes('android')) {
      return 'android';
    } else if (
      userAgent.includes('iphone') ||
      userAgent.includes('ipad') ||
      userAgent.includes('ipod')
    ) {
      return 'ios';
    } else if (userAgent.includes('linux')) {
      return 'linux';
    }
  }

  return 'unknown';
}

/**
 * Resolve the client name for attribution headers.
 * Priority: WAVESPEED_CLIENT_NAME env var > explicit option > default.
 */
function resolveClientName(explicitName?: string): string {
  if (
    typeof process !== 'undefined' &&
    process.env &&
    process.env.WAVESPEED_CLIENT_NAME
  ) {
    return process.env.WAVESPEED_CLIENT_NAME;
  }
  return explicitName || DEFAULT_CLIENT_NAME;
}

/**
 * Run options interface.
 */
export interface RunOptions {
  timeout?: number;           // Maximum time to wait for completion
  pollInterval?: number;      // Interval between status checks in seconds
  enableSyncMode?: boolean;   // If true, attempt synchronous mode in one request
  maxRetries?: number;        // Maximum task-level retries (overrides client setting)
}

/**
 * Base exception class for WaveSpeed errors
 */
export class WavespeedException extends Error {
  constructor(
    message: string,
    public readonly taskId: string = 'unknown',
    public readonly model: string = ''
  ) {
    super(message);
    this.name = 'WavespeedException';
  }
}

/**
 * Timeout exception
 */
export class WavespeedTimeoutException extends WavespeedException {
  constructor(taskId: string, model: string, public readonly timeout: number) {
    super(`Prediction timed out after ${timeout} seconds`, taskId, model);
    this.name = 'WavespeedTimeoutException';
  }
}

/**
 * Sync-mode wait timed out, but the task is still processing asynchronously
 */
export class WavespeedSyncTimeoutException extends WavespeedException {
  constructor(
    taskId: string,
    model: string,
    errorMessage: string,
    public readonly resultUrl?: string
  ) {
    const suffix = resultUrl && !errorMessage.includes(resultUrl)
      ? ` Query the result later at: ${resultUrl}`
      : '';
    super(`Sync mode timed out (task_id: ${taskId}): ${errorMessage}${suffix}`, taskId, model);
    this.name = 'WavespeedSyncTimeoutException';
  }
}

/**
 * Connection exception
 */
export class WavespeedConnectionException extends WavespeedException {
  constructor(taskId: string, model: string, details: string) {
    super(`Connection failed: ${details}`, taskId, model);
    this.name = 'WavespeedConnectionException';
  }
}

/**
 * A task submission failed and must not be retried automatically.
 */
export class WavespeedSubmissionException extends WavespeedException {
  constructor(model: string, details: string) {
    super(
      `Prediction submission failed: ${details}. The task may already have been created, so the SDK will not retry the POST automatically.`,
      'unknown',
      model
    );
    this.name = 'WavespeedSubmissionException';
  }
}

/**
 * Prediction failed exception
 */
export class WavespeedPredictionException extends WavespeedException {
  constructor(taskId: string, model: string, errorMessage: string) {
    super(`Prediction failed: ${errorMessage}`, taskId, model);
    this.name = 'WavespeedPredictionException';
  }
}

/**
 * Unknown exception
 */
export class WavespeedUnknownException extends WavespeedException {
  constructor(taskId: string, model: string, originalError: any) {
    super(String(originalError), taskId, model);
    this.name = 'WavespeedUnknownException';
  }
}

/**
 * Detail information for runNoThrow result.
 */
export interface RunDetail {
  taskId: string;             // Task ID for tracking and debugging
  status: 'completed' | 'failed' | 'processing';  // Task status
  model: string;              // Model identifier
  error?: WavespeedException; // Exception instance if failed
  createdAt?: string;         // Task creation timestamp
  resultUrl?: string;         // URL for querying the task result later
}

/**
 * Result interface for runNoThrow method.
 */
export interface RunNoThrowResult {
  outputs: any[] | null;      // Model outputs (null if failed)
  detail: RunDetail;          // Detailed information including taskId
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
    upload: {
      method: string;
      url: string;
      headers: Record<string, string>;
      expires_at: string;
    };
  };
}

/**
 * WaveSpeed API client.
 *
 * Example:
 *     const client = new Client("your-api-key");
 *     const output = await client.run("wavespeed-ai/z-image/turbo", { prompt: "Cat" });
 *
 *     // With sync mode (best-effort single request, waits for result)
 *     const output2 = await client.run("wavespeed-ai/z-image/turbo", { prompt: "Cat" }, { enableSyncMode: true });
 *
 *     // Replacement task attempts stay disabled by default.
 *     const output3 = await client.run("wavespeed-ai/z-image/turbo", { prompt: "Cat" }, { maxRetries: 0 });
 */
export class Client {
  private apiKey: string;
  private baseUrl: string;
  readonly clientName: string;
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
   *     options.maxConnectionRetries: Maximum retries for result-query GET requests.
   *     options.retryInterval: Base interval between retries in seconds.
   *     options.clientName: Client name reported in the X-Client-Name header
   *         (the WAVESPEED_CLIENT_NAME environment variable takes priority).
   */
  constructor(
    apiKey?: string,
    options?: {
      baseUrl?: string;
      clientName?: string;
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
    this.clientName = resolveClientName(options?.clientName);
  }

  /**
   * Get channel-attribution headers identifying this client.
   */
  private _getClientHeaders(): Record<string, string> {
    return {
      'X-Client-Name': this.clientName,
      'X-Client-Version': version,
      'X-Client-OS': getOperatingSystem(),
    };
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
      ...this._getClientHeaders(),
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
    // fetch cannot separate the connect phase from the read phase, so the
    // abort must cover the total request window. Aborting at the (short)
    // connection timeout would cap the whole request and break sync mode,
    // which legitimately holds the connection open until the result is ready.
    const controller = new AbortController();
    const timeoutId = requestTimeout
      ? setTimeout(() => controller.abort(), requestTimeout * 1000)
      : undefined;

    let response: Response;
    try {
      // Single-shot by contract: a submission POST is never retried, since
      // the task may already have been created server-side.
      response = await fetch(url, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error: any) {
      throw new WavespeedSubmissionException(model, error?.message || String(error));
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new WavespeedSubmissionException(
        model,
        `HTTP ${response.status}: ${errorText}`
      );
    }

    const result = await response.json();

    if (enableSyncMode) {
      return [null, result];
    }

    const requestId = result.data?.id;
    if (!requestId) {
      throw new WavespeedSubmissionException(
        model,
        `No request ID in response: ${JSON.stringify(result)}`
      );
    }

    return [requestId, null];
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

    // Connection-level retries (idempotent GET, safe to repeat)
    for (let retry = 0; retry <= this.maxConnectionRetries; retry++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: this._getHeaders(),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
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
          continue;
        } else if (retry >= this.maxConnectionRetries) {
          throw new Error(
            `Failed to get result for task ${requestId} after ${this.maxConnectionRetries + 1} attempts: ${lastError?.message}`
          );
        } else {
          throw error;
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        const httpError = new Error(
          `Failed to get result for task ${requestId}: HTTP ${response.status}: ${errorText}`
        );

        // Retry on transient server errors (5xx) and rate limiting (429),
        // matching the Python SDK's result-query retry policy.
        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          lastError = httpError;
          if (retry < this.maxConnectionRetries) {
            const delay = this.retryInterval * (retry + 1) * 1000;
            console.log(
              `Server error (HTTP ${response.status}) getting result on attempt ` +
              `${retry + 1}/${this.maxConnectionRetries + 1}, retrying in ${delay}ms...`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        throw httpError;
      }

      return await response.json();
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

      if (TERMINAL_FAILURE_STATUSES.has(status)) {
        // cancelled, timeout, and deleted are terminal too: keep polling and the task
        // will never complete, so surface the API's error text and stop.
        const error = data.error || `Task ${status}`;
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

    if (error instanceof WavespeedSubmissionException) {
      return false;
    }

    // Always retry timeout and connection errors
    const errorStr = error.toString().toLowerCase();
    if (errorStr.includes('sync mode timed out')) {
      return false;
    }
    if (errorStr.includes('timeout') || errorStr.includes('connection')) {
      return true;
    }

    // Retry server errors (5xx) and rate limiting (429)
    if (errorStr.includes('http 5') || errorStr.includes('429')) {
      return true;
    }

    return false;
  }

  private _resultUrlFromData(data: Record<string, any>): string | undefined {
    return data.id ? `${this.baseUrl}/api/v3/predictions/${data.id}/result` : undefined;
  }

  private _isSyncTimeoutData(data: Record<string, any>): boolean {
    const error = data.error || '';
    return data.code === 5004 ||
      (data.status === 'processing' && typeof error === 'string' && error.includes('Sync mode timed out'));
  }

  private _syncModeError(data: Record<string, any>, model: string): Error {
    const error = data.error || 'Unknown error';
    const taskId = data.id || 'unknown';

    if (this._isSyncTimeoutData(data)) {
      return new WavespeedSyncTimeoutException(
        taskId,
        model,
        error,
        this._resultUrlFromData(data)
      );
    }

    return new Error(`Prediction failed (task_id: ${taskId}): ${error}`);
  }

  /**
   * Run a model and wait for the output.
   *
   * Args:
   *     model: Model identifier (e.g., "wavespeed-ai/z-image/turbo").
   *     input: Input parameters for the model.
   *     options.timeout: Maximum time to wait for completion (undefined = no timeout).
   *     options.pollInterval: Interval between status checks in seconds.
   *     options.enableSyncMode: If true, use synchronous mode (best-effort single request).
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
            throw this._syncModeError(data, model);
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
   * Run a model and wait for the output (no-throw version).
   * 
   * This method is similar to run() but does not throw exceptions.
   * Instead, it returns a result object with outputs (null on failure) and detail information.
   * The detail object always contains the taskId, which is useful for debugging and tracking.
   *
   * Args:
   *     model: Model identifier (e.g., "wavespeed-ai/z-image/turbo").
   *     input: Input parameters for the model.
   *     options.timeout: Maximum time to wait for completion (undefined = no timeout).
   *     options.pollInterval: Interval between status checks in seconds.
   *     options.enableSyncMode: If true, use synchronous mode (best-effort single request).
   *     options.maxRetries: Maximum task-level retries (overrides client setting).
   *
   * Returns:
   *     Object containing:
   *       - outputs: Array of model outputs (null if failed)
   *       - detail: Object with taskId, status, error (if any), and other metadata
   *
   * Example:
   *     const result = await client.runNoThrow("wavespeed-ai/z-image/turbo", { prompt: "Cat" });
   *     
   *     if (result.outputs) {
   *       console.log("Success:", result.outputs);
   *       console.log("Task ID:", result.detail.taskId);
   *     } else {
   *       console.log("Failed:", result.detail.error);
   *       console.log("Task ID:", result.detail.taskId);
   *     }
   */
  async runNoThrow(
    model: string,
    input?: Record<string, any>,
    options?: RunOptions
  ): Promise<RunNoThrowResult> {
    const taskRetries = options?.maxRetries ?? this.maxRetries;
    const timeout = options?.timeout ?? this.timeout;
    const pollInterval = options?.pollInterval ?? 1.0;
    const enableSyncMode = options?.enableSyncMode ?? false;

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
          const taskId = data.id || 'unknown';

          if (status !== 'completed') {
            const errorMsg = data.error || 'Unknown error';
            const resultUrl = this._resultUrlFromData(data);
            const isSyncTimeout = this._isSyncTimeoutData(data);
            return {
              outputs: null,
              detail: {
                taskId,
                status: isSyncTimeout ? 'processing' : 'failed',
                model,
                error: isSyncTimeout
                  ? new WavespeedSyncTimeoutException(taskId, model, errorMsg, resultUrl)
                  : new WavespeedPredictionException(taskId, model, errorMsg),
                createdAt: data.created_at,
                resultUrl
              }
            };
          }

          return {
            outputs: data.outputs || [],
            detail: {
              taskId,
              status: 'completed',
              model,
              createdAt: data.created_at
            }
          };
        }

        if (requestId) {
          const result = await this._wait(requestId, timeout, pollInterval);
          return {
            outputs: result.outputs,
            detail: {
              taskId: requestId,
              status: 'completed',
              model
            }
          };
        }

        // Should not reach here
        return {
          outputs: null,
          detail: {
            taskId: 'unknown',
            status: 'failed',
            model,
            error: new WavespeedUnknownException('unknown', model, 'Invalid response from _submit')
          }
        };

      } catch (error: any) {
        const isRetryable = this._isRetryableError(error);

        // If not retryable or last attempt, return error result
        if (!isRetryable || attempt >= taskRetries) {
          // Try to extract taskId from error message
          const taskIdMatch = error.message?.match(/task_id:\s*([^)]+)/);
          const taskId = taskIdMatch ? taskIdMatch[1] : 'unknown';
          const resultUrlMatch = error.message?.match(/Query the result later at:\s*(\S+)/);
          const resultUrl = resultUrlMatch ? resultUrlMatch[1] : undefined;

          // Determine exception type based on error
          let exception: WavespeedException;
          const errorStr = error.toString().toLowerCase();
          
          if (errorStr.includes('sync mode timed out')) {
            exception = new WavespeedSyncTimeoutException(
              taskId,
              model,
              error.message?.replace(/Sync mode timed out \(task_id: [^)]+\):\s*/, '') || String(error),
              resultUrl
            );
          } else if (errorStr.includes('timeout') || errorStr.includes('timed out')) {
            exception = new WavespeedTimeoutException(taskId, model, timeout || 0);
          } else if (errorStr.includes('connection') || errorStr.includes('fetch') || error.name === 'AbortError' || error.name === 'TypeError') {
            exception = new WavespeedConnectionException(taskId, model, error.message || String(error));
          } else if (errorStr.includes('prediction failed')) {
            const errorMsg = error.message?.replace(/Prediction failed \(task_id: [^)]+\): /, '') || 'Unknown error';
            exception = new WavespeedPredictionException(taskId, model, errorMsg);
          } else {
            exception = new WavespeedUnknownException(taskId, model, error);
          }

          return {
            outputs: null,
            detail: {
              taskId,
              status: errorStr.includes('sync mode timed out') ? 'processing' : 'failed',
              model,
              error: exception,
              resultUrl
            }
          };
        }

        // Retry
        console.log(`Task attempt ${attempt + 1}/${taskRetries + 1} failed: ${error}`);
        const delay = this.retryInterval * (attempt + 1) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Should not reach here, but just in case
    return {
      outputs: null,
      detail: {
        taskId: 'unknown',
        status: 'failed',
        model,
        error: new WavespeedUnknownException('unknown', model, `All ${taskRetries + 1} attempts failed`)
      }
    };
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

    const url = `${this.baseUrl}/api/v3/media/uploads`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      ...this._getClientHeaders(),
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

    const filename = path.basename(file);
    const size = fs.statSync(file).size;
    const ticketPayload: Record<string, any> = { filename, size };
    const contentType = guessContentType(filename);
    if (contentType) {
      ticketPayload.content_type = contentType;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketPayload),
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

      const instruction = result.data?.upload;
      if (!instruction?.url || instruction.method.toUpperCase() !== 'PUT') {
        throw new Error('Upload failed: invalid upload instruction');
      }

      const data = fs.readFileSync(file);
      const uploadController = new AbortController();
      const uploadTimeoutId = setTimeout(() => uploadController.abort(), timeout * 1000);
      try {
        const uploadResponse = await fetch(instruction.url, {
          method: 'PUT',
          headers: instruction.headers,
          body: data,
          signal: uploadController.signal,
        });
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(
            `Failed to upload file: HTTP ${uploadResponse.status}: ${errorText}`
          );
        }
      } finally {
        clearTimeout(uploadTimeoutId);
      }

      return downloadUrl;

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
