/**
 * WaveSpeed JavaScript/TypeScript Client — Official JavaScript/TypeScript SDK for the WaveSpeed inference platform.
 *
 * This library provides a clean, unified, and high-performance API integration layer for your applications.
 * Effortlessly connect to all WaveSpeed models and inference services with zero infrastructure overhead.
 *
 * Example usage:
 *     import wavespeed from 'wavespeed';
 *
 *     const output = await wavespeed.run(
 *         "wavespeed-ai/z-image/turbo",
 *         { prompt: "A beautiful sunset" }
 *     );
 *     console.log(output["outputs"][0]);
 */

// Import version
import { version } from './version';

// Import config to auto-load environment variables
import './config';

// Import API client
import { Client, run, upload } from './api';
import type { RunOptions, RunDetail, RunNoThrowResult } from './api/client';
import { 
  WavespeedException, 
  WavespeedTimeoutException, 
  WavespeedSyncTimeoutException,
  WavespeedConnectionException,
  WavespeedSubmissionException,
  WavespeedPredictionException, 
  WavespeedUnknownException 
} from './api';

export { version, Client, run, upload };
export type { RunOptions, RunDetail, RunNoThrowResult };
export { 
  WavespeedException, 
  WavespeedTimeoutException, 
  WavespeedSyncTimeoutException,
  WavespeedConnectionException,
  WavespeedSubmissionException,
  WavespeedPredictionException, 
  WavespeedUnknownException 
};

// Default export (Client class)
export default Client;
