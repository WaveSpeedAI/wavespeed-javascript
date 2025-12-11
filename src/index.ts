/**
 * Input parameters for image generation
 */

/**
 * Prediction status
 */
export type PredictionStatus = 'created' | 'processing' | 'completed' | 'failed';

/**
 * Prediction URLs
 */
export interface PredictionUrls {
  get: string;
}

export interface UploadFileResp {
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
 * User-facing run options
 */
export interface RunOptions {
  timeout?: number; // overall wait timeout in seconds
  pollInterval?: number; // per-call poll interval override
}

// Internal options used inside the SDK
type InternalRequestOptions = RunOptions &
  RequestInit & {
    webhook?: string;
    isUpload?: boolean;
    maxRetries?: number;
    waitTimeout?: number; // deprecated alias for timeout
  };

/**
 * Prediction model representing an image generation job
 */
export class Prediction {
  id: string;
  model: string;
  status: PredictionStatus;
  input: Record<string, any>;
  outputs: string[];
  urls: PredictionUrls;
  has_nsfw_contents: boolean[];
  created_at: string;
  error?: string;
  executionTime?: number;

  private client: WaveSpeed;

  constructor(data: any, client: WaveSpeed) {
    this.id = data.id;
    this.model = data.model;
    this.status = data.status;
    this.input = data.input;
    this.outputs = data.outputs || [];
    this.urls = data.urls;
    this.has_nsfw_contents = data.has_nsfw_contents || [];
    this.created_at = data.created_at;
    this.error = data.error;
    this.executionTime = data.executionTime;
    this.client = client;
  }

  /**
   * Wait for the prediction to complete
   */
  async wait(pollIntervalSeconds?: number, totalTimeoutSeconds?: number): Promise<Prediction> {
    const startedAt = Date.now();
    const interval = pollIntervalSeconds ?? this.client.pollInterval;
    if (this.status === 'completed' || this.status === 'failed') {
      return this;
    }

    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          if (typeof totalTimeoutSeconds === 'number') {
            const elapsedSeconds = (Date.now() - startedAt) / 1000;
            if (elapsedSeconds >= totalTimeoutSeconds) {
              throw new Error(`Prediction timed out after ${totalTimeoutSeconds} seconds`);
            }
          }

          const updated = await this.reload();
          if (updated.status === 'completed' || updated.status === 'failed') {
            resolve(updated);
          } else {
            setTimeout(checkStatus, interval * 1000);
          }
        } catch (error) {
          reject(error);
        }
      };

      checkStatus();
    });
  }

  /**
   * Reload the prediction status
   */
  async reload(): Promise<Prediction> {
    const response = await this.client.fetchWithTimeout(`predictions/${this.id}/result`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to reload prediction: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const updatedPrediction = new Prediction(data.data, this.client);

    // Update this instance with new data
    Object.assign(this, updatedPrediction);

    return this;
  }
}

/**
 * WaveSpeed client for generating images
 */
export class WaveSpeed {
  private apiKey: string;
  private baseUrl: string;
  readonly pollInterval: number;
  readonly timeout?: number; // overall wait timeout (seconds)
  private readonly requestTimeout: number; // per-request timeout (seconds), internal

  /**
   * Create a new WaveSpeed client
   * 
   * @param apiKey Your WaveSpeed API key (or set WAVESPEED_API_KEY environment variable)
   * @param options Additional client options
   */
  constructor(
    apiKey?: string,
    options: {
      baseUrl?: string;
      pollInterval?: number;
      timeout?: number; // overall wait timeout
    } = {},
  ) {
    const getEnvVar = (name: string): string | undefined => {
      if (typeof process !== 'undefined' && process.env && process.env[name]) {
        return process.env[name];
      }
      return undefined;
    };

    this.apiKey = apiKey || getEnvVar('WAVESPEED_API_KEY') || '';
    if (!this.apiKey) {
      throw new Error('API key is required. Provide it as a parameter or set the WAVESPEED_API_KEY environment variable.');
    }

    const envBaseUrl = getEnvVar('WAVESPEED_BASE_URL');
    this.baseUrl = (options.baseUrl || envBaseUrl || 'https://api.wavespeed.ai').replace(/\/+$/, '');

    const envPoll = Number(getEnvVar('WAVESPEED_POLL_INTERVAL'));
    const envTimeout = Number(getEnvVar('WAVESPEED_TIMEOUT')); // overall wait timeout
    const envRequestTimeout = Number(getEnvVar('WAVESPEED_REQUEST_TIMEOUT')); // per-request timeout (internal)

    this.pollInterval = options.pollInterval ?? (Number.isFinite(envPoll) ? envPoll : 1);
    this.timeout = options.timeout ?? (Number.isFinite(envTimeout) ? envTimeout : 36000); // align with Python default wait
    this.requestTimeout = Number.isFinite(envRequestTimeout) ? envRequestTimeout : 120;
  }

  private buildUrl(path: string): string {
    const cleanPath = path.replace(/^\/+/, '');
    return `${this.baseUrl}/api/v3/${cleanPath}`;
  }

  private getHeaders(isUpload?: boolean, extra?: HeadersInit): HeadersInit {
    if (isUpload) {
      return {
        Authorization: `Bearer ${this.apiKey}`,
        ...(extra || {}),
      };
    }
    return {
        Authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...(extra || {}),
    };
  }

