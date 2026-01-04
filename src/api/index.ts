/**
 * WaveSpeed API client module.
 *
 * Provides a simple interface to run WaveSpeed AI models.
 *
 * Example usage:
 *     import wavespeed from 'wavespeed';
 *
 *     const output = await wavespeed.run(
 *         "wavespeed-ai/z-image/turbo",
 *         { prompt: "A beautiful sunset over mountains" }
 *     );
 *
 *     console.log(output["outputs"][0]);  // First output URL
 *
 *     // Upload a file
 *     const url = await wavespeed.upload("/path/to/image.png");
 *     console.log(url);
 */

import { Client } from './client';
import type { RunOptions } from './client';

export { Client };
export type { RunOptions };

// Default client instance
let _defaultClient: Client | null = null;

/**
 * Get or create the default client instance.
 */
function _getDefaultClient(): Client {
  if (_defaultClient === null) {
    _defaultClient = new Client();
  }
  return _defaultClient;
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
 *     options.maxRetries: Maximum retries for this request (overrides default setting).
 *
 * Returns:
 *     Dict containing "outputs" array with model outputs.
 *
 * Throws:
 *     Error: If API key is not configured.
 *     Error: If the prediction fails.
 *     Error: If the prediction times out.
 *
 * Example:
 *     const output = await run(
 *         "wavespeed-ai/z-image/turbo",
 *         { prompt: "A cat sitting on a windowsill" }
 *     );
 *     console.log(output["outputs"][0]);  // First output URL
 *
 *     // With sync mode
 *     const output2 = await run(
 *         "wavespeed-ai/z-image/turbo",
 *         { prompt: "A cat" },
 *         { enableSyncMode: true }
 *     );
 *
 *     // With retry
 *     const output3 = await run(
 *         "wavespeed-ai/z-image/turbo",
 *         { prompt: "A cat" },
 *         { maxRetries: 3 }
 *     );
 */
export async function run(
  model: string,
  input?: Record<string, any>,
  options?: RunOptions
): Promise<Record<string, any>> {
  return _getDefaultClient().run(model, input, options);
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
 *     const url = await upload("/path/to/image.png");
 *     console.log(url);
 */
export async function upload(
  file: string,
  options?: { timeout?: number }
): Promise<string> {
  return _getDefaultClient().upload(file, options);
}
