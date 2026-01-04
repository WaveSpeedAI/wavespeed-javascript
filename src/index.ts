/**
 * WaveSpeedAI JavaScript/TypeScript Client — Official JavaScript/TypeScript SDK for WaveSpeedAI inference platform.
 *
 * This library provides a clean, unified, and high-performance API integration layer for your applications.
 * Effortlessly connect to all WaveSpeedAI models and inference services with zero infrastructure overhead.
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
import type { RunOptions } from './api/client';

export { version, Client, run, upload };
export type { RunOptions };

// Default export (Client class)
export default Client;