  /**
   * Fetch with timeout support
   * 
   * @param path API path
   * @param options Fetch options
   */
  async fetchWithTimeout(path: string, options: InternalRequestOptions = {}): Promise<Response> {
    const {
      timeout: _overallTimeout, // strip out overall wait timeout, not used here
      pollInterval: _pollInterval,
      waitTimeout: _waitTimeout,
      maxRetries,
      isUpload,
      webhook: _webhook,
      ...fetchOptions
    } = options;

    const perRequestTimeoutSeconds = this.requestTimeout;
    const timeout = perRequestTimeoutSeconds * 1000;
    const method = (fetchOptions.method || 'GET').toUpperCase();

    fetchOptions.headers = this.getHeaders(isUpload, fetchOptions.headers);

    const maxRetriesVal = maxRetries ?? 3;
    const initialBackoff = 1000;
    let retryCount = 0;

    const shouldRetry = (response: Response): boolean => {
      return response.status === 429 || (method === 'GET' && response.status >= 500);
    };

    while (true) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const url = this.buildUrl(path);
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        });

        if (response.ok || !shouldRetry(response) || retryCount >= maxRetriesVal) {
          return response;
        }

        retryCount++;
        const backoffTime = this._getBackoffTime(retryCount, initialBackoff);
        if (typeof console !== 'undefined') {
          console.warn(`Request failed with status ${response.status}. Retrying (${retryCount}/${maxRetriesVal}) in ${Math.round(backoffTime)}ms...`);
        }
        await new Promise((resolve) => setTimeout(resolve, backoffTime));
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'AbortError' || error.name === 'TypeError') &&
          retryCount < maxRetriesVal &&
          method === 'GET'
        ) {
          retryCount++;
          const backoffTime = this._getBackoffTime(retryCount, initialBackoff);
          if (typeof console !== 'undefined') {
            console.warn(`Request failed with error: ${error.message}. Retrying (${retryCount}/${maxRetriesVal}) in ${Math.round(backoffTime)}ms...`);
          }
          await new Promise((resolve) => setTimeout(resolve, backoffTime));
        } else {
          throw error;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Calculate backoff time with exponential backoff and jitter
   * @param retryCount Current retry attempt number
   * @param initialBackoff Initial backoff time in ms
   * @returns Backoff time in ms
   * @private
   */
  _getBackoffTime(retryCount: number, initialBackoff: number): number {
    const backoff = initialBackoff * Math.pow(2, retryCount);
    // Add jitter (random value between 0 and backoff/2)
    return backoff + Math.random() * (backoff / 2);
  }

  /**
   * Generate an image and wait for the result
   * 
   * @param modelId Model ID to use for prediction
   * @param input Input parameters for the prediction
   * @param options Additional fetch options
   */
  async run(modelId: string, input: Record<string, any>, options?: RunOptions): Promise<Prediction> {
    const prediction = await this.create(modelId, input, options);
    const pollInterval = options?.pollInterval ?? this.pollInterval;
    const waitTimeout = options?.timeout ?? this.timeout;
    return prediction.wait(pollInterval, waitTimeout);
  }

  /**
   * Create a prediction without waiting for it to complete
   * 
   * @param modelId Model ID to use for prediction
   * @param input Input parameters for the prediction
   * @param options Additional fetch options
   */
  async create(modelId: string, input: Record<string, any>, options?: InternalRequestOptions): Promise<Prediction> {
    let path = `${modelId}`;
    if (options?.webhook) {
      path += `?webhook=${options.webhook}`;
    }

    const response = await this.fetchWithTimeout(path, {
      method: 'POST',
      body: JSON.stringify(input),
      ...options,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create prediction: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    if (data.code !== 200) {
      throw new Error(`Failed to create prediction: ${data.code} ${data}`);
    }
    return new Prediction(data.data, this);
  }

  /**
   * Upload a file (binary) to the /media/upload/binary endpoint
   * @param filePath Absolute path to the file to upload
   * @returns The API response JSON
   */
  /**
   * Upload a file (binary) to the /media/upload/binary endpoint (browser Blob version)
   * @param file Blob to upload
   * @returns The API response JSON
   */
  async upload(filePath: string): Promise<string> {
    // Align with Python: accept file path (Node environment)
    let fs: any;
    let path: any;
    try {
      fs = require('fs');
      path = require('path');
    } catch (err) {
      throw new Error('File path uploads are only supported in Node environments.');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const data = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const form = new FormData();
    const blob = new Blob([data]);
    form.append('file', blob, filename);
    // Ensure upload headers; browser will set Content-Type
    const uploadOptions: InternalRequestOptions = { isUpload: true };
    const response = await this.fetchWithTimeout('media/upload/binary', {
      method: 'POST',
      body: form,
      ...uploadOptions
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload file: ${response.status} ${errorText}`);
    }
    const resp: UploadFileResp = await response.json();
    return resp.data.download_url
  }
}



// Export default and named exports for different import styles
export default WaveSpeed;

// Add browser global for UMD-style usage
if (typeof window !== 'undefined') {
  (window as any).WaveSpeed = WaveSpeed;
}
